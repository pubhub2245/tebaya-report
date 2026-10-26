import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import {
  PHOTO_LOCK_HOW,
  PHOTO_LOCK_STEP,
  describePhotoLock,
  photoLockHeadline,
  photoLockWhy,
  type PhotoLockSteps,
} from "@/lib/keiri/photoLock";
import {
  photoLockStatus,
  readBucket,
  serverKeyUsable,
  type BucketInfo,
} from "@/lib/keiri/photoLockServer";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";
import { RECEIPT_VIEW_PATH } from "@/lib/receiptViewUrl";
import { noStoreFetch, serviceClientOrNull } from "@/lib/supabaseServer";

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

/** 期限つきの住所が生きている時間（秒）。/api/receipt-photo と同じ */
const SIGN_SECONDS = 60;

/** 確かめに使う写真を探すとき、1か所で見る数の上限 */
const LIST_LIMIT = 50;

/**
 * 確かめに使える写真を1枚だけ探す（名前は返しません）。
 * 置き場の中は `<フォルダ>/<年-月>/<でたらめな名前>` の3段なので、3段だけ降ります。
 */
async function findOnePhoto(db: SupabaseClient, folder = "", depth = 0): Promise<string | null> {
  if (depth > 2) return null;
  const { data, error } = await db.storage.from(RECEIPT_BUCKET).list(folder, { limit: LIST_LIMIT });
  if (error || !Array.isArray(data)) return null;
  // ファイルは id を持ち、フォルダは id が空（Supabase の決まり）
  const file = data.find((e) => (e as { id?: string | null }).id);
  if (file?.name) return folder ? `${folder}/${file.name}` : file.name;
  for (const entry of data) {
    if ((entry as { id?: string | null }).id) continue;
    if (!entry?.name) continue;
    const found = await findOnePhoto(db, folder ? `${folder}/${entry.name}` : entry.name, depth + 1);
    if (found) return found;
  }
  return null;
}

/** 期限つきの住所を作って、本当に1枚 読めるかを確かめる（中身は捨てます） */
async function signedReadWorks(db: SupabaseClient, path: string): Promise<boolean> {
  const { data } = await db.storage.from(RECEIPT_BUCKET).createSignedUrl(path, SIGN_SECONDS);
  if (!data?.signedUrl) return false;
  try {
    const res = await noStoreFetch(data.signedUrl);
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    await res.arrayBuffer();
    return /^image\//i.test(type);
  } catch {
    return false;
  }
}

/** 置き場の公開・非公開を切り替える（制限は読んだ値をそのまま書き戻す） */
async function setBucketPublic(
  db: SupabaseClient,
  info: BucketInfo,
  isPublic: boolean,
): Promise<boolean> {
  const { error } = await db.storage.updateBucket(RECEIPT_BUCKET, {
    public: isPublic,
    fileSizeLimit: info.fileSizeLimit,
    allowedMimeTypes: info.mimes,
  });
  return !error;
}

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
  const keyUsable = serverKeyUsable();
  const steps: PhotoLockSteps = {
    keyUsable,
    bucketWasPublic: null,
    sampleFound: false,
    signedBefore: null,
    closed: false,
    publicAfter: null,
    signedAfter: null,
    rolledBack: false,
  };

  const db = keyUsable ? serviceClientOrNull({ fresh: true }) : null;
  if (!db) {
    const outcome = describePhotoLock({ ...steps, keyUsable: false });
    return NextResponse.json(
      stampCheckWindow({ ...outcome, steps, bucket: RECEIPT_BUCKET, checks: ["f3-4"], how: PHOTO_LOCK_HOW }),
      { status: 503, headers: CHECK_WINDOW_HEADERS },
    );
  }

  const info = await readBucket(db);
  steps.bucketWasPublic = info.isPublic;

  if (info.isPublic === true) {
    // 1) 閉める前の確かめ（写真が1枚でもあるときだけ）
    const sample = await findOnePhoto(db);
    steps.sampleFound = Boolean(sample);
    if (sample) steps.signedBefore = await signedReadWorks(db, sample);

    if (!sample || steps.signedBefore === true) {
      // 2) 置き場の設定を1つだけ変える
      steps.closed = await setBucketPublic(db, info, false);
      if (steps.closed) {
        const after = await readBucket(db);
        steps.publicAfter = after.isPublic;
        // 3) 閉めたあとも読めるか。読めなければ その場で元に戻す
        if (sample) {
          steps.signedAfter = await signedReadWorks(db, sample);
          if (steps.signedAfter === false) {
            steps.rolledBack = await setBucketPublic(db, info, true);
          }
        }
      }
    }
  }

  const outcome = describePhotoLock(steps);
  return NextResponse.json(
    stampCheckWindow({
      ...outcome,
      steps,
      bucket: RECEIPT_BUCKET,
      checks: ["f3-4"],
      how: PHOTO_LOCK_HOW,
    }),
    { status: outcome.ok ? 200 : 409, headers: CHECK_WINDOW_HEADERS },
  );
}
