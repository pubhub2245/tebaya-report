/**
 * レシート写真の置き場を「閉める」実際の手順（f3-4・2026-10-28）。
 *
 * ■ なぜ別のファイルに出したか
 *   これまでこの手順は窓口（app/api/keiri/photo-lock/route.ts）の中にだけあり、
 *   **じゅんが画面のボタンを1回 押さないと動かない**形でした。
 *   閉められるのはサーバー側の鍵が直ったあとで、その鍵を直すのも じゅんの1分です。
 *   ＝ じゅんの手が **2回** 要る形でした（鍵を直す → もう一度 開いて閉めるを押す）。
 *   ここに出しておくと、毎日の自動の処理からも同じ手順を呼べるので、
 *   **鍵が直った次の晩に、こちら側で閉まります**（じゅんの手は1回だけ）。
 *
 * ■ 安全（この順でしか閉めません。窓口と1文字も変えていません）
 *   1) サーバー側の鍵が使えること
 *   2) 閉める前に、期限つきの住所で写真が1枚 読めること（写真が無ければこの確かめは省く）
 *   3) 置き場の設定を1つだけ変える（1枚5MB・画像だけの制限は読んだ値をそのまま書き戻す）
 *   4) 閉めたあと、もう一度 読めること。読めなければ **その場で元に戻す**
 *   置き場がもう非公開なら、何もしません（何度 走っても同じ結果）。
 *
 * ★写真の中身・住所・お店の名前・鍵や合言葉の値は1文字も返しません。
 * ★手羽屋の日報・シフト・レジ・LINE には触れません（倉庫の棚も1行も変えません）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { describePhotoLock, type PhotoLockOutcome, type PhotoLockSteps } from "./photoLock";
import { readBucket, serverKeyUsable, type BucketInfo } from "./photoLockServer";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";
import { noStoreFetch, serviceClientOrNull } from "@/lib/supabaseServer";

/** 期限つきの住所が生きている時間（秒）。/api/receipt-photo と同じ */
const SIGN_SECONDS = 60;

/** 確かめに使う写真を探すとき、1か所で見る数の上限 */
const LIST_LIMIT = 50;

/**
 * 確かめに使える写真を1枚だけ探す（名前は返しません）。
 * 置き場の中は `<フォルダ>/<年-月>/<でたらめな名前>` の3段なので、3段だけ降ります。
 */
export async function findOnePhoto(
  db: SupabaseClient,
  folder = "",
  depth = 0,
): Promise<string | null> {
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
export async function signedReadWorks(db: SupabaseClient, path: string): Promise<boolean> {
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
export async function setBucketPublic(
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

export type PhotoLockRun = { outcome: PhotoLockOutcome; steps: PhotoLockSteps };

/** 閉める1回ぶん（窓口の POST と、毎日の自動の処理が同じこれを呼びます） */
export async function runPhotoLock(): Promise<PhotoLockRun> {
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
    const blocked = { ...steps, keyUsable: false };
    return { outcome: describePhotoLock(blocked), steps: blocked };
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

  return { outcome: describePhotoLock(steps), steps };
}
