import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const sb = createClient(url, key);

const { data, error } = await sb.from("locations").select("*").order("name");
if (error) {
  console.error(error);
  process.exit(1);
}
console.log(JSON.stringify(data, null, 2));

const { data: shifts, error: e2 } = await sb
  .from("shifts")
  .select("id, date, location_id, rank, target, staff_name, note")
  .gte("date", "2026-04-01")
  .lte("date", "2026-04-30")
  .order("date");
if (e2) {
  console.error(e2);
  process.exit(1);
}
console.log("---SHIFTS APRIL---");
console.log(JSON.stringify(shifts, null, 2));
