import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calcCashPosition,
  type KeiriPayment,
  type KeiriReport,
  type KeiriSettings,
} from "../lib/keiri";
import {
  cashDiffCauses,
  daysBetween,
  depositsOf,
  diffDirection,
  latestCount,
  normalizeCashEvents,
  previewCashCount,
  reconcileCash,
  reconcileLines,
  type CashEvent,
} from "../lib/keiri/cashCheck";

/**
 * 金庫の突き合わせ（kp233・f1-4）の決まりを固定する。
 *
 * ■ ここで守りたいこと
 *   ① 銀行に入れた分は **現金だけ** を減らす。利益・科目別の経費には1円も入れない
 *   ② 突き合わせは **数えた日に揃える**（今日の計算と2週間前の実測を比べない）
 *   ③ 差は黙って合わせない。どちらが多いかを言葉で出す
 *   ④ 1回も数えていないときは「差」を作らない
 */

const settings: KeiriSettings = {
  opening_date: "2026-09-01",
  opening_balance: 100000,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

const reports: KeiriReport[] = [
  { date: "2026-09-02", location: "A", staff_name: "", sales_amount: 50000, labor: [], expenses: [] },
  { date: "2026-09-20", location: "A", staff_name: "", sales_amount: 30000, labor: [], expenses: [] },
] as unknown as KeiriReport[];

const payments: KeiriPayment[] = [];

test("銀行に入れた分は、現金だけを減らす（利益の計算には渡さない）", () => {
  const before = calcCashPosition({ reports, payments, settings });
  const after = calcCashPosition({
    reports,
    payments,
    settings,
    deposits: [{ date: "2026-09-10", amount: 40000 }],
  });
  assert.equal(before.balance, 180000);
  assert.equal(after.balance, 140000);
  assert.equal(after.deposits, 40000);
  // 売上・経費は1円も動かない（＝利益は変わらない）
  assert.equal(after.sales, before.sales);
  assert.equal(after.expenses, before.expenses);
});

test("期首日より前の預け入れは数えない", () => {
  const c = calcCashPosition({
    reports,
    payments,
    settings,
    deposits: [{ date: "2026-08-31", amount: 999999 }],
  });
  assert.equal(c.deposits, 0);
  assert.equal(c.balance, 180000);
});

test("asOf を渡すと、その日までの残高になる（数えた日に揃えるため）", () => {
  const atTenth = calcCashPosition({
    reports,
    payments,
    settings,
    deposits: [{ date: "2026-09-25", amount: 10000 }],
    asOf: "2026-09-10",
  });
  // 9/2 の売上だけが入り、9/20 の売上と 9/25 の預け入れはまだ入らない
  assert.equal(atTenth.balance, 150000);
  assert.equal(atTenth.deposits, 0);
});

test("asOf を渡さなければ、今までどおり全部を数える（既存の画面は変わらない）", () => {
  const all = calcCashPosition({ reports, payments, settings });
  assert.equal(all.balance, 180000);
  assert.equal(all.deposits, 0);
});

test("突き合わせ：ぴったり合っていれば、そう言う", () => {
  const events: CashEvent[] = [{ kind: "count", happened_on: "2026-09-10", amount: 150000 }];
  const computed = calcCashPosition({ reports, payments, settings, asOf: "2026-09-10" }).balance;
  const r = reconcileCash({ events, computedAtCount: computed, today: "2026-09-11" });
  assert.equal(r.diff, 0);
  assert.equal(r.verdict, "ぴったり合っています。");
  assert.equal(r.stale, null);
  assert.deepEqual(reconcileLines(r).length, 3);
});

test("突き合わせ：1,000円未満の差は「ほぼ合っています」", () => {
  const r = reconcileCash({
    events: [{ kind: "count", happened_on: "2026-09-10", amount: 149500 }],
    computedAtCount: 150000,
    today: "2026-09-11",
  });
  assert.equal(r.diff, 500);
  assert.match(r.verdict, /ほぼ合っています/);
});

test("突き合わせ：計算のほうが多ければ『金庫のほうが少ない』と言う", () => {
  const r = reconcileCash({
    events: [{ kind: "count", happened_on: "2026-09-10", amount: 120000 }],
    computedAtCount: 150000,
    today: "2026-09-11",
  });
  assert.equal(r.diff, 30000);
  assert.match(r.verdict, /金庫のほうが 30,000円 少ない/);
});

test("突き合わせ：計算のほうが少なければ『金庫のほうが多い』と言う", () => {
  const r = reconcileCash({
    events: [{ kind: "count", happened_on: "2026-09-10", amount: 180000 }],
    computedAtCount: 150000,
    today: "2026-09-11",
  });
  assert.equal(r.diff, -30000);
  assert.match(r.verdict, /金庫のほうが 30,000円 多い/);
});

test("30日以上 数えていなければ、数えるよう促す（差は出したまま）", () => {
  const r = reconcileCash({
    events: [{ kind: "count", happened_on: "2026-09-01", amount: 100000 }],
    computedAtCount: 100000,
    today: "2026-10-05",
  });
  assert.equal(r.daysSince, 34);
  assert.ok(r.stale);
  assert.match(r.stale ?? "", /最後に数えたのは 9月1日/);
});

test("1回も数えていなければ、差を作らない（0円で合っていることにしない）", () => {
  const r = reconcileCash({ events: [], computedAtCount: 180000, today: "2026-10-05" });
  assert.equal(r.neverCounted, true);
  assert.equal(r.diff, null);
  assert.equal(r.counted, null);
  assert.deepEqual(reconcileLines(r), []);
  assert.match(r.verdict, /金庫を1回数えて/);
});

test("いちばん新しい「数えた」記録を選ぶ（預け入れは混ぜない）", () => {
  const events: CashEvent[] = [
    { kind: "count", happened_on: "2026-09-01", amount: 100000 },
    { kind: "deposit", happened_on: "2026-09-30", amount: 500000 },
    { kind: "count", happened_on: "2026-09-28", amount: 90000 },
  ];
  assert.equal(latestCount(events)?.happened_on, "2026-09-28");
  assert.deepEqual(depositsOf(events), [{ date: "2026-09-30", amount: 500000 }]);
});

test("倉庫から来たおかしな行は捨てる（推測で埋めない）", () => {
  const rows = [
    { kind: "count", happened_on: "2026-09-10", amount: "145000" },
    { kind: "いたずら", happened_on: "2026-09-10", amount: 1 },
    { kind: "count", happened_on: "9/10", amount: 1 },
    { kind: "deposit", happened_on: "2026-09-11", amount: -5 },
    { kind: "deposit", happened_on: "2026-09-12T00:00:00+09:00", amount: 1000 },
  ];
  const out = normalizeCashEvents(rows);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    kind: "count",
    happened_on: "2026-09-10",
    amount: 145000,
    actor: null,
    note: null,
  });
  assert.equal(out[1].happened_on, "2026-09-12");
});

test("日数の数え方（月をまたいでも合う）", () => {
  assert.equal(daysBetween("2026-09-28", "2026-10-05"), 7);
  assert.equal(daysBetween("2026-10-05", "2026-10-05"), 0);
  assert.equal(daysBetween("だめな日付", "2026-10-05"), null);
});

// ------------------------------------------------------------------
// 1枚の要約（お店にお渡しする紙）も、同じ数字で動くこと（kp233 ④）
// ------------------------------------------------------------------

test("1枚の要約の『今の現金』は、預け入れを引いた額になり、最後に数えた日も出る", async () => {
  const { buildOneSheet } = await import("../lib/keiri/oneSheet");
  const { templateFor } = await import("../lib/keiri");

  const base = {
    ym: "2026-09",
    monthLabel: "2026年9月",
    shopName: "手羽屋",
    reports,
    payments,
    advances: [],
    settings,
    template: templateFor("tebaya"),
    currentYm: "2026-09",
    madeOn: "2026-10-01",
  };

  const events: CashEvent[] = [
    { kind: "deposit", happened_on: "2026-09-15", amount: 40000 },
    { kind: "count", happened_on: "2026-09-25", amount: 139000 },
  ];

  const withoutEvents = buildOneSheet(base);
  const withEvents = buildOneSheet({ ...base, cashEvents: events });

  // 画面と同じ関数の答えと1円も違わない
  const screen = calcCashPosition({
    reports,
    payments,
    settings,
    deposits: depositsOf(events),
  });
  assert.equal(withEvents.cash.balance, screen.balance);
  assert.equal(withEvents.cash.balance, withoutEvents.cash.balance - 40000);

  // 「最後に実際に数えた日」は、数えた記録があればそちらが正
  assert.equal(withEvents.cash.countedOn, "2026-09-25");
  assert.equal(withEvents.cash.countedYen, 139000);
  // 記録が無ければ今までどおり（期首の日と金額）
  assert.equal(withoutEvents.cash.countedOn, settings.opening_date);
  assert.equal(withoutEvents.cash.countedYen, settings.opening_balance);
});


/* ------------------------------------------------------------------ *
 *  記録に残す前に「その場で比べる」（2026-10-09・kp233・f1-4）
 *
 *  ■ ここで守りたいこと
 *    ⑤ 比べるのに倉庫の置き場は要らない（記録が0件でも答えが出る）
 *    ⑥ 記録から出した答えと、その場で比べた答えが **同じ** になる
 *       （記録する前と後で画面の文が変わらないため）
 *    ⑦ 差は「いくら」だけでなく「どちらが多いか」を言葉で言う
 * ------------------------------------------------------------------ */

test("その場で比べる：記録が1件も無くても、計算上・実際・差の3つが出る", () => {
  const computed = calcCashPosition({ reports, payments, settings, asOf: "2026-09-10" }).balance;
  const r = previewCashCount({
    computedAtCount: computed,
    countedOn: "2026-09-10",
    counted: 146424,
    today: "2026-09-10",
  });
  assert.equal(r.neverCounted, false);
  assert.equal(r.computed, computed);
  assert.equal(r.counted, 146424);
  assert.equal(r.diff, computed - 146424);
  assert.equal(reconcileLines(r).length, 3);
});

test("その場で比べた答えは、記録から出した答えと1円まで同じ", () => {
  const computed = calcCashPosition({ reports, payments, settings, asOf: "2026-09-10" }).balance;
  const saved = reconcileCash({
    events: [{ kind: "count", happened_on: "2026-09-10", amount: 149000 }],
    computedAtCount: computed,
    today: "2026-09-12",
  });
  const preview = previewCashCount({
    computedAtCount: computed,
    countedOn: "2026-09-10",
    counted: 149000,
    today: "2026-09-12",
  });
  assert.equal(preview.computed, saved.computed);
  assert.equal(preview.counted, saved.counted);
  assert.equal(preview.diff, saved.diff);
  assert.equal(preview.verdict, saved.verdict);
  assert.deepEqual(reconcileLines(preview), reconcileLines(saved));
});

test("差の向きは記号ではなく言葉で言う", () => {
  assert.equal(diffDirection(0), "ぴったり");
  assert.equal(diffDirection(3576), "金庫のほうが少ない");
  assert.equal(diffDirection(-3576), "金庫のほうが多い");
  const r = previewCashCount({
    computedAtCount: 150000,
    countedOn: "2026-09-10",
    counted: 146424,
    today: "2026-09-10",
  });
  // 差の行には、金額と「どちらが多いか」の両方が入る
  const line = reconcileLines(r)[2];
  assert.ok(line.includes("3,576円"));
  assert.ok(line.includes("金庫のほうが少ない"));
  // マイナス記号だけで向きを表さない
  assert.ok(!line.includes("-3,576"));
});

test("よくある原因は、差が1,000円以上のときだけ出す", () => {
  const big = previewCashCount({
    computedAtCount: 150000,
    countedOn: "2026-09-10",
    counted: 146424,
    today: "2026-09-10",
  });
  assert.equal(cashDiffCauses(big).length, 3);
  const small = previewCashCount({
    computedAtCount: 150000,
    countedOn: "2026-09-10",
    counted: 149500,
    today: "2026-09-10",
  });
  assert.deepEqual(cashDiffCauses(small), []);
  const none = reconcileCash({ events: [], computedAtCount: 150000, today: "2026-09-10" });
  assert.deepEqual(cashDiffCauses(none), []);
});
