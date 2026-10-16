import { test } from "node:test";
import assert from "node:assert/strict";

import {
  advanceReturnGapWindow,
  countAdvanceReturnGap,
} from "../lib/keiri/advanceReturnGap";
import { normalizeOwnerAdvance } from "../lib/keiri/advances";
import { buildJournalRows, calcCashPosition, TEBAYA_TEMPLATE } from "../lib/keiri";
import type { KeiriSettings } from "../lib/keiri";

/**
 * 「表には出るのに金庫からは引かない返金」を数える所を固定する
 * （2026-10-16・kp254・f1-7／f1-4）。
 *
 * 下の6件は tests/keiriAdvanceReturn.test.ts と同じ A〜F です
 * （B2 の材料 meta/keiri-material-tatekae-henkin-1015 と同じ値）。
 * そのうち E（8/01 に立て替え・9/05 に返した）だけが、数え始め 9/10 より前の返金です。
 */
const settings: KeiriSettings = {
  opening_date: "2026-09-10",
  opening_balance: 100000,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

const advances = [
  { date: "2026-08-20", amount: 5000, description: "食材", settled: true, settled_date: "2026-09-15" },
  { date: "2026-06-25", amount: 8000, description: "消耗品", settled: true, settled_date: "2026-09-15" },
  { date: "2026-09-12", amount: 3000, description: "食材", settled: true, settled_date: "2026-09-20" },
  { date: "2026-09-25", amount: 4000, description: "食材", settled: true, settled_date: "2026-10-03" },
  { date: "2026-08-01", amount: 6000, description: "食材", settled: true, settled_date: "2026-09-05" },
  { date: "2026-08-28", amount: 2000, description: "食材", settled: false, settled_date: null },
].map(normalizeOwnerAdvance);

test("数え始めより前に返した立替を1行だけ数える（E）", () => {
  const counted = countAdvanceReturnGap({
    ym: "2026-09",
    openingDate: "2026-09-10",
    advances,
  });
  assert.equal(counted.rows, 1);
  assert.equal(counted.csvRowDelta, 1);
});

test("数えた行数は、表には出るが金庫からは引かない行（E）を指している", () => {
  const rows = buildJournalRows({
    ym: "2026-09",
    reports: [],
    payments: [],
    settings,
    template: TEBAYA_TEMPLATE,
    advances,
  });
  const refunds = rows.filter((r) => r.note.includes("返金"));
  const cash = calcCashPosition({
    reports: [],
    payments: [],
    settings,
    advances,
    asOf: "2026-09-30",
  });
  const refundTotal = refunds.reduce((s, r) => s + r.creditAmount, 0);
  // 表は4行（E も残す）・金庫は3件ぶんしか引かない＝差が1行ある。これが正しい形（kp254）
  assert.equal(refunds.length, 4);
  assert.notEqual(refundTotal, cash.advancesSettled);
  const counted = countAdvanceReturnGap({
    ym: "2026-09",
    openingDate: "2026-09-10",
    advances,
  });
  assert.equal(counted.rows, 1);
  // ★行を消してそろえない。数えるのは「金庫の画面にひとこと出すか」を決めるためだけ
  assert.match(
    advanceReturnGapWindow({
      ym: "2026-09",
      openingDate: "2026-09-10",
      advances,
      readable: true,
    }).summary,
    /行を消してそろえないこと/,
  );
});

test("数え始めが月初なら0行（起点より前に返した分が無い）", () => {
  const counted = countAdvanceReturnGap({
    ym: "2026-09",
    openingDate: "2026-09-01",
    advances,
  });
  assert.equal(counted.rows, 0);
  assert.equal(counted.csvRowDelta, 0);
});

test("返した日が無い（印だけ付いている）行は、立て替えた日で見る", () => {
  const noDate = [
    { date: "2026-09-03", amount: 1000, description: "食材", settled: true, settled_date: null },
  ].map(normalizeOwnerAdvance);
  assert.equal(
    countAdvanceReturnGap({ ym: "2026-09", openingDate: "2026-09-10", advances: noDate }).rows,
    1,
  );
});

test("金額0円の行は表に出ないので、表に出る行数には数えない", () => {
  const zero = [
    { date: "2026-09-02", amount: 0, description: "食材", settled: true, settled_date: "2026-09-05" },
  ].map(normalizeOwnerAdvance);
  const counted = countAdvanceReturnGap({ ym: "2026-09", openingDate: "2026-09-10", advances: zero });
  assert.equal(counted.rows, 1);
  assert.equal(counted.csvRowDelta, 0);
});

test("数え始めが決まっていなければ、数えない", () => {
  assert.equal(
    countAdvanceReturnGap({ ym: "2026-09", openingDate: "", advances }).rows,
    0,
  );
});

test("外から読む形は、金額を1円も入れない", () => {
  const w = advanceReturnGapWindow({
    ym: "2026-09",
    openingDate: "2026-09-10",
    advances,
    readable: true,
  });
  assert.equal(w.readable, true);
  assert.equal(w.differs, true);
  assert.equal(w.rows, 1);
  assert.equal(w.csvRowDelta, 1);
  const text = JSON.stringify(w);
  // 6,000円（E の金額）が どこにも出ていないこと
  assert.equal(text.includes("6000"), false);
  assert.equal(text.includes("6,000"), false);
});

test("棚が読めなかったときは、0行と言い切らない", () => {
  const w = advanceReturnGapWindow({
    ym: "2026-09",
    openingDate: "2026-09-10",
    advances,
    readable: false,
  });
  assert.equal(w.readable, false);
  assert.equal(w.differs, false);
  assert.match(w.summary, /取り違えない/);
});

test("数えないと理由が付いた行は、表にも出ないので数えない", () => {
  const skipped = [
    {
      date: "2026-09-02",
      amount: 1000,
      description: "食材",
      settled: true,
      settled_date: "2026-09-05",
    },
  ].map(normalizeOwnerAdvance);
  skipped[0].skipReason = "同じ支払いが日報にもある";
  assert.equal(
    countAdvanceReturnGap({ ym: "2026-09", openingDate: "2026-09-10", advances: skipped }).rows,
    0,
  );
});
