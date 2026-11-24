import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "@line/bot-sdk";

import { serverClient, serviceClientOrNull, tidyPastedValue } from "@/lib/supabaseServer";
import { groupMembershipChanges } from "@/lib/line/lineBots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * お店の中の連絡用 公式LINE「手羽屋 ばあちゃんち」の受け口（2026-11-24）。
 * やることは「どのグループに入っているか」を控えるだけ。返事・転送・会話の保存はしない。
 * LINE には必ず 200 を返す（署名不一致 403・合言葉未設定 500 だけ例外。→ CLAUDE.md 4-16 と同じ考え方）。
 */

export async function GET() {
  return NextResponse.json({ status: "OK" });
}

export async function POST(req: NextRequest) {
  const secret = tidyPastedValue(process.env.LINE_SHOP_CHANNEL_SECRET ?? "");
  if (!secret) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const bodyText = await req.text();
  if (!validateSignature(bodyText, secret, req.headers.get("x-line-signature") || "")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }
  try {
    const events = JSON.parse(bodyText || "{}")?.events ?? [];
    const { joined, left } = groupMembershipChanges(events);
    const db = serviceClientOrNull() ?? serverClient();
    if (joined.length) {
      await db
        .from("line_shop_groups")
        .upsert(joined.map((group_id) => ({ group_id, is_active: true })), { onConflict: "group_id" });
    }
    if (left.length) {
      await db.from("line_shop_groups").update({ is_active: false }).in("group_id", left);
    }
  } catch (err) {
    console.error("[LINE shop webhook]", err);
  }
  return NextResponse.json({ ok: true });
}
