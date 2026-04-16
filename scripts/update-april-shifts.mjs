import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const sb = createClient(url, key);

const LOC = {
  ながやま三股: 3,
  ながやま山田: 5,
  ながやま若葉: 2,
  ながやま鷹尾: 1,
  ながやま都北: 4,
  PASIO高城: 8,
  マンガ倉庫: 7,
  まるまる朝市: 10,
  ニクルの朝市: 11,
  Aコープ木花: 13,
  イオンモール: 14,
};
const TGT = { S: 0, A: 60000, B: 50000, C: 40000, D: 30000 };

const shifts = [
  ["2026-04-01", "ながやま三股", "C", "イデ", null],
  ["2026-04-01", "PASIO高城", "D", "りゅうき", null],
  ["2026-04-02", "ながやま三股", "C", "かずき", null],
  ["2026-04-02", "PASIO高城", "C", "りゅうき", null],
  ["2026-04-03", "ながやま山田", "D", "かずき", null],
  ["2026-04-05", "ながやま鷹尾", "B", "りゅうき", null],
  ["2026-04-05", "マンガ倉庫", "C", "かずき", null],
  ["2026-04-06", "ながやま若葉", "B", "なぎさ", null],
  ["2026-04-07", "ながやま鷹尾", "B", "かずき", null],
  ["2026-04-08", "ながやま三股", "C", "イデ", null],
  ["2026-04-08", "PASIO高城", "D", "りゅうき", null],
  ["2026-04-09", "ながやま都北", "C", "かずき", null],
  ["2026-04-09", "PASIO高城", "D", "りゅうき&なぎさ（売り子）", null],
  ["2026-04-10", "ながやま山田", "C", "りゅうき", null],
  ["2026-04-11", "ながやま鷹尾", "B", "かずき", null],
  ["2026-04-11", "マンガ倉庫", "C", "りゅうき&なぎさ（売り子）", null],
  ["2026-04-12", "ながやま若葉", "C", "りゅうき", null],
  ["2026-04-12", "まるまる朝市", "B", "かずき&なぎさ（売り子）", "午前"],
  ["2026-04-12", "マンガ倉庫", "D", "かずき", "午後"],
  ["2026-04-13", "ながやま三股", "C", "なぎさ", null],
  ["2026-04-14", "ながやま鷹尾", "B", "かずき", null],
  ["2026-04-14", "PASIO高城", "D", "りゅうき&なぎさ（売り子）", null],
  ["2026-04-15", "ながやま三股", "C", "イデ", null],
  ["2026-04-16", "ながやま山田", "C", "かずき", null],
  ["2026-04-17", "ながやま三股", "C", "かずき", null],
  ["2026-04-18", "ながやま若葉", "B", "川畑", null],
  ["2026-04-18", "ニクルの朝市", "B", "かずき&なぎさ", "午前"],
  ["2026-04-18", "マンガ倉庫", "C", "かずき&なぎさ", "午後"],
  ["2026-04-19", "ながやま鷹尾", "A", "かずき", null],
  ["2026-04-19", "マンガ倉庫", "B", "川畑&なぎさ（売り子）", null],
  ["2026-04-20", "ながやま若葉", "A", "なぎさ", null],
  ["2026-04-21", "ながやま鷹尾", "A", "かずき", null],
  ["2026-04-22", "ながやま都北", "D", "かずき", null],
  ["2026-04-22", "Aコープ木花", "D", "イデ", "⚠️出店場所未定→Aコープ木花想定（問い合わせ中）"],
  ["2026-04-23", "ながやま山田", "D", "かずき", null],
  ["2026-04-23", "PASIO高城", "C", "川畑", null],
  ["2026-04-24", "ながやま三股", "C", "かずき", null],
  ["2026-04-25", "ながやま鷹尾", "B", "かずき", null],
  ["2026-04-25", "PASIO高城", "D", "川畑", null],
  ["2026-04-26", "ながやま若葉", "A", "かずき", null],
  ["2026-04-26", "マンガ倉庫", "B", "川畑", null],
  ["2026-04-27", "ながやま都北", "C", "なぎさ", null],
  ["2026-04-27", "PASIO高城", "C", "かずき", null],
  ["2026-04-28", "ながやま鷹尾", "A", "かずき", null],
  ["2026-04-29", "ながやま若葉", "A", "イデ", "🍖ニクの日"],
  ["2026-04-29", "イオンモール", "A", "かずき&なぎさ（売り子）", null],
  ["2026-04-30", "ながやま三股", "C", "川畑", null],
  ["2026-04-30", "イオンモール", "A", "かずき&なぎさ（売り子）", null],
];

const rows = shifts.map(([date, loc, rank, staff, note]) => ({
  date,
  location_id: LOC[loc],
  rank,
  target: TGT[rank],
  staff_name: staff,
  note,
}));

const mode = process.argv[2];

if (mode === "--dry-run") {
  const total = rows.reduce((s, r) => s + r.target, 0);
  console.log(`件数: ${rows.length}`);
  console.log(`月間目標合計: ¥${total.toLocaleString("ja-JP")}`);
  const byRank = {};
  rows.forEach((r) => {
    byRank[r.rank] = (byRank[r.rank] || 0) + 1;
  });
  console.log("ランク内訳:", byRank);
  process.exit(0);
}

if (mode !== "--apply") {
  console.log("Usage: node update-april-shifts.mjs [--dry-run | --apply]");
  process.exit(1);
}

const { error: delErr, count } = await sb
  .from("shifts")
  .delete({ count: "exact" })
  .gte("date", "2026-04-01")
  .lte("date", "2026-04-30");
if (delErr) {
  console.error("削除エラー:", delErr);
  process.exit(1);
}
console.log(`削除: ${count}件`);

const { data: inserted, error: insErr } = await sb
  .from("shifts")
  .insert(rows)
  .select("id");
if (insErr) {
  console.error("挿入エラー:", insErr);
  process.exit(1);
}
console.log(`挿入: ${inserted.length}件`);
const total = rows.reduce((s, r) => s + r.target, 0);
console.log(`月間目標合計: ¥${total.toLocaleString("ja-JP")}`);
