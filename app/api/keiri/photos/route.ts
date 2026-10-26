import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { probePhotoShelf } from "@/lib/keiri/photoProbe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/keiri/photos
 *
 * 「**レシート写真の置き場**が、お店ごとに分かれているか」を**読むだけ**で確かめる窓口
 * （f3-4・2026-10-26）。
 *
 * ■ なぜ要るのか
 *   お店ごとに分ける工事は、ずっと棚（テーブル）だけを見てきました。
 *   経理の記録には、棚ではない置き場が1つあります。**レシート写真**です（CLAUDE.md 4-7）。
 *   写真はその店の経理そのものなので、ここが分かれていなければ f3-4 は閉まりません。
 *
 * ■ 読み方が逆です（/api/keiri/copies の⑦と同じ）
 *   **一覧が読めてしまったら、まだ開いています。**だから必ず公開の鍵で聞きます。
 *   「0件」は鍵が効いているときも、置き場が空のときも返るので、
 *   写真が1枚でもあると数えられた時だけ「閉まっている」と言います。
 *
 * ★1枚も写真を読みません。1行も書き込みません。
 * ★写真の住所・金額・お店の名前・鍵や合言葉の値は1文字も返しません。
 * ★手羽屋の日報・シフト・レジ・LINE には一切触れていません。
 */
export async function GET() {
  const report = await probePhotoShelf();
  return NextResponse.json(stampCheckWindow(report), { headers: CHECK_WINDOW_HEADERS });
}
