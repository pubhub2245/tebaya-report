/**
 * 「同じ日報が2枚あるときに、どちらを数えるか押して決められる」ことを固定するテスト
 *                                       （2026-11-03・kp246・f1-5）。
 *
 * ここで固定していること：
 *   ① 決めるまでは**両方 数える**（黙って減らさない）
 *   ② ［1枚だけ数える］を選ぶと、余分な1枚が**行ごと**外れ、
 *      売上・かかったお金・会計ソフト向けCSV・試算表が**同じ数字でそろう**
 *   ③ ［2枚とも本物］を選ぶと、数字は変わらないまま「確かめてほしいこと」から外れる
 *   ④ 「元に戻す」で、印は消さずに効かなくなる（また疑いとして出る）
 *   ⑤ 控え（経理の設定のひとこと欄）は、もとの文もほかの控えも壊さない
 *   ⑥ まだ決めていない組の行は、会計ソフト向けの表の摘要に「要確認」が付く
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { findDuplicateReports } from "@/lib/keiri/duplicates";
import { buildOneSheet } from "@/lib/keiri/oneSheet";
import { buildJournalRows, REVIEW_SAME_REPORT_NOTE } from "@/lib/keiri/journal";
import { defaultSettingsFor, templateFor } from "@/lib/keiri/index";
import {
  SAME_REPORT_BOTH_REASON,
  SAME_REPORT_IGNORE_REASON,
  canChooseReportDup,
  excludeDecidedDuplicateReports,
  laterIdsOf,
  pendingReportDupGroups,
  pendingReportIds,
  readReportDupMarks,
  reportDupDecision,
  reportDupGroupKey,
  reportDupWriteFor,
} from "@/lib/keiri/reportDups";
import {
  addReportDupToMemo,
  decodeReportDupMemo,
  stripReportDupMemo,
  undoReportDupInMemo,
} from "@/lib/keiri/reportDupMemo";
import {
  buildReportDupWindow,
  simulateCountOnceMarks,
} from "@/lib/keiri/reportDupWindow";
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
  } as KeiriReport;
}

/** 10月の実データの形（10/11・10/12 が2枚ずつ・あとの1枚が入れ直し） */
function octoberReports(): KeiriReport[] {
  return [
    rep({ date: "2026-10-11", id: "a1", sales_amount: 21_400, expenses: [{ description: "氷", amount: 5_000 }] }),
    rep({ date: "2026-10-11", id: "a2", sales_amount: 21_400, expenses: [{ description: "氷", amount: 5_000 }] }),
    rep({ date: "2026-10-12", id: "b1", sales_amount: 23_650, expenses: [{ description: "炭", amount: 5_317 }] }),
    rep({ date: "2026-10-12", id: "b2", sales_amount: 23_650, expenses: [{ description: "炭", amount: 5_317 }] }),
    rep({ date: "2026-10-13", id: "c1", sales_amount: 30_000, expenses: [] }),
  ];
}

const SETTINGS = { ...defaultSettingsFor("tebaya"), opening_date: "2026-10-01" };

/** 1枚の見出しの金額を名前で引く（売上・かかったお金・残ったお金） */
function headlineYen(sheet: ReturnType<typeof buildOneSheet>, label: string): number {
  const line = sheet.headline.find((l) => l.label.startsWith(label));
  if (!line) throw new Error(`見出しに「${label}」がありません`);
  return line.yen;
}

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

/* ---- ① 決めるまでは両方 数える ---- */

test("決めるまでは両方 数える（黙って減らさない）", () => {
  const sheet = sheetOf(octoberReports());
  assert.equal(sheet.reportCount, 5);
  assert.equal(headlineYen(sheet, "売上"), 21_400 * 2 + 23_650 * 2 + 30_000);
  assert.equal(sheet.review.sameReport?.count, 2);
  assert.equal(sheet.review.sameReportSkipped ?? null, null);
});

/* ---- ② ［1枚だけ数える］で、余分な1枚が行ごと外れる ---- */

test("［1枚だけ数える］を2組に選ぶと、件数と売上が重なりを除いた値になる", () => {
  const groups = findDuplicateReports({ ym: "2026-10", reports: octoberReports() }).groups;
  assert.equal(groups.length, 2);
  const rows = groups.map((g) => reportDupWriteFor(g, "count-once"));
  assert.ok(rows.every((r) => r !== null));
  const marks = readReportDupMarks(rows.map((r) => r!));
  // 外れるのは並びのあとの行だけ
  assert.deepEqual([...marks.skipIds].sort(), ["a2", "b2"]);

  const sheet = sheetOf(octoberReports(), marks);
  assert.equal(sheet.reportCount, 3);
  assert.equal(headlineYen(sheet, "売上"), 21_400 + 23_650 + 30_000);
  // かかったお金は、家賃・外注費も入るので差で見る（経費の二重分 10,317円だけ下がる）
  const before = sheetOf(octoberReports());
  assert.equal(
    before.expenseTotal - sheet.expenseTotal,
    5_000 + 5_317 + Math.floor((21_400 + 23_650) * 0.1),
  );
  // 疑いは「確かめてほしいこと」から消え、数えなかった分が理由つきで出る
  assert.equal(sheet.review.sameReport, null);
  assert.equal(sheet.review.sameReportSkipped?.count, 2);
  assert.equal(sheet.review.sameReportSkipped?.salesYen, 21_400 + 23_650);
  // 3通りの数え方がそろい、試算表の左右も合う＝1枚を出せる
  assert.equal(sheet.expenseCheck.same, true);
  assert.equal(sheet.verify.trialOk, true);
  assert.equal(sheet.verify.ok, true);
});

test("どちらの1枚を外しても、月の数字は1円も変わらない（中身が同じ2枚だから）", () => {
  const reports = octoberReports();
  const a = sheetOf(reports, readReportDupMarks([
    { group: reportDupGroupKey({ date: "2026-10-11", shop: "手羽屋", unit: "1", location: "ニシムタ", staff: "ゆうや", sales: 21_400, expenseTotal: 5_000 }), ref_ids: ["a2"], sales: 21_400, happened_on: "2026-10-11", reason: SAME_REPORT_IGNORE_REASON, undone_at: null },
  ]));
  const b = sheetOf(reports, readReportDupMarks([
    { group: reportDupGroupKey({ date: "2026-10-11", shop: "手羽屋", unit: "1", location: "ニシムタ", staff: "ゆうや", sales: 21_400, expenseTotal: 5_000 }), ref_ids: ["a1"], sales: 21_400, happened_on: "2026-10-11", reason: SAME_REPORT_IGNORE_REASON, undone_at: null },
  ]));
  assert.equal(headlineYen(a, "売上"), headlineYen(b, "売上"));
  assert.equal(a.expenseTotal, b.expenseTotal);
  assert.equal(headlineYen(a, "残ったお金"), headlineYen(b, "残ったお金"));
});

/* ---- ③ ［2枚とも本物］ ---- */

test("［2枚とも本物］を選ぶと、数字は変わらないまま疑いから外れる", () => {
  const groups = findDuplicateReports({ ym: "2026-10", reports: octoberReports() }).groups;
  const marks = readReportDupMarks(groups.map((g) => reportDupWriteFor(g, "both")!));
  assert.equal(marks.skipIds.size, 0);
  assert.equal(reportDupDecision(groups[0], marks), "both");
  const sheet = sheetOf(octoberReports(), marks);
  assert.equal(sheet.reportCount, 5);
  assert.equal(headlineYen(sheet, "売上"), 21_400 * 2 + 23_650 * 2 + 30_000);
  assert.equal(sheet.review.sameReport, null);
});

/* ---- ④ 元に戻す ---- */

test("元に戻すと、印は消えずに効かなくなる（また疑いとして出る）", () => {
  const groups = findDuplicateReports({ ym: "2026-10", reports: octoberReports() }).groups;
  const key = reportDupGroupKey(groups[0]);
  const memo = addReportDupToMemo("金庫の控えはこのまま", reportDupWriteFor(groups[0], "count-once"));
  assert.ok(memo);
  assert.equal(decodeReportDupMemo(memo).length, 1);
  const undone = undoReportDupInMemo(memo, key);
  assert.equal(undone.changed, 1);
  const rows = decodeReportDupMemo(undone.memo);
  // 印そのものは消えていない
  assert.equal(rows.length, 1);
  const marks = readReportDupMarks(rows);
  assert.equal(marks.skipIds.size, 0);
  assert.equal(reportDupDecision(groups[0], marks), "pending");
  // 印が無い組を戻そうとしたら「0件」＝「戻しました」と言わせない
  assert.equal(undoReportDupInMemo(memo, "どこにも無い組").changed, 0);
});

/* ---- ⑤ 控えが、もとの文を壊さない ---- */

test("控えは、もとのひとことを消さない（印ごと外せば元の文に戻る）", () => {
  const base = "いつものひとこと\n\n［数えない印の控え v1 ここから］\n{}\n［数えない印の控え v1 ここまで］";
  const groups = findDuplicateReports({ ym: "2026-10", reports: octoberReports() }).groups;
  const memo = addReportDupToMemo(base, reportDupWriteFor(groups[0], "count-once"));
  assert.ok(memo);
  // ほかの控え（同じ支払いの二重）の印は1文字も触らない
  assert.ok(memo!.includes("［数えない印の控え v1 ここから］"));
  assert.ok(memo!.includes("いつものひとこと"));
  assert.equal(stripReportDupMemo(memo), base.trim());
});

test("読めない控えは読み飛ばす（その組は『まだ決めていない』に戻る）", () => {
  const memo =
    "［同じ日報の控え v1 ここから］\n{\"group\":\"\",\"ref_ids\":[\"x\"],\"sales\":1,\"reason\":\"同じ日報なので数えない\"}\nこれは JSON ではない\n［同じ日報の控え v1 ここまで］";
  assert.deepEqual(decodeReportDupMemo(memo), []);
});

/* ---- ⑥ 会計ソフト向けの表に「要確認」が付く ---- */

test("まだ決めていない組の行は、会計ソフト向けの表の摘要に『要確認』が付く", () => {
  const reports = octoberReports();
  const check = findDuplicateReports({ ym: "2026-10", reports });
  const ids = pendingReportIds(check, null);
  assert.deepEqual([...ids].sort(), ["a1", "a2", "b1", "b2"]);
  const rows = buildJournalRows({
    ym: "2026-10",
    reports,
    payments: [],
    template: templateFor("tebaya"),
    settings: SETTINGS,
    reviewReportIds: ids,
  });
  const marked = rows.filter((r) => r.note.includes(REVIEW_SAME_REPORT_NOTE));
  // 10/11・10/12 の売上と経費の行（2枚ずつ）に付き、10/13 には付かない
  assert.equal(marked.length, 8);
  assert.equal(
    rows.filter((r) => r.date === "2026-10-13" && r.note.includes(REVIEW_SAME_REPORT_NOTE)).length,
    0,
  );

  // 決めたあとは「要確認」が付く行が無くなる（行そのものが外れる）
  const marks = readReportDupMarks(check.groups.map((g) => reportDupWriteFor(g, "count-once")!));
  const kept = excludeDecidedDuplicateReports({ reports, marks }).reports;
  const after = buildJournalRows({
    ym: "2026-10",
    reports: kept,
    payments: [],
    template: templateFor("tebaya"),
    settings: SETTINGS,
    reviewReportIds: pendingReportIds(findDuplicateReports({ ym: "2026-10", reports: kept }), marks),
  });
  assert.equal(after.filter((r) => r.note.includes(REVIEW_SAME_REPORT_NOTE)).length, 0);
});

/* ---- 外から確かめる窓口の形 ---- */

test("外から確かめる窓口が、残っている組と『選んだらどうなるか』を出す（押さない）", () => {
  const reports = octoberReports();
  const check = findDuplicateReports({ ym: "2026-10", reports });
  const simulated = simulateCountOnceMarks(check, null);
  const win = buildReportDupWindow({
    check,
    marks: null,
    store: "memo",
    ifCountedOnce: sheetOf(reports, simulated),
  });
  assert.equal(win.groups, 2);
  assert.equal(win.pending, 2);
  assert.equal(win.decided, 0);
  assert.equal(win.extraReports, 2);
  assert.equal(win.choosable, 2);
  assert.equal(win.ifCountedOnce?.reportCount, 3);
  assert.equal(win.ifCountedOnce?.expenseSame, true);
  assert.equal(win.ifCountedOnce?.trialOk, true);
  assert.equal(win.ifCountedOnce?.sheetReady, true);
  assert.equal(win.ifCountedOnce?.sameReportCleared, true);
});

test("日報の番号が読めない組は、押して決められない（勝手に外さない）", () => {
  const nameless = [
    rep({ date: "2026-10-11", id: "" }),
    rep({ date: "2026-10-11", id: "" }),
  ].map((r) => ({ ...r, id: null }));
  const groups = findDuplicateReports({ ym: "2026-10", reports: nameless }).groups;
  assert.equal(groups.length, 1);
  assert.equal(canChooseReportDup(groups[0]), false);
  assert.deepEqual(laterIdsOf(groups[0]), []);
  assert.equal(reportDupWriteFor(groups[0], "count-once"), null);
  const win = buildReportDupWindow({ check: { groups, extraReports: 1, extraSalesTotal: 21_400, extraExpenseTotal: 5_000 }, marks: null, store: "memo" });
  assert.equal(win.choosable, 0);
});

test("決めた組は「確かめてほしいこと」から外れ、残りだけが数えられる", () => {
  const check = findDuplicateReports({ ym: "2026-10", reports: octoberReports() });
  const marks = readReportDupMarks([reportDupWriteFor(check.groups[0], "count-once")!]);
  const pending = pendingReportDupGroups(check, marks);
  assert.equal(pending.groups.length, 1);
  assert.equal(pending.groups[0].date, "2026-10-12");
  assert.equal(pending.extraSalesTotal, 23_650);
});

test("「2枚とも本物」は効かせない印として残る（理由で見分ける）", () => {
  const check = findDuplicateReports({ ym: "2026-10", reports: octoberReports() });
  const row = reportDupWriteFor(check.groups[0], "both")!;
  assert.equal(row.reason, SAME_REPORT_BOTH_REASON);
  assert.ok(row.undone_at);
});
