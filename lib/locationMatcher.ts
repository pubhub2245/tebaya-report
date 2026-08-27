/**
 * 店舗名の表記揺れを吸収する正規化・マッチングモジュール。
 *
 * ★ 名寄せ（表記ゆれの統一）のルールは lib/locationName.ts に集約した。
 *   このファイルは「揃えた名前を locations テーブルの行に結びつける」担当。
 *   ルールを直すときは lib/locationName.ts を直すこと。
 *
 * - normalizeLocationName: 純関数。表記揺れを統一形へ。
 * - locationsMatch: 2つの店舗名が同一かどうかを判定。
 * - matchLocation: 入力名を locations テーブルの正式レコードへ解決。
 *
 * 対応する表記揺れ例（ルールの本体は lib/locationName.ts）:
 *   「ながやま 三股店」「ながやま三股店」「三股」→ すべて「ながやま三股」へ
 *   「マンガ倉庫」「マンガ倉庫都城店」→「マンガ倉庫」へ
 *   「PASIO 高城店」「パシオ高城」→「PASIO高城」へ
 */

import { supabase } from "./supabase";
import { canonicalLocationName, normalizeKey } from "./locationName";

export type LocationRow = {
  id: number;
  name: string;
  rank: string;
  target: number;
};

export type LocationMatch = {
  id: number;
  displayName: string;
  rank: string;
  target: number;
};

// -----------------------------------------------------------------------------
// 正規化ロジック
// -----------------------------------------------------------------------------

/**
 * 店舗名を正規化する純関数。
 * 実体は lib/locationName.ts の normalizeKey（比較用のキーを作る処理）。
 */
export function normalizeLocationName(name: string): string {
  return normalizeKey(name);
}

/** 2つの店舗名が（表記揺れを許容して）同一かどうか判定 */
export function locationsMatch(name1: string, name2: string): boolean {
  return normalizeLocationName(name1) === normalizeLocationName(name2);
}

// -----------------------------------------------------------------------------
// locations キャッシュ
// -----------------------------------------------------------------------------

let LOCATIONS_CACHE: LocationRow[] | null = null;
let CACHE_PROMISE: Promise<LocationRow[]> | null = null;

async function fetchLocations(): Promise<LocationRow[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, rank, target")
    .eq("is_active", true);
  if (error) {
    throw new Error(`locations 取得失敗: ${error.message}`);
  }
  return (data || []) as LocationRow[];
}

async function getLocations(): Promise<LocationRow[]> {
  if (LOCATIONS_CACHE) return LOCATIONS_CACHE;
  if (CACHE_PROMISE) return CACHE_PROMISE;
  CACHE_PROMISE = fetchLocations()
    .then((rows) => {
      LOCATIONS_CACHE = rows;
      return rows;
    })
    .finally(() => {
      CACHE_PROMISE = null;
    });
  return CACHE_PROMISE;
}

/** テスト・管理画面からの強制リロード用（通常使わない） */
export function clearLocationCache(): void {
  LOCATIONS_CACHE = null;
}

// -----------------------------------------------------------------------------
// matchLocation
// -----------------------------------------------------------------------------

/**
 * 入力された店舗名を locations テーブルの正式レコードへ解決する。
 * 一致するレコードが無ければ null を返す。
 *
 * 1. lib/locationName.ts で表記ゆれを揃える
 * 2. 比較用のキーに直す
 * 3. locations を全件キャッシュから線形探索（20件程度なので十分）
 */
export async function matchLocation(name: string): Promise<LocationMatch | null> {
  if (!name) return null;
  // 表記ゆれを揃えてから（例「ながやま 三股店」→「ながやま三股」）比較キーにする
  const canonical = normalizeKey(canonicalLocationName(name));
  if (!canonical) return null;

  const locations = await getLocations();
  const match = locations.find(
    (loc) => normalizeLocationName(loc.name) === canonical,
  );
  if (!match) return null;

  return {
    id: match.id,
    displayName: match.name,
    rank: match.rank,
    target: match.target,
  };
}
