/**
 * 「レシート写真の置き場が公開か」を実際に聞きに行く所（f3-4・2026-10-26）。
 *
 * 判定と言葉は lib/keiri/photoLock.ts（通信なし・試験で固定）。
 * ここは通信するだけで、**1行も書き込みません**。
 * 同じ答えを /keiri/key の画面と /api/keiri/photo-lock の両方が使うため、
 * 聞き方は この1か所にまとめます（画面と窓口で答えが食い違わないように）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { photoLockState, type PhotoLockState } from "@/lib/keiri/photoLock";
import { probePublicRead } from "@/lib/keiri/photoProbe";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";
import { describeServerKey } from "@/lib/keiri/serverHealth";
import {
  serviceClientOrNull,
  serviceRoleKeyRepair,
  serviceRoleKeyStatus,
} from "@/lib/supabaseServer";

/** 置き場の設定。制限は、閉めるときにそのまま書き戻すために持っておく */
export type BucketInfo = {
  isPublic: boolean | null;
  fileSizeLimit: number | null;
  mimes: string[] | null;
};

/** 置き場の設定を読む（仕組み側の鍵が要る） */
export async function readBucket(db: SupabaseClient): Promise<BucketInfo> {
  const { data } = await db.storage.getBucket(RECEIPT_BUCKET);
  if (!data) return { isPublic: null, fileSizeLimit: null, mimes: null };
  const raw = data as unknown as {
    public?: boolean;
    file_size_limit?: number | null;
    allowed_mime_types?: string[] | null;
  };
  return {
    isPublic: raw.public === true,
    fileSizeLimit: typeof raw.file_size_limit === "number" ? raw.file_size_limit : null,
    mimes: Array.isArray(raw.allowed_mime_types) ? raw.allowed_mime_types : null,
  };
}

/** サーバー側の鍵が そのまま使えるか（値は1文字も読みません） */
export function serverKeyUsable(): boolean {
  const repair = serviceRoleKeyRepair();
  return describeServerKey(serviceRoleKeyStatus(), {
    repaired: repair.repaired,
    broken: repair.broken,
  }).usable;
}

export type PhotoLockStatus = {
  state: PhotoLockState;
  keyUsable: boolean;
  bucketPublic: boolean | null;
  howMeasured: string;
};

/**
 * いま閉められるか・もう閉まっているかを見る。
 * 鍵があれば置き場の設定を直に読み、無ければ**鍵をまったく付けずに**
 * 「無い写真」の住所をたたいて見分けます（本物の写真は1枚も読みません）。
 */
export async function photoLockStatus(): Promise<PhotoLockStatus> {
  const keyUsable = serverKeyUsable();
  const db = keyUsable ? serviceClientOrNull({ fresh: true }) : null;

  let bucketPublic: boolean | null = null;
  let howMeasured = "";
  if (db) {
    bucketPublic = (await readBucket(db)).isPublic;
    howMeasured = "置き場の設定を、仕組み側の鍵で直に読みました";
  }
  if (bucketPublic === null) {
    const probe = await probePublicRead();
    bucketPublic = probe.open;
    howMeasured = `鍵なしで置き場をたたいて見分けました（${probe.note}）`;
  }

  return {
    state: photoLockState({ keyUsable, bucketPublic, viewWindow: true }),
    keyUsable,
    bucketPublic,
    howMeasured,
  };
}
