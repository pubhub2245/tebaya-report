import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { probePublicRead } from "@/lib/keiri/photoProbe";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";
import { judgeReceiptUpload } from "@/lib/receiptUploadGate";
import { TEBAYA_SCOPE } from "@/lib/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/keiri/photo-gate
 *
 * 「**よそのお店のレシート写真を、いま置き場に置いてよいか**」を答える窓口（f3-4・2026-10-27）。
 *
 * ■ なぜ要るのか
 *   レシート写真の置き場は、いまも公開の設定です（鍵 kp241 待ち）。
 *   いっぽう2軒目のお店の行は、鍵が無くても倉庫の貼り紙だけで作れます。
 *   ＝ **鍵より先に貼り紙が流れると、よその店の本物のレシートが
 *   公開のままの置き場に入ってしまいます。** そこを閉めるための門です。
 *
 * ■ 返すもの
 *   ・置き場が公開のままか（写真は1枚も読みません。でたらめな住所を鍵なしでたたいて見分けます）
 *   ・手羽屋のとき／よその店のときの、それぞれの答えと理由
 *
 * ★1枚も写真を読みません。1行も書き込みません。
 * ★写真の住所・金額・お店の名前・鍵や合言葉の値は1文字も返しません。
 * ★手羽屋の日報・シフト・レジ・LINE には一切触れていません。
 */
export async function GET() {
  const publicCheck = await probePublicRead();
  const tebaya = judgeReceiptUpload(TEBAYA_SCOPE, publicCheck.open);
  const other = judgeReceiptUpload("00000000-0000-4000-8000-000000000000", publicCheck.open);

  const body = {
    bucket: RECEIPT_BUCKET,
    bucketPublic: publicCheck.open,
    publicCheck,
    tebaya,
    otherShop: other,
    /** 画面側が実際に使うのはこの1つ（よその店のとき置けるか） */
    allowOtherShopUpload: other.allowed,
    summary: other.allowed
      ? "置き場は非公開です。よそのお店の写真も置き場に置きます"
      : `よそのお店の写真は、いまは置き場に置きません（${other.reason}）`,
    how:
      "手羽屋（印が空）の写真は、この窓口に聞きにも行かず、今までどおり置き場に置きます。" +
      "よそのお店の写真だけが、ここの答えで止まります",
    check: "f3-4",
  };
  return NextResponse.json(stampCheckWindow(body), { headers: CHECK_WINDOW_HEADERS });
}
