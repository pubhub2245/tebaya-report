/**
 * 立替（たてかえ）を月の経費に足す部分のテスト（2026-10-02・kp218／kp219）。
 *
 * ■ ここで守ること
 *   ① 月の経費は **立替も含めた全部** で1つ。金庫から出た分も内訳として残る
 *   ② 立替は、立て替えた日に **現金を減らさない**（減るのは返した日）
 *   ③ まだ返していない立替は「まだ払っていないお金」に入る
 *   ④ 科目は **日報の経費とまったく同じ対応表** で自動で付く。
 *      当たらなければ雑費に置き、「要確認」に残す（勝手に決めない）
 *   ⑤ 外注費（売上から自動で計算する科目）の立替は、二重に数えないよう経費に足さず、
 *      理由をつけて画面に出す
 *   ⑥ 会計ソフト向けの仕訳の合計が、画面の経費の合計と1円も違わない
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  SKIP_OUTSOURCING,
  accountForAdvanceKind,
  advanceNote,
  calcCashPosition,
  calcUnpaid,
  normalizeFieldAdvance,
  normalizeOwnerAdvance,
  summarizeMonth,
  type KeiriAdvance,
  type KeiriReport,
  type KeiriSettings,
} from "../lib/keiri";
import { buildJournalRows } from "../lib/keiri/journal";
import { TEBAYA_TEMPLATE } from "../lib/keiri/templates/tebaya";

const YM = "2026-09";

const SETTINGS: KeiriSettings = {
  opening_date: "2026-09-01",
  opening_balance: 100000,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

const REPORTS: KeiriReport[] = [
  {
    date: "2026-09-02",
    location: "ながやま三股",
    sales_amount: 50000,
    labor: 8000,
    expenses: [{ description: "手羽先 仕入", amount: 12000 }],
  },
];

/** 出店料を振込で立て替えた（まだ返していない）／ガソリンを立て替えて月内に返した */
function advances(): KeiriAdvance[] {
  return [
    {
      date: "2026-09-12",
      amount: 385000,
      description: "JAM Night 出店料",
      payer: "立替者A",
      settled: false,
      source: "owner",
    },
    {
      date: "2026-09-14",
      amount: 5000,
      description: "ガソリン",
      payer: "立替者B",
      settled: true,
      settledDate: "2026-09-20",
      source: "owner",
    },
  ];
}

test("月の経費は立替も含めた全部1つで、金庫から出た分も内訳に残る", () => {
  const s = summarizeMonth({
    ym: YM,
    reports: REPORTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: advances(),
  });
  assert.equal(s.expenseFromRegister, 12000);
  assert.equal(s.expenseFromAdvance, 390000);
  assert.equal(s.advanceCount, 2);
  assert.equal(s.advanceUnsettled, 385000);
  // 科目：出店料に385,000・車両費に5,000・仕入に12,000
  assert.equal(s.expenseByAccount.booth_fee, 385000);
  assert.equal(s.expenseByAccount.vehicle, 5000);
  assert.equal(s.expenseByAccount.purchase, 12000);
  // 合計＝レジ＋立替＋日当（12,000＋390,000＋8,000）
  assert.equal(s.expenseTotal, 410000);
  assert.equal(s.profit, 50000 - 410000);
  // 科目ごとの合計も必ず同じ
  const byAccount = Object.values(s.expenseByAccount).reduce((t, v) => t + v, 0);
  assert.equal(byAccount, s.expenseTotal);
});

test("立替を渡さなければ、いままでとまったく同じ数字になる", () => {
  const before = summarizeMonth({
    ym: YM,
    reports: REPORTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
  });
  assert.equal(before.expenseFromAdvance, 0);
  assert.equal(before.expenseTotal, 12000 + 8000);
});

test("立て替えた日に現金は減らない。減るのは返した日", () => {
  const cash = calcCashPosition({
    reports: REPORTS,
    payments: [],
    settings: SETTINGS,
    advances: advances(),
  });
  // 100,000 ＋ 売上50,000 − レジの経費12,000 − 返した立替5,000
  assert.equal(cash.advancesSettled, 5000);
  assert.equal(cash.balance, 133000);
});

test("まだ返していない立替は「まだ払っていないお金」に入る", () => {
  const unpaid = calcUnpaid({
    reports: REPORTS,
    payments: [],
    settings: SETTINGS,
    currentYm: YM,
    advances: advances(),
  });
  assert.equal(unpaid.advance, 385000);
  // 給与8,000（日当）＋立替385,000
  assert.equal(unpaid.total, 8000 + 385000);
});

test("期首日より前に立て替えた分は「まだ払っていないお金」に数えない", () => {
  const unpaid = calcUnpaid({
    reports: REPORTS,
    payments: [],
    settings: SETTINGS,
    currentYm: YM,
    advances: [
      { date: "2026-08-20", amount: 1000, description: "場代", settled: false },
    ],
  });
  assert.equal(unpaid.advance, 0);
});

test("対応表に当たらない立替は、雑費に置いて「要確認」に残す", () => {
  const s = summarizeMonth({
    ym: YM,
    reports: [],
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: [
      { date: "2026-09-05", amount: 1881, description: "検便", payer: "イデ" },
    ],
  });
  assert.equal(s.expenseByAccount.misc, 1881);
  assert.equal(s.unmatched.length, 1);
  assert.equal(s.unmatched[0].from, "advance");
  assert.equal(s.unmatched[0].description, "検便（立替・イデ）");
  assert.equal(advanceNote({ date: "x", amount: 1, description: "検便" }), "検便（立替）");
});

test("外注費（売上から自動で計算する科目）の立替は、二重に数えない", () => {
  const field = normalizeFieldAdvance({
    expense_date: "2026-09-08",
    amount: 20000,
    payer: "じゅん",
    source_type: "outsourcing_commission",
    memo: "歩合",
  });
  assert.equal(field.skipReason, SKIP_OUTSOURCING);

  const s = summarizeMonth({
    ym: YM,
    reports: [],
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: [field],
  });
  assert.equal(s.expenseTotal, 0);
  assert.equal(s.advanceSkipped.length, 1);
  assert.equal(s.advanceSkipped[0].amount, 20000);
  assert.ok(s.advanceSkipped[0].reason.includes("外注費"));
  // 数えない立替は「まだ払っていないお金」にも入れない
  const unpaid = calcUnpaid({
    reports: [],
    payments: [],
    settings: SETTINGS,
    currentYm: YM,
    advances: [field],
  });
  assert.equal(unpaid.advance, 0);
});

test("現場の立替は「種類」から科目が決まる（文字より確か）", () => {
  assert.equal(accountForAdvanceKind("purchase_chicken"), "purchase");
  assert.equal(accountForAdvanceKind("booth_fee"), "booth_fee");
  assert.equal(accountForAdvanceKind("fuel_toll"), "vehicle");
  assert.equal(accountForAdvanceKind("payroll_parttime"), "payroll_daily");
  assert.equal(accountForAdvanceKind("tool_server"), "communication");
  // 対応表がまだ無いお店向けの形（advance_<科目>）も読める
  assert.equal(accountForAdvanceKind("advance_supplies"), "supplies");
  // 知らない名前は決めつけない（null＝文字から当てる）
  assert.equal(accountForAdvanceKind("advance_nanimono"), null);
  assert.equal(accountForAdvanceKind(""), null);
  // 家賃・人件費（月まとめ）・外注費は、ここから使わせない
  assert.equal(accountForAdvanceKind("advance_rent"), null);
  assert.equal(accountForAdvanceKind("advance_payroll"), null);
  assert.equal(accountForAdvanceKind("advance_outsourcing"), null);

  const row = normalizeFieldAdvance({
    expense_date: "2026-09-03",
    amount: 3000,
    payer: "なぎさ",
    source_type: "booth_fee",
    memo: "",
  });
  assert.equal(row.account, "booth_fee");
  assert.equal(row.settled, false); // 返した記録の欄がまだ無いので、未返金として数える
  assert.equal(row.source, "field");
});

test("経営側の立替は、返した日まで取り込める", () => {
  const row = normalizeOwnerAdvance({
    date: "2026-09-12",
    amount: 385000,
    payer: "立替者A",
    description: "JAM Night 出店料",
    settled: true,
    settled_date: "2026-09-25",
  });
  assert.equal(row.settled, true);
  assert.equal(row.settledDate, "2026-09-25");
  assert.equal(row.source, "owner");
  // 精算していない行の「返した日」は持ち越さない
  const open = normalizeOwnerAdvance({
    date: "2026-09-12",
    amount: 100,
    settled: false,
    settled_date: "2026-09-25",
  });
  assert.equal(open.settledDate, null);
});

test("会計ソフト向けの仕訳の合計が、画面の経費の合計と1円も違わない", () => {
  const list = advances();
  const s = summarizeMonth({
    ym: YM,
    reports: REPORTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: list,
  });
  const rows = buildJournalRows({
    ym: YM,
    reports: REPORTS,
    payments: [],
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: list,
  });
  // 借方のうち「現金」「未払金」以外＝経費の科目。その合計が経費の合計と一致する
  const expense = rows
    .filter((r) => r.debitAccount !== "現金" && r.debitAccount !== "未払金")
    .reduce((t, r) => t + r.debitAmount, 0);
  assert.equal(expense, s.expenseTotal);
  // 立替は現金ではなく未払金を相手にする（その日に金庫から出ていないため）
  const adv = rows.filter((r) => r.note.includes("（立替・"));
  assert.equal(adv.length, 2);
  for (const r of adv) assert.equal(r.creditAccount, "未払金");
  // 返金は未払金／現金で1行だけ
  const refund = rows.filter((r) => r.note.startsWith("立替の返金"));
  assert.equal(refund.length, 1);
  assert.equal(refund[0].date, "2026-09-20");
  assert.equal(refund[0].creditAccount, "現金");
  // どの行も借方と貸方が同じ金額（崩れていたら会計ソフトが受け取らない）
  for (const r of rows) assert.equal(r.debitAmount, r.creditAmount);
});
