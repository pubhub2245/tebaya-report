import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const sb = createClient(url, key);

console.log("--- daily_cancellations の現状 ---");
const { data: cur, error: e1, count } = await sb
  .from("daily_cancellations")
  .select("*", { count: "exact" });
if (e1) {
  console.error("読み取りエラー:", e1);
  process.exit(1);
}
console.log(`現在のレコード数: ${count}`);
if (cur && cur.length > 0) console.log(JSON.stringify(cur, null, 2));

console.log("\n--- 4/30 の shifts (整合性のあるテストデータ用) ---");
const { data: shifts4_30 } = await sb
  .from("shifts")
  .select("id, date, staff_name, status, locations(name)")
  .eq("date", "2026-04-30")
  .eq("status", "published")
  .limit(5);
console.log(JSON.stringify(shifts4_30, null, 2));

console.log("\n--- 4/30 の daily_reports (提出済み確認) ---");
const { data: reports4_30 } = await sb
  .from("daily_reports")
  .select("location, staff_name")
  .eq("date", "2026-04-30");
console.log(JSON.stringify(reports4_30, null, 2));
