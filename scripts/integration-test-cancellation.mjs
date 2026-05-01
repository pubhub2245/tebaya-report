// 統合テスト：daily_cancellations にダミー1件をINSERTし、
// /api/cron/remind-daily-reports?mode=yesterday と /api/cron/notify-tasks の挙動を比較する。
// テスト終了後はダミー行を必ず削除する（finally）。

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const sb = createClient(url, key);

const TEST_DATE = "2026-04-30";
const TEST_LOC = "ながやま三股";
const TEST_STAFF = "川畑";

let insertedId = null;

const probe = async (path) => {
  const res = await fetch(`http://localhost:3000${path}`);
  return await res.json();
};

try {
  console.log("================================================");
  console.log("STEP A: ダミー中止記録INSERT前のベースライン");
  console.log("================================================");
  const baseRemind = await probe(
    "/api/cron/remind-daily-reports?mode=yesterday",
  );
  const baseTasks = await probe("/api/cron/notify-tasks");
  console.log("23:00 yesterday:", JSON.stringify(baseRemind, null, 2));
  console.log("9:00  notify-tasks:", JSON.stringify(baseTasks, null, 2));

  console.log("\n================================================");
  console.log("STEP B: ダミー中止記録をINSERT");
  console.log("  date=" + TEST_DATE + " loc=" + TEST_LOC + " staff=" + TEST_STAFF);
  console.log("================================================");
  const { data: ins, error: insErr } = await sb
    .from("daily_cancellations")
    .insert({
      business_date: TEST_DATE,
      location: TEST_LOC,
      staff_name_raw: TEST_STAFF,
      cancellation_reasons: ["wind", "thunder"],
      reason_other: null,
      note: "[INTEGRATION_TEST] 自動テスト用",
      canceled_by: "[INTEGRATION_TEST]",
    })
    .select()
    .single();
  if (insErr) {
    console.error("INSERT失敗:", insErr);
    process.exit(1);
  }
  insertedId = ins.id;
  console.log("INSERTED id=" + insertedId);

  console.log("\n================================================");
  console.log("STEP C: 中止記録ありで再判定");
  console.log("================================================");
  const afterRemind = await probe(
    "/api/cron/remind-daily-reports?mode=yesterday",
  );
  const afterTasks = await probe("/api/cron/notify-tasks");
  console.log("23:00 yesterday:", JSON.stringify(afterRemind, null, 2));
  console.log("9:00  notify-tasks:", JSON.stringify(afterTasks, null, 2));

  console.log("\n================================================");
  console.log("STEP D: 期待値との比較");
  console.log("================================================");
  let passed = 0;
  let failed = 0;
  const check = (name, got, expected) => {
    const ok = got === expected;
    console.log(
      `  ${ok ? "✓" : "✗"} ${name}: got=${got} expected=${expected}`,
    );
    if (ok) passed++;
    else failed++;
  };

  // ベースライン期待：missing=1, submitted=1, cancelled=0
  check("baseline 23:00 missing", baseRemind.missing_count, 1);
  check("baseline 23:00 submitted", baseRemind.submitted, 1);
  check("baseline 23:00 cancelled", baseRemind.cancelled, 0);
  check("baseline 9:00 missing", baseTasks.report_missing_count, 1);
  check(
    "baseline 9:00 cancelled",
    baseTasks.report_cancelled_count,
    0,
  );

  // 中止記録挿入後：missing=0, submitted=1, cancelled=1
  check("after-insert 23:00 missing", afterRemind.missing_count, 0);
  check("after-insert 23:00 submitted", afterRemind.submitted, 1);
  check("after-insert 23:00 cancelled", afterRemind.cancelled, 1);
  check("after-insert 9:00 missing", afterTasks.report_missing_count, 0);
  check(
    "after-insert 9:00 cancelled",
    afterTasks.report_cancelled_count,
    1,
  );

  console.log(`\n結果: ${passed}件 PASS / ${failed}件 FAIL`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("テスト中の例外:", e);
  process.exitCode = 2;
} finally {
  console.log("\n================================================");
  console.log("STEP E: ダミー行のクリーンアップ");
  console.log("================================================");
  if (insertedId) {
    const { error: delErr } = await sb
      .from("daily_cancellations")
      .delete()
      .eq("id", insertedId);
    if (delErr) {
      console.error("クリーンアップ失敗（手動削除推奨）:", delErr);
    } else {
      console.log("削除OK id=" + insertedId);
    }
  }

  // 最終確認：daily_cancellationsが空に戻っていること
  const { data: finalRows, count: finalCount } = await sb
    .from("daily_cancellations")
    .select("*", { count: "exact" });
  console.log(`最終レコード数: ${finalCount}`);
  if (finalRows && finalRows.length > 0) {
    console.log(JSON.stringify(finalRows, null, 2));
  }
}
