import { NextRequest, NextResponse } from "next/server";
import { serverClient, serviceClientOrNull } from "@/lib/supabaseServer";
import {
  checkWelcomeInput,
  generateAdminPassword,
  hashSecret,
  tenantBusinessCode,
} from "@/lib/keiri/tenants";
import { activateTenantViaRpc } from "@/lib/keiri/tenantAccess";
import {
  KEIRI_PAID_PENDING_MESSAGE,
  isPaidPendingArrival,
  paidPendingApplicationRow,
  paidPendingNotificationText,
} from "@/lib/keiri/paidPending";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 経理パッケージの「初回設定」を受け取るところ。
 *
 * ■ 何をするか
 *   申し込んだお店が、最初に3つだけ入れます。
 *     ・お店の名前
 *     ・数え始めの日（この日から数字を出します）
 *     ・その日の手元の現金
 *   これを受け取って、そのお店ぶんの設定を1行作り、
 *   **管理画面に入るための合言葉をその場で作って1回だけ返します**。
 *
 * ■ 合言葉は倉庫に生のままでは置きません
 *   戻せない形（ハッシュ）だけを置きます。
 *   なくしたら作り直す（再発行）しかありません。画面にもそう書いてあります。
 *
 * ■ 手羽屋のデータは触りません
 *   書き込むのは keiri_tenants と、そのお店ぶんの keiri_settings の行だけです。
 *   手羽屋の設定（tenant_id が空の行）には一切触れません。
 *
 * ■ 支払いのリンクで先に払われた人を、行き止まりにしません（2026-09-19・kp95）
 *   Stripe の戻り先（?session=…）で来たのにお店の行が無いときは、
 *   「このリンクは使えません」ではなく
 *   「お手続きを確認しています。担当からすぐにご連絡します」と出し、
 *   スタッフの LINE へ知らせて、申し込みの控えに1行残します。
 *   ＝ **払ったのに誰も気づかない、という形を作りません。**
 *   ?t=（こちらが手で発行したリンク）で来たときは今までどおりです。
 *
 * ■ サーバー側の合鍵が壊れていても通ります（2026-09-19・kp93）
 *   お店の置き場には鍵が掛かっているので、合鍵が壊れている間（kp55）は
 *   ここが必ず「このリンクは使えません」になっていました。
 *   そこで、まず倉庫の窓口（keiri_tenant_activate）に頼み、
 *   窓口がまだ無いときだけ、今までどおり棚を直接さわります。
 *   ＝ 鍵が直っても、窓口を落としても、どちらでも動きます。
 */

type Body = {
  /** 初回設定の合言葉（URLの ?t=） */
  token?: unknown;
  /** 支払いの画面1回ぶんの番号（URLの ?session=） */
  session?: unknown;
  shopName?: unknown;
  openingDate?: unknown;
  openingBalance?: unknown;
};

/**
 * 数え始めの日と手元の現金だけ入らなかったときの案内。
 * お店の行はできているので日報は今日から打てる。ここで止めない。
 */
const SETTINGS_WARNING =
  "数え始めの日と手元の現金だけ、こちらで入れます。「困ったとき」からご一報ください（日報は今日から打てます）。";

/** リンクが違うとき */
function notFound() {
  return NextResponse.json(
    { ok: false, message: "このリンクは使えません。申し込み完了の画面から開き直してください。" },
    { status: 404 },
  );
}

/** もう初回設定が終わっているとき */
function alreadyDone() {
  return NextResponse.json(
    {
      ok: false,
      message: "このお店の初回設定はもう終わっています。合言葉を忘れた場合は「困ったとき」からご連絡ください。",
    },
    { status: 409 },
  );
}

/**
 * 支払いのリンクで先に払われた方が来たときの受け止め（kp95）。
 *
 * ■ 2つやる。どちらか通れば「担当からご連絡します」は嘘にならない
 *   ① スタッフの LINE グループへ知らせる（人が気づく道。こちらが本命）
 *   ② 申し込みの控えに1行残す（あとから一覧で追える道）
 *   ②の棚の決まりは source='form' だけを通す形なので、
 *   supabase/migrations/keiri_applications_paid_pending.sql を流すまでは静かに失敗する。
 *   どちらも失敗したときだけ、画面に「メールで1通お送りください」を出す。
 */
async function receivePaidPending(session: string, shopName: string) {
  const notify = async (): Promise<boolean> => {
    try {
      return await sendLineGroupMessage(paidPendingNotificationText({ session, shopName }));
    } catch (e) {
      console.error("[経理 初回設定] 先払いの知らせを送れませんでした", e);
      return false;
    }
  };

  const save = async (): Promise<boolean> => {
    try {
      const db = serviceClientOrNull() ?? serverClient();
      const { error } = await db
        .from("keiri_applications")
        .insert(paidPendingApplicationRow({ session, shopName }));
      if (error) {
        console.error(`[経理 初回設定] 先払いの控えを残せませんでした: ${error.message}`);
        return false;
      }
      return true;
    } catch (e) {
      console.error("[経理 初回設定] 先払いの控えを残せませんでした", e);
      return false;
    }
  };

  const [notified, saved] = await Promise.all([notify(), save()]);
  if (!notified && !saved) {
    console.error("[経理 初回設定] 先払いの知らせも控えも失敗しました");
  }

  // ★200番台で返す。これは「間違い」ではなく「お預かりした」状態なので、
  //   画面も赤い警告ではなく落ち着いた案内として出す。
  return NextResponse.json(
    { ok: false, pending: true, message: KEIRI_PAID_PENDING_MESSAGE, notified, saved, session },
    { status: 202 },
  );
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "入力を読み取れませんでした。" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  const session = String(body.session ?? "").trim();
  if (!token && !session) {
    return NextResponse.json(
      { ok: false, message: "このページを開くためのリンクが正しくありません。申し込み完了の画面から開き直してください。" },
      { status: 400 },
    );
  }

  const checked = checkWelcomeInput({
    shopName: body.shopName,
    openingDate: body.openingDate,
    openingBalance: body.openingBalance,
  });
  if (!checked.ok) {
    return NextResponse.json({ ok: false, message: checked.message }, { status: 400 });
  }

  const adminPassword = generateAdminPassword();

  // ① まず倉庫の窓口に頼む（サーバー側の合鍵が壊れていても通る道）
  const viaRpc = await activateTenantViaRpc(serverClient(), {
    token,
    session,
    shopName: checked.value.shopName,
    openingDate: checked.value.openingDate,
    openingBalance: checked.value.openingBalance,
    adminPasswordHash: hashSecret(adminPassword),
  });

  if (viaRpc.outcome === "ok") {
    return NextResponse.json({
      ok: true,
      adminPassword,
      tenantId: viaRpc.tenantId,
      ...(viaRpc.settingsOk ? {} : { warning: SETTINGS_WARNING }),
    });
  }
  if (viaRpc.outcome === "not_found") {
    // 支払いのリンクで先に払われた方なら、行き止まりにしない（kp95）
    if (isPaidPendingArrival({ token, session })) {
      return receivePaidPending(session, checked.value.shopName);
    }
    return notFound();
  }
  if (viaRpc.outcome === "already") return alreadyDone();

  // ② 窓口がまだ無いとき（または呼べなかったとき）は、今までどおり棚を直接さわる
  const supabase = serviceClientOrNull() ?? serverClient();

  // どのお店の初回設定かを、長い合言葉で1軒だけ引く
  const query = supabase.from("keiri_tenants").select("id, status").limit(1);
  const { data, error } = token
    ? await query.eq("setup_token", token)
    : await query.eq("external_session_id", session);

  if (error) {
    console.error("[経理 初回設定] お店を引けませんでした：", error.message);
    return NextResponse.json(
      { ok: false, message: "いま込み合っています。少し待ってからもう一度お試しください。" },
      { status: 500 },
    );
  }

  const tenant = data?.[0];
  if (!tenant) {
    // 支払いのリンクで先に払われた方なら、行き止まりにしない（kp95）
    if (isPaidPendingArrival({ token, session })) {
      return receivePaidPending(session, checked.value.shopName);
    }
    return notFound();
  }
  if (tenant.status !== "pending") return alreadyDone();

  const { error: upErr } = await supabase
    .from("keiri_tenants")
    .update({
      shop_name: checked.value.shopName,
      admin_password_hash: hashSecret(adminPassword),
      status: "active",
      activated_at: new Date().toISOString(),
    })
    .eq("id", tenant.id)
    // ★ もう一度押されても2回目は当たらない（すでに pending ではないため）
    .eq("status", "pending");

  if (upErr) {
    console.error("[経理 初回設定] 保存に失敗：", upErr.message);
    return NextResponse.json(
      { ok: false, message: "保存できませんでした。もう一度お試しください。" },
      { status: 500 },
    );
  }

  const { error: setErr } = await supabase.from("keiri_settings").insert({
    tenant_id: tenant.id,
    // ★このお店だけの業態コード。付けないと既定値の 'tebaya' になり、
    //   手羽屋の行とぶつかって、この行が1行も作れない（入れた数字が消える）
    business_type_code: tenantBusinessCode(String(tenant.id)),
    opening_date: checked.value.openingDate,
    opening_balance: checked.value.openingBalance,
    // 外注費・家賃は、そのお店で使うときに管理画面から入れてもらう
    outsourcing_rate: 0,
    monthly_rent: 0,
    rent_start_month: checked.value.openingDate.slice(0, 7),
  });

  if (setErr) {
    // 設定の行だけ作れなかった場合。お店の行はできているので日報は打てる。
    console.error("[経理 初回設定] 設定の行を作れませんでした：", setErr.message);
    return NextResponse.json({
      ok: true,
      adminPassword,
      // このブラウザを「このお店」として覚えるための番号（日報と経理画面の絞り込みに使う）
      tenantId: String(tenant.id),
      warning: SETTINGS_WARNING,
    });
  }

  return NextResponse.json({ ok: true, adminPassword, tenantId: String(tenant.id) });
}
