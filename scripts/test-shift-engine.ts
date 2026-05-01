/**
 * シフト推奨エンジンの統合テストスクリプト。
 *
 * 実行例:
 *   npx tsx scripts/test-shift-engine.ts fixtures/nagayama_schedule_2026_04_21.pdf.pdf 2026 5
 *   npx tsx scripts/test-shift-engine.ts fixtures/nagayama_schedule_2026_04_21.pdf.pdf 2026 6
 *
 * NOTE: PDFパースは非決定的（Claude APIは同一PDFでも毎回微妙に異なる結果を返す）。
 *       Step 1 と最終スケジュールの内容を一致させるため、
 *       PDFパースは1回だけ実施し、各Stepを手動でオーケストレーションする。
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const envText = readFileSync(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const WEEKDAY_LABEL_JS = ["日", "月", "火", "水", "木", "金", "土"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

async function main(): Promise<void> {
  const pdfPath = process.argv[2];
  const year = Number(process.argv[3]);
  const month = Number(process.argv[4]);

  if (!pdfPath || !year || !month) {
    console.error(
      "使い方: npx tsx scripts/test-shift-engine.ts <PDF> <YEAR> <MONTH>",
    );
    process.exit(1);
  }
  if (!existsSync(pdfPath)) {
    console.error(`PDFが見つかりません: ${pdfPath}`);
    process.exit(1);
  }

  const { parseNagayamaPDF } = await import("../lib/nagayama-parser");
  const { selectNagayamaDates, buildFullSchedule, assignStaff } = await import(
    "../lib/shift-engine/index"
  );
  const { matchLocation } = await import("../lib/locationMatcher");
  const {
    NAGAYAMA_TARGETS,
    NAGAYAMA_DAY_PREFERENCE,
    NOTE_MARKERS,
    STORE_MONTHLY_TARGET,
  } = await import("../lib/shift-config");

  console.log("=== シフト生成テスト ===");
  console.log(`入力: ${pdfPath}`);
  console.log(`対象: ${year}年${month}月`);
  console.log("");

  const buf = readFileSync(pdfPath);
  console.log("[PDFパース中...]");
  const t0 = Date.now();
  const parsed = await parseNagayamaPDF(buf, { year });
  console.log(`PDFパース完了 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!parsed.meta.detectedMonths.includes(month)) {
    console.error(
      `PDFに ${month} 月のデータが含まれていません（検出月: [${parsed.meta.detectedMonths.join(", ")}]）`,
    );
    process.exit(1);
  }
  console.log("");

  // ---- Step 1 ----
  console.log("[Step 1] ながやま選定");
  const sel = selectNagayamaDates(
    parsed.schedule,
    parsed.confirmed,
    year,
    month,
  );
  let confirmedTotal = 0;
  let suggTotal = 0;
  for (const store of NAGAYAMA_TARGETS) {
    const conf = sel.confirmedByStore[store] ?? [];
    const sg = sel.byStore[store] ?? [];
    confirmedTotal += conf.length;
    suggTotal += sg.length;
    const target = STORE_MONTHLY_TARGET[store] ?? 0;
    const total = conf.length + sg.length;
    const status = total >= target ? "✓" : "⚠";
    console.log(
      `  ${store}: ${conf.length}日確定 + ${sg.length}日推奨 = ${total}日 / 目標${target}日 ${status}`,
    );
    if (conf.length > 0) {
      console.log(`    確定: ${conf.map((d) => `${month}/${d}`).join(", ")}`);
    }
    if (sg.length > 0) {
      console.log(`    推奨: ${sg.map((d) => `${month}/${d}`).join(", ")}`);
    }
  }
  console.log(
    `  選定合計: 確定${confirmedTotal}日 + 推奨${suggTotal}日 = ${confirmedTotal + suggTotal}日`,
  );
  console.log("");

  // ---- Step 2-3 ----
  // 確定日 + 推奨日をマージして buildFullSchedule に渡す
  const mergedByStore: Record<string, number[]> = {};
  for (const store of Object.keys(sel.byStore)) {
    mergedByStore[store] = [
      ...(sel.confirmedByStore[store] ?? []),
      ...sel.byStore[store],
    ].sort((a, b) => a - b);
  }
  const full = buildFullSchedule(
    { byStore: mergedByStore, confirmedByStore: {}, warnings: [] },
    year,
    month,
  );

  // ---- Step 4 ----
  const staffed = assignStaff(full, year, month);

  // ---- 最終整形（generateMonthlyShift と同じロジック）----
  const allWarnings = [
    ...sel.warnings,
    ...full.warnings,
    ...staffed.warnings,
  ];
  const daysInMonth = new Date(year, month, 0).getDate();
  const staffSummary: Record<string, number> = {};

  console.log("[Step 2-4] 全体スケジュール構築 + スタッフ割当");
  let totalShifts = 0;
  let restDays = 0;
  let workDays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const entries = staffed.byDay[day] ?? [];
    if (entries.length === 0) {
      restDays++;
      console.log(
        `  ${month}/${day} (${WEEKDAY_LABEL_JS[d.getDay()]}): （休み）`,
      );
      continue;
    }
    workDays++;
    totalShifts += entries.length;

    const parts: string[] = [];
    for (const e of entries) {
      const loc = await matchLocation(e.storeName);
      if (!loc) {
        allWarnings.push(
          `${month}/${day}: 「${e.storeName}」が locations に見つかりません`,
        );
      }
      let note = e.note;
      if (!note && !e.storeName.startsWith("ながやま")) {
        note = NOTE_MARKERS.UNCONFIRMED;
      }
      if (e.staffName) {
        staffSummary[e.staffName] = (staffSummary[e.staffName] ?? 0) + 1;
      }
      parts.push(
        `${e.storeName}=${e.staffName ?? "null"}${note ? ` [${note}]` : ""}`,
      );
    }
    console.log(
      `  ${month}/${day} (${WEEKDAY_LABEL_JS[d.getDay()]}): ${parts.join(", ")}`,
    );
  }
  console.log("");
  console.log(
    `  最終配置: 月内${workDays}日に出店予定、${restDays}日が休み`,
  );
  console.log("");

  console.log("[サマリー]");
  console.log(`  全シフト数: ${totalShifts}件`);
  for (const name of ["かずき", "なぎさ", "イデ", "じゅん"]) {
    console.log(`  ${name}: ${staffSummary[name] ?? 0}件`);
  }
  let unassigned = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    for (const e of staffed.byDay[day] ?? []) {
      if (!e.staffName) unassigned++;
    }
  }
  console.log(`  未割当: ${unassigned}件 (要設定)`);
  console.log("");

  // ---- 都北店ソフト制約評価 ----
  const tohoku = sel.byStore["都北店"] ?? [];
  if (tohoku.length > 0) {
    const pref = NAGAYAMA_DAY_PREFERENCE["都北店"]!;
    const onPref = tohoku.filter((d) =>
      pref.preferredWeekdays.includes(new Date(year, month - 1, d).getDay()),
    );
    const offPref = tohoku.filter(
      (d) =>
        !pref.preferredWeekdays.includes(new Date(year, month - 1, d).getDay()),
    );
    console.log("[都北店ソフト制約評価]");
    console.log(
      `  火/木/日: ${onPref.length}日 (${onPref.map((d) => `${month}/${d}(${WEEKDAY_LABEL_JS[new Date(year, month - 1, d).getDay()]})`).join(", ")})`,
    );
    console.log(
      `  その他曜日: ${offPref.length}日 (${offPref.map((d) => `${month}/${d}(${WEEKDAY_LABEL_JS[new Date(year, month - 1, d).getDay()]})`).join(", ")})`,
    );
    console.log("");
  }

  // ---- ハード制約検証 ----
  console.log("[ハード制約検証]");
  const violations: string[] = [];

  // H1: 同日に同一ながやま店舗の重複なし
  for (let day = 1; day <= daysInMonth; day++) {
    const ngmStores = (staffed.byDay[day] ?? [])
      .map((e) => e.storeName)
      .filter((n) => n.startsWith("ながやま"));
    if (new Set(ngmStores).size !== ngmStores.length) {
      violations.push(`H1違反: ${month}/${day} に同一ながやま店舗の重複`);
    }
  }

  // H3: 各店舗で4日連続なし（確定 + 推奨の合算でチェック。確定日のみの違反は警告扱い）
  for (const store of NAGAYAMA_TARGETS) {
    const conf = new Set(sel.confirmedByStore[store] ?? []);
    const sg = new Set(sel.byStore[store] ?? []);
    const combined = [...new Set([...conf, ...sg])].sort((a, b) => a - b);
    let run = 1;
    let runStart = combined[0];
    for (let i = 1; i < combined.length; i++) {
      if (combined[i] === combined[i - 1] + 1) {
        run++;
        if (run > 3) {
          // この連続日に推奨日が含まれているかチェック
          const runDays: number[] = [];
          for (let j = i - run + 1; j <= i; j++) runDays.push(combined[j]);
          const hasSugg = runDays.some((d) => sg.has(d));
          if (hasSugg) {
            violations.push(
              `H3違反: ${store} で${run}日連続 (${runDays.map((d) => `${month}/${d}`).join(", ")}) ※推奨日含む`,
            );
          }
          // 確定のみの連続は selector が警告済み
        }
      } else {
        run = 1;
        runStart = combined[i];
      }
    }
  }

  // H4: 各店舗で同一週に2回まで（確定 + 推奨の合算でチェック。確定日のみの違反は警告扱い）
  function isoWeekKey(y: number, m: number, d: number): string {
    const date = new Date(y, m - 1, d);
    const t = new Date(date.valueOf());
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    return `${t.getFullYear()}-${pad2(t.getMonth())}-${pad2(t.getDate())}`;
  }
  for (const store of NAGAYAMA_TARGETS) {
    const conf = new Set(sel.confirmedByStore[store] ?? []);
    const sg = new Set(sel.byStore[store] ?? []);
    const combined = [...new Set([...conf, ...sg])];
    const wcount: Record<string, number[]> = {};
    for (const d of combined) {
      const k = isoWeekKey(year, month, d);
      (wcount[k] ??= []).push(d);
    }
    for (const [, ds] of Object.entries(wcount)) {
      if (ds.length > 2) {
        const hasSugg = ds.some((d) => sg.has(d));
        if (hasSugg) {
          violations.push(
            `H4違反: ${store} 同一週に${ds.length}回 (${ds.map((d) => `${month}/${d}`).join(", ")}) ※推奨日含む`,
          );
        }
        // 確定のみの違反は selector が警告済み
      }
    }
  }

  if (violations.length === 0) {
    console.log("  ✓ 違反なし");
  } else {
    for (const v of violations) console.log(`  ✗ ${v}`);
  }
  console.log("");

  console.log("[警告] (" + allWarnings.length + "件)");
  for (const w of allWarnings) console.log(`  - ${w}`);
  console.log("");

  console.log("=== 完了 ===");
}

main().catch((e) => {
  console.error("エラー:", e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
