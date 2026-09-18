import { NextRequest, NextResponse } from "next/server";

import { serverClient } from "@/lib/supabaseServer";
import { normalizeTenantScope } from "@/lib/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「この番号のお店の名前は何か」だけを答える小さな窓口。
 *
 * 日報の画面（/report）の上に「〇〇の日報として保存します」と出すためだけに使います。
 * 返すのは **お店の名前1つ** だけで、合言葉・売上・日報は一切返しません。
 */
export async function GET(req: NextRequest) {
  const id = normalizeTenantScope(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = serverClient();
  const { data, error } = await supabase
    .from("keiri_tenants")
    .select("shop_name, status")
    .eq("id", id)
    .eq("status", "active")
    .limit(1);

  if (error || !data?.[0]) return NextResponse.json({ ok: false }, { status: 404 });

  return NextResponse.json({ ok: true, shopName: (data[0] as any).shop_name ?? null });
}
