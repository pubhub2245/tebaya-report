import { NextRequest, NextResponse } from "next/server";

import { serverClient, serviceClientOrNull } from "@/lib/supabaseServer";
import { normalizeTenantScope } from "@/lib/tenantScope";
import { decideShopNameAnswer } from "@/lib/keiri/shopName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「この番号のお店の名前は何か」だけを答える小さな窓口。
 *
 * 日報の画面（/report）の上に「〇〇の日報として保存します」と出すためだけに使います。
 * 返すのは **お店の名前1つ** だけで、合言葉・売上・日報は一切返しません。
 *
 * ■ 2026-10-18（f3-4・kp253）：2つ直しました
 *   ① **サーバー側の合鍵で聞く**ようにしました（前は公開の鍵だけで聞いていました）。
 *      お店の棚は鍵がかかっていて読む決まりが1本も無いので、公開の鍵では
 *      **エラーではなく「0件」** で返り、在るお店まで「ありません」になっていました。
 *   ② 公開の鍵で聞いて0件だったときは、**「無い」と言い切らず**
 *      「いま確かめられません」と正直に答えます（lib/keiri/shopName.ts）。
 *   画面側は入室したときに名前を控えてあるので、ここが答えられなくても名前は出ます。
 */
export async function GET(req: NextRequest) {
  const id = normalizeTenantScope(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const service = serviceClientOrNull();
  const supabase = service ?? serverClient();
  const { data, error } = await supabase
    .from("keiri_tenants")
    .select("shop_name, status")
    .eq("id", id)
    .eq("status", "active")
    .limit(1);

  if (error) {
    console.error("[経理 お店の名前] お店を引けませんでした：", error.message);
  }

  const answer = decideShopNameAnswer({
    rows: (data as Array<{ shop_name?: unknown }> | null) ?? null,
    error: error ? { message: error.message } : null,
    usedServiceKey: service !== null,
  });

  if (answer.ok) {
    return NextResponse.json({ ok: true, shopName: answer.shopName });
  }
  return NextResponse.json(
    { ok: false, unchecked: answer.unchecked, message: answer.message },
    { status: answer.status },
  );
}
