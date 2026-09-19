import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { serverClient, serviceClientOrNull } from "@/lib/supabaseServer";
import { hashSecret } from "@/lib/keiri/tenants";
import { normalizeTenantScope } from "@/lib/tenantScope";
import { loginTenantViaRpc } from "@/lib/keiri/tenantAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 経理の画面に入るときの「合言葉の確認」を、サーバー側でする所（kp39）。
 *
 * ■ なぜ要るのか
 *   経理パッケージを申し込んだお店には、初回設定の最後に
 *   「管理画面に入るための合言葉」を1回だけ画面に出しています
 *   （倉庫には戻せない形＝ハッシュだけを置いています）。
 *   ところが、その合言葉を確かめる場所がアプリのどこにも無く、
 *   **払った店主は、控えた合言葉を入れても必ずはじかれる**状態でした。
 *   ここがその「確かめる場所」です。
 *
 * ■ 手羽屋の入り方は変えていません
 *   手羽屋の合言葉は、いままでどおりブラウザの中で先に確かめます
 *   （app/components/AdminGate.tsx）。そこで合えば、この窓口は呼ばれません。
 *   ここに来るのは「ブラウザの中では合わなかった」ときだけです。
 *   念のためこちらでも手羽屋の合言葉を受け付けます
 *   （設定が片方にしか無いときでも、手羽屋が締め出されないようにするため）。
 *
 * ■ 返さないもの
 *   合言葉そのもの・ハッシュ・他のお店のことは返しません。
 *   合わなかったときは「違います」しか返しません
 *   （「そのお店は無い」と返すと、お店がある／無いが外から分かってしまうため）。
 *
 * ■ サーバー側の合鍵が壊れていても通ります（2026-09-19・kp93）
 *   お店の置き場には鍵が掛かっているので、合鍵が壊れている間（kp55）は
 *   払った店主が **必ず**「パスワードが違います」になっていました。
 *   そこで、まず倉庫の窓口（keiri_tenant_login）に聞き、
 *   窓口がまだ無いときだけ、今までどおり棚を直接さわります。
 */

type Body = { password?: unknown };

/** 中身を推測されないように、長さが同じなら時間が変わらない比べ方をする */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** 合わなかったときの返事。理由は1つに揃える */
function denied() {
  return NextResponse.json({ ok: false, message: "パスワードが違います" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "入力を読み取れませんでした。" }, { status: 400 });
  }

  const password = String(body.password ?? "").trim();
  if (!password || password.length > 200) return denied();

  // ① 手羽屋の合言葉（Vercel に入れてある1つ）
  const tebaya = (process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "").trim();
  if (tebaya && sameSecret(password, tebaya)) {
    // 手羽屋は印を持たないお店。tenantId は返さない
    return NextResponse.json({ ok: true, scope: "tebaya" });
  }

  // ② 申し込んだお店の合言葉（戻せない形で倉庫に置いてある）
  const passwordHash = hashSecret(password);

  // まず倉庫の窓口に聞く（サーバー側の合鍵が壊れていても通る道）
  const viaRpc = await loginTenantViaRpc(serverClient(), passwordHash);
  if (viaRpc.ok) {
    const tenantId = normalizeTenantScope(viaRpc.tenant?.tenantId);
    if (!viaRpc.tenant || !tenantId) return denied();
    return NextResponse.json({
      ok: true,
      scope: "tenant",
      tenantId,
      shopName: viaRpc.tenant.shopName,
    });
  }

  // 窓口がまだ無いとき（または呼べなかったとき）は、今までどおり棚を直接さわる
  const supabase = serviceClientOrNull() ?? serverClient();
  const { data, error } = await supabase
    .from("keiri_tenants")
    .select("id, shop_name, status")
    .eq("admin_password_hash", passwordHash)
    .eq("status", "active")
    .limit(1);

  if (error) {
    // 置き場がまだ無い／鍵が壊れている、など。
    // ここで 500 を返すと「合言葉は合っていたのかも」と分かってしまうので、
    // 記録だけ残して「違います」と同じ返事にする。
    console.error("[経理 ログイン] お店を引けませんでした：", error.message);
    return denied();
  }

  const tenant = data?.[0];
  const tenantId = normalizeTenantScope(tenant?.id);
  if (!tenant || !tenantId) return denied();

  return NextResponse.json({
    ok: true,
    scope: "tenant",
    tenantId,
    shopName: (tenant as any).shop_name ?? null,
  });
}
