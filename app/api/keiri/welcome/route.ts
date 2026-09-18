import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabaseServer";
import {
  checkWelcomeInput,
  generateAdminPassword,
  hashSecret,
  tenantBusinessCode,
} from "@/lib/keiri/tenants";

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

  const supabase = serverClient();

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
    return NextResponse.json(
      { ok: false, message: "このリンクは使えません。申し込み完了の画面から開き直してください。" },
      { status: 404 },
    );
  }

  if (tenant.status !== "pending") {
    return NextResponse.json(
      {
        ok: false,
        message: "このお店の初回設定はもう終わっています。合言葉を忘れた場合は「困ったとき」からご連絡ください。",
      },
      { status: 409 },
    );
  }

  const adminPassword = generateAdminPassword();

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
    // ここで止めずに、あとで入れ直す約束だけ返す。
    console.error("[経理 初回設定] 設定の行を作れませんでした：", setErr.message);
    return NextResponse.json({
      ok: true,
      adminPassword,
      // このブラウザを「このお店」として覚えるための番号（日報と経理画面の絞り込みに使う）
      tenantId: String(tenant.id),
      // ★お店の行はできているので、日報は今日から打てる。
      //   ここで止めない。ただし「管理画面から入れ直して」とは案内しない
      //   （数え始めの日と手元の現金の画面は、まだ手羽屋ぶんしか無いため）。
      warning:
        "数え始めの日と手元の現金だけ、こちらで入れます。「困ったとき」からご一報ください（日報は今日から打てます）。",
    });
  }

  return NextResponse.json({ ok: true, adminPassword, tenantId: String(tenant.id) });
}
