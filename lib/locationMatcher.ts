/**
 * 店舗名の表記揺れを吸収する正規化・マッチングモジュール。
 *
 * - normalizeLocationName: 純関数。表記揺れを統一形へ。
 * - locationsMatch: 2つの店舗名が同一かどうかを判定。
 * - matchLocation: 入力名を locations テーブルの正式レコードへ解決。
 *
 * 対応する表記揺れ例:
 *   「ながやま 三股店」「ながやま三股店」「三股」「三股(店頭)」「三股（店頭）」
 *   → すべて id=3「ながやま三股」へ解決
 *   「マンガ倉庫」「マンガ倉庫都城店」「マンガ倉庫 都城店」 → id=7
 *   「ニクルの朝市」「にくる朝市」「ニクル朝市」 → id=11
 *   「まるまる朝市」「まるまる朝市@まちなか広場」 → id=10
 *   「イオンモール」「イオン」「イオンモール都城駅前」 → id=14
 *   「PASIO 高城店」「パシオ高城」 → id=8
 */

import { supabase } from "./supabase";

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
 * 大文字小文字・全角/半角スペース・改行・「店」「店頭」「都城店」「都城駅前」
 * 「@...」サフィックスなどを除去し、比較用のキーを生成する。
 */
export function normalizeLocationName(name: string): string {
  if (!name) return "";
  return name
    .replace(/[\r\n\t]+/g, "") // 改行・タブ
    .replace(/[\s　]+/g, "") // 半角・全角スペース
    .replace(/[（(]\s*店頭\s*[）)]\s*$/g, "") // 末尾の「(店頭)」「（店頭）」
    .replace(/店頭$/g, "") // 末尾の「店頭」
    .replace(/[＠@].*$/g, "") // 「@...」「＠...」サフィックス
    .replace(/都城駅前$/g, "")
    .replace(/都城店$/g, "")
    .replace(/店$/g, "")
    .toLowerCase();
}

/** 2つの店舗名が（表記揺れを許容して）同一かどうか判定 */
export function locationsMatch(name1: string, name2: string): boolean {
  return normalizeLocationName(name1) === normalizeLocationName(name2);
}

// -----------------------------------------------------------------------------
// 表記揺れエイリアス
// -----------------------------------------------------------------------------

/**
 * 表記揺れエイリアス（生の入力 → locations.name の正式形）。
 * normalizeLocationName を通した上でマッチングに使う。
 *
 * NOTE: 単独の「志比田」はながやま志比田/PASIO志比田と曖昧なので
 *       意図的に登録しない。プレフィックス付きでのみ解決する。
 */
const RAW_ALIAS_MAP: Record<string, string> = {
  // ながやま店舗の単独表記 → フルネーム
  三股: "ながやま三股",
  鷹尾: "ながやま鷹尾",
  若葉: "ながやま若葉",
  山田: "ながやま山田",
  都北: "ながやま都北",

  // PASIO/パシオ の表記揺れ
  パシオ高城: "PASIO高城",
  パシオ早鈴: "PASIO早鈴",
  パシオ志比田: "PASIO志比田",
  パシオたかお: "パシオ たかお店",
  PASIOたかお: "パシオ たかお店",

  // ニクル系
  ニクル朝市: "ニクルの朝市",
  にくる朝市: "ニクルの朝市",
  にくるの朝市: "ニクルの朝市",

  // イオン系
  イオン: "イオンモール",

  // BIG OPUS
  BIGOPUS: "BIG OPUS",
  ビッグオーパス: "BIG OPUS",
};

/** 起動時に1回だけ作る、正規化済みエイリアスマップ */
const ALIAS_NORMALIZED: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(RAW_ALIAS_MAP)) {
    out[normalizeLocationName(k)] = normalizeLocationName(v);
  }
  return out;
})();

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
 * 1. 入力を正規化
 * 2. エイリアスマップで正式名の正規化形へ変換
 * 3. locations を全件キャッシュから線形探索（17件程度なので十分）
 */
export async function matchLocation(name: string): Promise<LocationMatch | null> {
  if (!name) return null;
  const normalized = normalizeLocationName(name);
  if (!normalized) return null;

  const canonical = ALIAS_NORMALIZED[normalized] ?? normalized;

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
