import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { PHOTO_MARKER_HOW, PHOTO_MARKER_PATH } from "@/lib/keiri/photoMarker";
import { markAndCheck } from "@/lib/keiri/photoMarkerProbe";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/keiri/photo-mark
 *
 * 「**レシート写真の置き場の一覧**は、本当に閉まっているのか」を
 * **サーバー側の鍵なしで**確かめる窓口（f3-4・2026-10-27）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   倉庫は、一覧を読む許可が無いとき**エラーではなく「0件」**で返します。
 *   置き場が空っぽのときも「0件」です。＝ 外から見分けられないので、
 *   /api/keiri/photos の答えはずっと「分かりません」のままでした。
 *   そこで置き場に **中身の無い目印の画像1枚だけ**を置き、
 *   それが一覧に出てこないことで「閉まっている」と言えるようにします。
 *
 * ★書き込むのは目印の画像1枚だけです（1×1の透明な点・68バイト）。
 *   すでにあるときは1行も書き込みません。
 * ★本物のレシート・日報・経費・申し込みの行には1件も触りません。
 *   手羽屋の写真は消しません・動かしません。
 * ★写真の住所・金額・お店の名前・鍵や合言葉の値は1文字も返しません
 *   （目印の住所だけは決め打ちなので返します。開いても透明な点1つです）。
 * ★手羽屋の日報・シフト・レジ・LINE には一切触れていません。
 */
export async function GET() {
  const verdict = await markAndCheck();
  return NextResponse.json(
    stampCheckWindow({
      bucket: RECEIPT_BUCKET,
      marker: verdict.marker,
      markerPath: PHOTO_MARKER_PATH,
      listed: verdict.listed,
      listable: verdict.listable,
      summary: verdict.note,
      wrote:
        verdict.marker === "placed"
          ? "目印の画像1枚を置きました（本物のレシートではありません）"
          : "1行も書き込んでいません",
      how: PHOTO_MARKER_HOW,
      check: "f3-4",
    }),
    { headers: CHECK_WINDOW_HEADERS },
  );
}
