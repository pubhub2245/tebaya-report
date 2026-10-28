import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import {
  PHOTO_LOCK_HOW,
  PHOTO_LOCK_STEP,
  photoLockHeadline,
  photoLockWhy,
} from "@/lib/keiri/photoLock";
import { photoLockStatus } from "@/lib/keiri/photoLockServer";
import { runPhotoLock } from "@/lib/keiri/photoLockRun";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";
import { RECEIPT_VIEW_PATH } from "@/lib/receiptViewUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * /api/keiri/photo-lock … レシート写真の置き場を「閉める」最後の1手（f3-4・2026-10-26）
 *
 *   GET  … 閉められるか・もう閉まっているかを**読むだけ**で返す（1行も変えません）
 *   POST … 置き場を**非公開**にする（押すのは1回だけ。中身は固定で、外から指定できません）
 *
 * ■ なぜ要るのか（やさしい説明。詳しくは lib/keiri/photoLock.ts）
 *   置き場はいま「公開」で、住所を知っていれば合言葉なしで1枚ずつ開けます。
 *   画面を窓口ごしにする工事（①②）は済んでいて、残るのは「置き場を閉める」1手だけ。
 *   ところがその1手が**どこにも用意されていなかった**ので、じゅんが鍵を直しても
 *   仕上げの ③（f3-4）は閉まらず、次の回に もう一度 お願いすることになっていました。
 *   ここに置くと、鍵を直したその場の1押しで終わります。
 *
 * ■ 安全（この順でしか閉めません）
 *   1) サーバー側の鍵が使えること
 *   2) 閉める前に、期限つきの住所で写真が1枚 読めること（写真が無ければこの確かめは省きます）
 *   3) 置き場の設定を1つだけ変える（1枚5MB・画像だけの制限は、読んだ値をそのまま書き戻す）
 *   4) 閉めたあと、もう一度 読めること。読めなければ**その場で元に戻す**
 *
 * ★写真の中身・住所・お店の名前・鍵や合言葉の値は1文字も返しません。
 * ★手羽屋の日報・シフト・レジ・LINE には一切触れていません（倉庫の棚も1行も変えません）。
 */

export async function GET() {
  const status = await photoLockStatus();
  return NextResponse.json(
    stampCheckWindow({
      what: "レシート写真の置き場を閉められるか（閉めるのは POST で1回だけ）",
      state: status.state,
      headline: photoLockHeadline(status.state),
      why: photoLockWhy(status.state),
      bucket: RECEIPT_BUCKET,
      bucketPublic: status.bucketPublic,
      howMeasured: status.howMeasured,
      keyUsable: status.keyUsable,
      viewWindow: RECEIPT_VIEW_PATH,
      step: PHOTO_LOCK_STEP,
      press:
        status.state === "ready"
          ? "POST /api/keiri/photo-lock（画面の［レシート写真の置き場を閉める］）"
          : null,
      checks: ["f3-4"],
      how: PHOTO_LOCK_HOW,
    }),
    { headers: CHECK_WINDOW_HEADERS },
  );
}

export async function POST() {
  // ★2026-10-28：手順そのものは lib/keiri/photoLockRun.ts に移しました
  //   （毎日の自動の処理からも同じ手順を呼ぶため。中身は1文字も変えていません）。
  const { outcome, steps } = await runPhotoLock();
  return NextResponse.json(
    stampCheckWindow({
      ...outcome,
      steps,
      bucket: RECEIPT_BUCKET,
      checks: ["f3-4"],
      how: PHOTO_LOCK_HOW,
    }),
    {
      status: steps.keyUsable ? (outcome.ok ? 200 : 409) : 503,
      headers: CHECK_WINDOW_HEADERS,
    },
  );
}
