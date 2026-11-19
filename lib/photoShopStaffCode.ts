/**
 * 写真だけの日報のお店：スタッフ用の合言葉を「画面から変えられる」ようにする（2026-11-19）。
 *
 * ■ しくみ（やさしい説明）
 *   ・はじめは lib/photoShop.ts に書いた仮の合言葉（牟田町店は 1111）で入れます。
 *   ・店主が画面（/shop/staff-code）で新しい合言葉を決めると、倉庫の棚
 *     keiri_photo_shop_staff_codes に「戻せない形」で入ります。
 *   ・棚に入ったお店は、それ以降 **仮の合言葉では入れません**（新しい合言葉だけ）。
 *   ・変えられるのは、店主の合言葉を知っている人だけ（倉庫の窓口が確かめる）。
 *
 * ★ 倉庫の窓口：photo_shop_staff_login / photo_shop_staff_code_is_set / photo_shop_set_staff_code
 *   （supabase/migrations/photo_shop_staff_codes.sql）。
 * ★ 窓口が呼べないとき（まだ無い・通信できない）は、仮の合言葉だけで判断する。
 *   ＝ 今までどおり。締め出しは起きない。
 * ★ tests/photoShopStaffCode.test.ts で固定。
 */

import { normalizeTenantScope } from "./tenantScope";

/** 新しい合言葉の決まり：半角の数字か英字で4〜12文字 */
export function validStaffCode(code: string): boolean {
  return /^[0-9A-Za-z]{4,12}$/.test(code);
}

/**
 * 入ってよいお店を決める（計算だけ）。
 * ・倉庫に合ったお店があれば、そのお店
 * ・なければ、仮の合言葉で合ったお店。ただしそのお店が **すでに画面で変えていたら入れない**
 */
export function decideStaffLogin(input: {
  dbTenantId: string | null;
  codeTenantId: string | null;
  codeIsSet: boolean;
}): string | null {
  const db = normalizeTenantScope(input.dbTenantId);
  if (db) return db;
  const code = normalizeTenantScope(input.codeTenantId);
  if (code && !input.codeIsSet) return code;
  return null;
}

type Rpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** 倉庫で合言葉に合うお店を探す。呼べなければ null */
export async function staffLoginViaDb(db: Rpc, hash: string): Promise<string | null> {
  try {
    const { data, error } = await db.rpc("photo_shop_staff_login", { p_hash: hash });
    if (error) return null;
    return normalizeTenantScope(Array.isArray(data) ? data[0] : data);
  } catch {
    return null;
  }
}

/** そのお店の合言葉が画面で決められているか。呼べなければ「決められていない」扱い（仮の合言葉が使える） */
export async function staffCodeIsSet(db: Rpc, tenantId: string): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("photo_shop_staff_code_is_set", { p_tenant: tenantId });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** 合言葉を変える。店主の合言葉が合ったときだけ true */
export async function setStaffCodeViaDb(
  db: Rpc,
  tenantId: string,
  ownerHash: string,
  newHash: string,
): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("photo_shop_set_staff_code", {
      p_tenant: tenantId,
      p_owner_hash: ownerHash,
      p_new_hash: newHash,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
