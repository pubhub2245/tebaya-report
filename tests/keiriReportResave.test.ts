/**
 * 「同じ日に入れ直された日報は、人が押さなくても1枚だけ数える」ことを固定するテスト
 *                                       （2026-11-03・f1-5・kp273）。
 *
 * ここで固定していること：
 *   ① 入った日が同じで、入った時刻の差が60分以内なら、**押さずに**1枚だけ数える
 *   ② そのとき、売上・かかったお金・会計ソフト向けCSV・試算表が**同じ数字でそろう**
 *   ③ 数えなかった分は必ず出す（黙って減らさない）。「自動です」と書く
 *   ④ 入った時刻が**読めない**組は機械は決めない（今までどおり疑いとして出る）
 *   ⑤ 入った日が**違う**／時刻が**離れている**組も機械は決めない
 *   ⑥ 人が［2枚とも本物］を押した組は、機械が上書きしない（人の決めたほうが勝つ）
 *   ⑦ 外から確かめる窓口が「自動で何組 片付いたか」を答える
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { findDuplicateReports } from "@/lib/keiri/duplicates";
import { buildOneSheet } from "@/lib/keiri/oneSheet";
import { defaultSettingsFor, templateFor } from "@/lib/keiri/index";
import {
  SAME_REPORT_BOTH_REASON,
  readReportDupMarks,
  reportDupGroupKey,
} from "@/lib/keiri/reportDups";
import {
  RESAVE_WINDOW_MINUTES,
  findResavedAllMonths,
  findResavedReportDups,
  resavedKeySet,
  withResaveMarks,
} from "@/lib/keiri/reportResave";
import { buildReportDupWindow } from "@/lib/keiri/reportDupWindow";
import type { KeiriReport } from "@/lib/keiri/types";

function rep(over: Partial<KeiriReport> & { date: string; id: string }): KeiriReport {
  return {
    id: over.id,
    date: over.date,
    location: over.location ?? "ニシムタ",
    staff_name: over.staff_name ?? "ゆうや",
    shop: over.shop ?? "手羽屋",
    unit_number: over.unit_number ?? 1,
    sales_amount: over.sales_amount ?? 21_400,
    labor: over.labor ?? 0,
    expenses: over.expenses ?? [{ description: "氷", amount: 5_000 }],
    created_at: over.created_at ?? null,
  } as KeiriReport;
}

/**
 * 10月の実データの形。
 * 10/11 は 10/13 17:02 と 17:14、10/12 は 10/13 17:05 と 17:17（＝12分あけた入れ直し）。
 * 日本時間なので UTC では8:02 等になる。
 */
function octoberReports(): KeiriReport[] {
  return [
    rep({ date: "2026-10-11", id: "a1", created_at: "2026-10-13T08:02:00.000Z" }),
    rep({ date: "2026-10-11", id: "a2", created_at: "2026-10-13T08:14:00.000Z" }),
    rep({
      date: "2026-10-12",
      id: "b1",
      sales_amount: 23_650,
      expenses: [{ description: "炭", amount: 5_317 }],
      created_at: "2026-10-13T08:05:00.000Z",
    }),
    rep({
      date: "2026-10-12",
      id: "b2",
      sales_amount: 23_650,
      expenses: [{ description: "炭", amount: 5_317 }],
      created_at: "2026-10-13T08:17:00.000Z",
    }),
    rep({
      date: "2026-10-13",
      id: "c1",
      sales_amount: 30_000,
      expenses: [],
      created_at: "2026-10-13T09:00:00.000Z",
    }),
  ];
}

const SETTINGS = { ...defaultSettingsFor("tebaya"), opening_date: "2026-10-01" };

function sheetOf(reports: KeiriReport[], marks?: ReturnType<typeof readReportDupMarks>) {
  return buildOneSheet({
    ym: "2026-10",
    monthLabel: "2026年10月",
    shopName: "手羽屋",
    reports,
    payments: [],
    advances: [],
    settings: SETTINGS,
    template: templateFor("tebaya"),
    madeOn: "2026-11-03",
    reportDupMarks: marks,
  });
}

function headlineYen(sheet: ReturnType<typeof buildOneSheet>, label: string): number {
  const line = sheet.headline.find((l) => l.label.startsWith(label));
  if (!line) throw new Error(`見出しに「${label}」がありません`);
  return line.yen;
}

/* ---- ①② 押さずに1枚だけ数え、数字がそろう ---- */

test("同じ日に12分あけて入れ直された日報は、押さずに1枚だけ数える", () => {
  const sheet = sheetOf(octoberReports());
  assert.equal(sheet.reportCount, 3);
  assert.equal(headlineYen(sheet, "売上"), 21_400 + 23_650 + 30_000);
  // 疑いは残らない（人の手なしで片付いた）
  assert.equal(sheet.review.sameReport ?? null, null);
  // 3通りの数え方がそろい、1枚を出せる
  assert.equal(sheet.expenseCheck.same, true);
  assert.equal(sheet.verify.profitOk, true);
  assert.equal(sheet.verify.trialOk, true);
  assert.equal(sheet.verify.ok, true);
  assert.deepEqual(sheet.verify.problems, []);
});

/* ---- ③ 数えなかった分は必ず出す ---- */

test("自動で数えなかった分は、件数・金額・「自動です」を必ず出す", () => {
  const sheet = sheetOf(octoberReports());
  const skipped = sheet.review.sameReportSkipped;
  assert.ok(skipped, "数えなかった分が出ていません");
  assert.equal(skipped.count, 2);
  assert.equal(skipped.salesYen, 21_400 + 23_650);
  assert.equal(skipped.autoCount, 2);
  assert.ok(String(skipped.autoNote ?? "").includes("自動"));
  // 「確かめてほしいこと」としては出し続ける（黙って減らさない）
  assert.equal(sheet.review.any, true);
});

/* ---- ④ 入った時刻が読めない組は、機械は決めない ---- */

test("入った時刻が読めない組は、今までどおり疑いとして出る", () => {
  const reports = octoberReports().map((r) => ({ ...r, created_at: null }));
  const sheet = sheetOf(reports);
  assert.equal(sheet.reportCount, 5);
  assert.equal(sheet.review.sameReport?.count, 2);
  assert.equal(sheet.review.sameReportSkipped ?? null, null);
});

test("片方だけ時刻が読めない組も、機械は決めない", () => {
  const reports = octoberReports().map((r) => (r.id === "a2" ? { ...r, created_at: null } : r));
  const resaved = findResavedAllMonths({ reports });
  assert.deepEqual(
    resaved.map((r) => r.enteredOn),
    ["2026-10-13"],
  );
  assert.equal(resaved.length, 1, "時刻が読めない組は入れ直しとみない");
});

/* ---- ⑤ 入った日が違う／時刻が離れている組は、機械は決めない ---- */

test("入った日が違う組は、機械は決めない", () => {
  const reports = octoberReports().map((r) =>
    r.id === "a2" ? { ...r, created_at: "2026-10-14T08:14:00.000Z" } : r,
  );
  const keys = resavedKeySet(findResavedAllMonths({ reports }));
  assert.equal(keys.size, 1, "10/12 の組だけが入れ直し");
  const sheet = sheetOf(reports);
  assert.equal(sheet.reportCount, 4);
  assert.equal(sheet.review.sameReport?.count, 1);
});

test(`入った時刻の差が ${RESAVE_WINDOW_MINUTES}分 を超える組は、機械は決めない`, () => {
  const over = new Date(
    Date.parse("2026-10-13T08:02:00.000Z") + (RESAVE_WINDOW_MINUTES + 1) * 60_000,
  ).toISOString();
  const reports = octoberReports().map((r) => (r.id === "a2" ? { ...r, created_at: over } : r));
  const keys = resavedKeySet(findResavedAllMonths({ reports }));
  assert.equal(keys.size, 1);
  const sheet = sheetOf(reports);
  assert.equal(sheet.reportCount, 4);
});

test(`差がちょうど ${RESAVE_WINDOW_MINUTES}分 なら入れ直しとみる（境目）`, () => {
  const edge = new Date(
    Date.parse("2026-10-13T08:02:00.000Z") + RESAVE_WINDOW_MINUTES * 60_000,
  ).toISOString();
  const reports = octoberReports().map((r) => (r.id === "a2" ? { ...r, created_at: edge } : r));
  assert.equal(resavedKeySet(findResavedAllMonths({ reports })).size, 2);
});

/* ---- ⑥ 人が決めたほうが勝つ ---- */

test("［2枚とも本物］を押した組は、機械が上書きしない", () => {
  const reports = octoberReports();
  const groups = findDuplicateReports({ ym: "2026-10", reports }).groups;
  const marks = readReportDupMarks([
    {
      group: reportDupGroupKey(groups[0]),
      ref_ids: ["a2"],
      sales: 21_400,
      happened_on: "2026-10-11",
      reason: SAME_REPORT_BOTH_REASON,
      undone_at: "2026-11-03T00:00:00.000Z",
    },
  ]);
  const resaved = findResavedReportDups({
    check: findDuplicateReports({ ym: "2026-10", reports }),
    reports,
    marks,
  });
  assert.equal(resaved.length, 1, "人が決めた組は機械が触らない");
  const sheet = sheetOf(reports, marks);
  // 10/11 は両方 数える（4件）・10/12 は自動で1枚
  assert.equal(sheet.reportCount, 4);
  assert.equal(headlineYen(sheet, "売上"), 21_400 * 2 + 23_650 + 30_000);
});

test("印を足しても、人の印は1つも消えない", () => {
  const reports = octoberReports();
  const groups = findDuplicateReports({ ym: "2026-10", reports }).groups;
  const human = readReportDupMarks([
    {
      group: reportDupGroupKey(groups[0]),
      ref_ids: ["a2"],
      sales: 21_400,
      happened_on: "2026-10-11",
      reason: SAME_REPORT_BOTH_REASON,
      undone_at: "2026-11-03T00:00:00.000Z",
    },
  ]);
  const merged = withResaveMarks(findResavedAllMonths({ reports, marks: human }), human);
  assert.equal(merged.bothCounted.has(reportDupGroupKey(groups[0])), true);
  assert.equal(merged.countOnce.has(reportDupGroupKey(groups[1])), true);
  assert.equal(merged.skipIds.has("a2"), false, "両方数えると決めた行は外さない");
  assert.equal(merged.skipIds.has("b2"), true);
});

/* ---- ⑦ 外から確かめる窓口 ---- */

test("外から確かめる窓口が「自動で何組 片付いたか」を答える", () => {
  const reports = octoberReports();
  const check = findDuplicateReports({ ym: "2026-10", reports });
  const w = buildReportDupWindow({
    check,
    marks: null,
    store: "memo",
    resaved: findResavedReportDups({ check, reports }),
  });
  assert.equal(w.groups, 2);
  assert.equal(w.auto, 2);
  assert.equal(w.pending, 0);
  assert.equal(w.decided, 0);
  assert.equal(w.extraReports, 0);
  assert.ok(w.note.includes("自動"));
});

test("入った時刻が読めないときは、窓口も自動0組と答える", () => {
  const reports = octoberReports().map((r) => ({ ...r, created_at: null }));
  const check = findDuplicateReports({ ym: "2026-10", reports });
  const w = buildReportDupWindow({
    check,
    marks: null,
    store: "memo",
    resaved: findResavedReportDups({ check, reports }),
  });
  assert.equal(w.auto, 0);
  assert.equal(w.pending, 2);
  assert.equal(w.choosable, 2);
});

/* ---- 日報は1行も消さない ---- */

test("日報そのものは1行も消さない・1円も書き換えない", () => {
  const reports = octoberReports();
  const before = JSON.stringify(reports);
  sheetOf(reports);
  assert.equal(JSON.stringify(reports), before);
});
