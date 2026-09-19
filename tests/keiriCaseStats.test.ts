/**
 * 事例ページの数字を、前の月の日報から自動で出すところのテスト。
 *
 * ここが狂うと、紹介ページに「実績」として事実でない数字が出る。
 * 月の区切り（年をまたぐ・うるう年）と、倉庫が読めないときの戻り先を固定しておく。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  previousMonthRange,
  summarize,
  toMan,
  fallbackStats,
  isCaseShopRow,
} from "../lib/keiri/caseStats";
import { CASE_TEBAYA } from "../lib/keiri/caseNumbers";

test("前の月の範囲を出す（月末の日数も正しく取る）", () => {
  assert.deepEqual(previousMonthRange(new Date(2026, 8, 18)), {
    start: "2026-08-01",
    end: "2026-08-31",
    label: "2026年8月",
  });
  // 3月の前の月は2月（うるう年でない年は28日まで）
  assert.deepEqual(previousMonthRange(new Date(2026, 2, 1)), {
    start: "2026-02-01",
    end: "2026-02-28",
    label: "2026年2月",
  });
  // 1月の前の月は、前の年の12月
  assert.deepEqual(previousMonthRange(new Date(2026, 0, 5)), {
    start: "2025-12-01",
    end: "2025-12-31",
    label: "2025年12月",
  });
});

test("うるう年の2月は29日まで", () => {
  assert.equal(previousMonthRange(new Date(2028, 2, 10)).end, "2028-02-29");
});

test("利益は実績ベース（売上 − 日当 − レジから払った経費）", () => {
  const rows = [
    { date: "2026-08-01", sales_amount: 50000, labor: 10000, expenses_total: 5000 },
    { date: "2026-08-02", sales_amount: 30000, labor: 10000, expenses_total: 2000 },
  ];
  assert.deepEqual(summarize(rows), { days: 2, salesYen: 80000, profitYen: 53000 });
});

test("経費の合計が列に無い日報は、明細から足す", () => {
  const rows = [
    {
      date: "2026-08-01",
      sales_amount: 10000,
      labor: 0,
      expenses: [{ amount: 300 }, { amount: 700 }],
    },
  ];
  assert.equal(summarize(rows).profitYen, 9000);
});

test("空欄（null）は0として扱い、計算を落とさない", () => {
  const rows = [{ date: "2026-08-01", sales_amount: null, labor: null }];
  assert.deepEqual(summarize(rows), { days: 1, salesYen: 0, profitYen: 0 });
});

test("万円は小数1桁に丸める", () => {
  assert.equal(toMan(759200), 75.9);
  assert.equal(toMan(64999), 6.5);
  assert.equal(toMan(0), 0);
  assert.equal(toMan(-12000), -1.2);
});

test("倉庫が読めないときは、手で確認した控えの数字に戻す", () => {
  const f = fallbackStats();
  assert.equal(f.auto, false);
  assert.equal(f.month, CASE_TEBAYA.month);
  assert.equal(f.salesMan, CASE_TEBAYA.salesMan);
  assert.equal(f.days, CASE_TEBAYA.days);
});

/* ------------------------------------------------------------------
 * 2026-09-19 追加（司令室 kp73）
 *
 * 同じアプリには「手羽屋」と「もも屋」の日報が同じ棚に入っている。
 * 紹介ページは「屋台『手羽屋』の実績」と名乗っているので、
 * もも屋の売上・出店回数を足してはいけない。
 * 送り先は同じ催事に出ている同業なので、出店回数の水増しはすぐ分かる。
 * ------------------------------------------------------------------ */

test("もも屋の日報は数えない（出店回数・売上・利益のどれにも入れない）", () => {
  const rows = [
    { date: "2026-08-01", shop: "手羽屋", sales_amount: 50000, labor: 10000, expenses_total: 5000 },
    { date: "2026-08-01", shop: "もも屋", sales_amount: 40000, labor: 10000, expenses_total: 4000 },
    { date: "2026-08-02", shop: "手羽屋", sales_amount: 30000, labor: 10000, expenses_total: 2000 },
  ];
  // 手羽屋の2件だけ：売上 80,000／利益 80,000−20,000−7,000＝53,000
  assert.deepEqual(summarize(rows), { days: 2, salesYen: 80000, profitYen: 53000 });
});

test("屋号が空の古い日報は、手羽屋として数える（既定が手羽屋のため）", () => {
  assert.equal(isCaseShopRow({ shop: null }), true);
  assert.equal(isCaseShopRow({ shop: "" }), true);
  assert.equal(isCaseShopRow({ shop: " 手羽屋 " }), true);
  assert.equal(isCaseShopRow({}), true);
  assert.equal(isCaseShopRow({ shop: "もも屋" }), false);
});

test("もも屋しか無い月は、出店0回・売上0円になる（控えの数字に戻る合図）", () => {
  const rows = [
    { date: "2026-08-01", shop: "もも屋", sales_amount: 471500, labor: 10000, expenses_total: 0 },
  ];
  assert.deepEqual(summarize(rows), { days: 0, salesYen: 0, profitYen: 0 });
});

test("控えの数字は手羽屋だけの値。確かめていない利益は null にする（推測で書かない）", () => {
  const f = fallbackStats();
  assert.equal(f.days, 26);
  assert.equal(f.salesMan, 73.0);
  // ★ここが 0 や適当な数になっていたら、紹介ページに根拠の無い利益が出てしまう
  assert.equal(f.profitMan, null);
});
