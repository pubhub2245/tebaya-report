/**
 * 金庫の計算が「同じ中身の日報が2枚」を 経理の画面・1枚の要約と**同じように**数えるか
 * （lib/keiri/cashDupReports.ts・2026-11-15・f1-4）。
 *
 * ■ なぜ要るか
 *   画面と1枚の要約は、同じ日に入れ直された余分な1枚を 人が押さなくても数えません。
 *   金庫の合否を測る窓口だけが全部 数えていたので、同じ倉庫を見ているのに
 *   「計算上の現金」が2通りに分かれていました（10月ぶんで 34,733円）。
 *   帳簿が合っていても f1-4 が不合格に見えるので、ここで固定します。
 *
 * ■ ここで守ること
 *   ① 印も入れ直しも無ければ、**渡した日報がそのまま返る**（今までと1円も変わらない）
 *   ② 読めなかった日に「0組」と言わない
 *   ③ まだ決めていない組は**外さない**（黙って売上を減らさない）。幅としてだけ出す
 *   ※ 日付・金額は作り物です。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCashDupReportsWindow,
  measureCashDupReports,
} from "../lib/keiri/cashDupReports";
import { sameReportPiece, measureCashDiffCoverage } from "../lib/keiri/cashDiffCoverage";
import type { KeiriReport } from "../lib/keiri/types";

function report(over: Partial<KeiriReport> & { id: string; date: string }): KeiriReport {
  return {
    id: over.id,
    date: over.date,
    shop: "手羽屋",
    location: "テスト広場",
    staff_name: "テスト太郎",
    unit_number: "1号車",
    sales_amount: 20000,
    labor: 0,
    expenses: [{ description: "氷", amount: 5000 }],
    created_at: "2026-10-13T08:02:00.000Z",
    ...over,
  } as unknown as KeiriReport;
}

test("印も入れ直しも無ければ、日報は1行も外れない", () => {
  const reports = [
    report({ id: "a", date: "2026-10-01" }),
    report({ id: "b", date: "2026-10-02", sales_amount: 30000 }),
  ];
  const r = measureCashDupReports({ reports, openingDate: "2026-09-01", asOf: "2026-10-31" });
  assert.equal(r.reports.length, 2);
  assert.equal(r.skipped.length, 0);
  assert.equal(r.gap.readable, true);
  assert.equal(r.gap.autoGroups, 0);
  assert.equal(r.gap.pendingGroups, 0);
  assert.equal(r.gap.pendingNet, 0);
  assert.match(r.gap.note, /2枚 入っている組はありません/);
});

test("同じ日に数分あけて入れ直された1枚は、画面と同じように数えない", () => {
  const reports = [
    report({ id: "a", date: "2026-10-11", created_at: "2026-10-13T08:02:00.000Z" }),
    report({ id: "b", date: "2026-10-11", created_at: "2026-10-13T08:14:00.000Z" }),
  ];
  const r = measureCashDupReports({ reports, openingDate: "2026-09-01", asOf: "2026-10-31" });
  assert.equal(r.reports.length, 1, "余分な1枚だけが外れる");
  assert.equal(r.reports[0].id, "a", "先に入った1枚を残す");
  assert.equal(r.skipped.length, 1);
  assert.equal(r.gap.autoGroups, 1);
  assert.equal(r.gap.pendingGroups, 0, "機械が決めた分は『まだ決めていない』に数えない");
  assert.equal(r.gap.pendingNet, 0, "外したあとは、金庫の差にはもう効かない");
  assert.match(r.gap.note, /1枚だけ数えています/);
});

test("入った日が違う2枚は機械が決めない＝外さず、幅としてだけ出す", () => {
  const reports = [
    report({ id: "a", date: "2026-10-11", created_at: "2026-10-11T08:02:00.000Z" }),
    report({ id: "b", date: "2026-10-11", created_at: "2026-10-20T08:02:00.000Z" }),
  ];
  const r = measureCashDupReports({ reports, openingDate: "2026-09-01", asOf: "2026-10-31" });
  assert.equal(r.reports.length, 2, "黙って減らさない");
  assert.equal(r.gap.autoGroups, 0);
  assert.equal(r.gap.pendingGroups, 1);
  // 売上20,000 − 経費5,000 ＝ 15,000円 が二重に入っている
  assert.equal(r.gap.pendingNet, 15000);
  const piece = sameReportPiece(r.gap);
  assert.equal(piece.readable, true);
  assert.equal(piece.rows, 1);
  assert.equal(piece.lo, 0, "2枚とも本物なら ずれない＝下は0円");
  assert.equal(piece.hi, 15000, "入れ直しなら 計算上の現金がその分 多い");
});

test("数え始めより前・数えた日より後の組は、金庫の差に入れない", () => {
  const reports = [
    report({ id: "a", date: "2026-08-11", created_at: "2026-08-11T08:02:00.000Z" }),
    report({ id: "b", date: "2026-08-11", created_at: "2026-08-20T08:02:00.000Z" }),
  ];
  const r = measureCashDupReports({ reports, openingDate: "2026-09-01", asOf: "2026-10-31" });
  assert.equal(r.gap.pendingGroups, 0);
  assert.equal(r.gap.pendingNet, 0);
});

test("読めなかった日は『0組』と言わない", () => {
  const r = measureCashDupReports({ reports: [], unreadable: true });
  assert.equal(r.gap.readable, false);
  assert.match(r.gap.note, /0組という意味ではありません/);
  const w = buildCashDupReportsWindow(r.gap);
  assert.equal(w.readable, false);
  assert.equal(w.shown, false);
  // 読めていない分は「幅」に足さない＝言い切らない
  const c = measureCashDiffCoverage({ diff: 15000, pieces: [sameReportPiece(r.gap)] });
  assert.equal(c.covered, null, "読めていない所があるので、合否を言い切らない");
});

test("決めていない分が差を説明できるときは、名前の付かない差にしない", () => {
  const gap = { readable: true, pendingGroups: 1, pendingNet: 34733 };
  const c = measureCashDiffCoverage({ diff: 34733, pieces: [sameReportPiece(gap)] });
  assert.equal(c.covered, true);
  assert.equal(c.rest, 0);
  assert.ok(c.namedLabels.includes("同じ中身の日報が2枚（まだ決めていない分）"));
});

test("窓口は金額を1円も返さない", () => {
  const w = buildCashDupReportsWindow({
    readable: true,
    autoGroups: 2,
    decidedGroups: 0,
    pendingGroups: 0,
    skippedRows: 2,
    pendingNet: 0,
    note: "テスト",
  });
  const s = JSON.stringify(w);
  assert.equal(/\d{1,3},\d{3}円/.test(s), false, "金額らしい数字を返していない");
  assert.equal(w.shown, true);
  assert.match(w.howto, /0組という意味ではありません/);
});
