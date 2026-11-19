import { NextRequest, NextResponse } from "next/server";

import { serverClient } from "@/lib/supabaseServer";
import { hashSecret } from "@/lib/keiri/tenants";
import { photoShopFor } from "@/lib/photoShop";
import { setStaffCodeViaDb, validStaffCode } from "@/lib/photoShopStaffCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * スタッフ用の合言葉を変える窓口（2026-11-19）。
 * 店主の合言葉が合ったときだけ変わる（確かめるのは倉庫の窓口 photo_shop_set_staff_code）。
 * 打った文字そのものは保存しない（戻せない形だけを倉庫へ送る）。返事は「変わった／変わらなかった」だけ。
 */
export async function POST(req: NextRequest) {
  let body: { tenantId?: unknown; ownerPassword?: unknown; newCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "入力を読み取れませんでした。" }, { status: 400 });
  }
  const shop = photoShopFor(String(body.tenantId ?? ""));
  const owner = String(body.ownerPassword ?? "").trim();
  const code = String(body.newCode ?? "").trim();
  if (!shop) return NextResponse.json({ ok: false, message: "このお店では変えられません。" }, { status: 400 });
  if (!validStaffCode(code)) {
    return NextResponse.json(
      { ok: false, message: "新しい合言葉は、半角の数字か英字で4〜12文字にしてください。" },
      { status: 400 },
    );
  }
  if (!owner || owner.length > 200) {
    return NextResponse.json({ ok: false, message: "店主の合言葉が違います。" }, { status: 401 });
  }
  const ok = await setStaffCodeViaDb(serverClient(), shop.tenantId, hashSecret(owner), hashSecret(code));
  if (!ok) return NextResponse.json({ ok: false, message: "店主の合言葉が違います。" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
