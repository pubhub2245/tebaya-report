/**
 * locationMatcher.ts のロジック検証テスト。
 *
 * 実行: node scripts/test-matcher.mjs
 *
 * tsx を入れたくないので、normalize / alias マップを mjs にも持って
 * 同じアルゴリズムを再実装している。lib/locationMatcher.ts の
 * 該当ブロックと**完全一致**することを意図している。
 * 片方を直したらもう片方も直すこと。
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// ------------------------------------------------------------------
// .env.local を手動で読み込み
// ------------------------------------------------------------------
const env = readFileSync(".env.local", "utf8");
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);
if (!urlMatch || !keyMatch) {
  console.error(".env.local に Supabase の認証情報がありません");
  process.exit(1);
}
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

// ------------------------------------------------------------------
// lib/locationMatcher.ts と同じ正規化ロジック（再実装）
// ------------------------------------------------------------------
function normalizeLocationName(name) {
  if (!name) return "";
  return name
    .replace(/[\r\n\t]+/g, "")
    .replace(/[\s　]+/g, "")
    .replace(/[（(]\s*店頭\s*[）)]\s*$/g, "")
    .replace(/店頭$/g, "")
    .replace(/[＠@].*$/g, "")
    .replace(/都城駅前$/g, "")
    .replace(/都城店$/g, "")
    .replace(/店$/g, "")
    .toLowerCase();
}

const RAW_ALIAS_MAP = {
  三股: "ながやま三股",
  鷹尾: "ながやま鷹尾",
  若葉: "ながやま若葉",
  山田: "ながやま山田",
  都北: "ながやま都北",
  パシオ高城: "PASIO高城",
  パシオ早鈴: "PASIO早鈴",
  パシオ志比田: "PASIO志比田",
  パシオたかお: "パシオ たかお店",
  PASIOたかお: "パシオ たかお店",
  ニクル朝市: "ニクルの朝市",
  にくる朝市: "ニクルの朝市",
  にくるの朝市: "ニクルの朝市",
  イオン: "イオンモール",
  BIGOPUS: "BIG OPUS",
  ビッグオーパス: "BIG OPUS",
};

const ALIAS_NORMALIZED = {};
for (const [k, v] of Object.entries(RAW_ALIAS_MAP)) {
  ALIAS_NORMALIZED[normalizeLocationName(k)] = normalizeLocationName(v);
}

let LOCATIONS = null;
async function getLocations() {
  if (LOCATIONS) return LOCATIONS;
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, rank, target")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  LOCATIONS = data || [];
  return LOCATIONS;
}

async function matchLocation(name) {
  if (!name) return null;
  const normalized = normalizeLocationName(name);
  if (!normalized) return null;
  const canonical = ALIAS_NORMALIZED[normalized] ?? normalized;
  const locs = await getLocations();
  const m = locs.find((l) => normalizeLocationName(l.name) === canonical);
  if (!m) return null;
  return {
    id: m.id,
    displayName: m.name,
    rank: m.rank,
    target: m.target,
  };
}

// ------------------------------------------------------------------
// テストケース
// ------------------------------------------------------------------
const cases = [
  // ながやま三股 (id=3)
  { input: "ながやま 三股店", expectId: 3 },
  { input: "ながやま三股店", expectId: 3 },
  { input: "ながやま三股", expectId: 3 },
  { input: "三股(店頭)", expectId: 3 },
  { input: "三股（店頭）", expectId: 3 },
  { input: "三股店頭", expectId: 3 },
  { input: "三股", expectId: 3 },
  // ながやま鷹尾 (id=1)
  { input: "ながやま鷹尾", expectId: 1 },
  { input: "ながやま 鷹尾店", expectId: 1 },
  { input: "ながやま\n鷹尾店", expectId: 1 },
  { input: "鷹尾", expectId: 1 },
  // ながやま若葉 (id=2)
  { input: "ながやま若葉店", expectId: 2 },
  { input: "若葉", expectId: 2 },
  // マンガ倉庫 (id=7)
  { input: "マンガ倉庫", expectId: 7 },
  { input: "マンガ倉庫都城店", expectId: 7 },
  { input: "マンガ倉庫 都城店", expectId: 7 },
  // ニクルの朝市 (id=11)
  { input: "ニクルの朝市", expectId: 11 },
  { input: "にくる朝市", expectId: 11 },
  { input: "ニクル朝市", expectId: 11 },
  // まるまる朝市 (id=10)
  { input: "まるまる朝市", expectId: 10 },
  { input: "まるまる朝市@まちなか広場", expectId: 10 },
  // イオン (id=14)
  { input: "イオンモール", expectId: 14 },
  { input: "イオン", expectId: 14 },
  { input: "イオンモール都城駅前", expectId: 14 },
  { input: "イオン都城駅前", expectId: 14 },
  // PASIO高城 (id=8)
  { input: "PASIO 高城店", expectId: 8 },
  { input: "PASIO高城店", expectId: 8 },
  { input: "パシオ高城", expectId: 8 },
  // PASIO早鈴 (id=9)
  { input: "PASIO早鈴店", expectId: 9 },
  { input: "パシオ早鈴", expectId: 9 },
  // PASIO志比田 (id=16)
  { input: "PASIO志比田", expectId: 16 },
  { input: "パシオ志比田", expectId: 16 },
  // パシオ たかお店 (id=15)
  { input: "パシオたかお店", expectId: 15 },
  { input: "パシオ たかお店", expectId: 15 },
  // null ケース
  { input: "存在しない店舗名", expectId: null },
  { input: "", expectId: null },
];

// ------------------------------------------------------------------
// 実行
// ------------------------------------------------------------------
console.log("=== matchLocation テスト ===\n");
let passed = 0;
let failed = 0;
const failures = [];
for (const c of cases) {
  const r = await matchLocation(c.input);
  const actualId = r?.id ?? null;
  const ok = actualId === c.expectId;
  if (ok) passed++;
  else {
    failed++;
    failures.push({ ...c, actualId, displayName: r?.displayName });
  }
  const status = ok ? "✓" : "✗";
  const got = r ? `id=${r.id} (${r.displayName})` : "null";
  const expect = c.expectId === null ? "null" : `id=${c.expectId}`;
  const tail = ok ? "" : ` [期待: ${expect}]`;
  console.log(`  ${status} ${JSON.stringify(c.input)} → ${got}${tail}`);
}

console.log(
  `\n結果: ${passed} passed, ${failed} failed / 合計 ${cases.length} 件`,
);
if (failed > 0) {
  console.error("\n失敗ケース:");
  for (const f of failures) console.error(JSON.stringify(f));
  process.exit(1);
}
process.exit(0);
