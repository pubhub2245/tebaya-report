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
  summarizeCaseMonth,
  shiftDate,
  toMan,
  fallbackStats,
  isCaseShopRow,
  CASE_BUSINESS_CODE,
} from "../lib/keiri/caseStats";
import { CASE_TEBAYA } from "../lib/keiri/caseNumbers";
import { templateFor } from "../lib/keiri/index";
import type { KeiriAdvance, KeiriSettings } from "../lib/keiri/types";

/** 試験用の設定。家賃・外注費を0にして、日報と立替だけを見る */
const SETTINGS: KeiriSettings = {
  opening_date: "2026-08-01",
  opening_balance: 0,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};
const TEMPLATE = templateFor(CASE_BUSINESS_CODE);

/** 事例ページと同じ数え方で、その月の数字を出す（試験用の短い書き方） */
function figures(
  rows: any[],
  advances: KeiriAdvance[] = [],
  settings: KeiriSettings = SETTINGS,
  settingsMissing = false,
) {
  return summarizeCaseMonth({
    ym: "2026-08",
    rows,
    advances,
    settings,
    template: TEMPLATE,
    settingsMissing,
  });
}

/** 旧テストの書き方（出店回数・売上・利益だけ）をそのまま比べるための取り出し */
function dsp(rows: any[], advances: KeiriAdvance[] = []) {
  const f = figures(rows, advances);
  return { days: f.days, salesYen: f.salesYen, profitYen: f.profitYen };
}

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

test("利益は売上 − 日当 − レジから払った経費（経理画面と同じ数え方）", () => {
  const rows = [
    {
      date: "2026-08-01",
      sales_amount: 50000,
      labor: 10000,
      expenses: [{ description: "氷", amount: 5000 }],
    },
    {
      date: "2026-08-02",
      sales_amount: 30000,
      labor: 10000,
      expenses: [{ description: "氷", amount: 2000 }],
    },
  ];
  assert.deepEqual(dsp(rows), { days: 2, salesYen: 80000, profitYen: 53000 });
});

test("経費は明細から足す", () => {
  const rows = [
    {
      date: "2026-08-01",
      sales_amount: 10000,
      labor: 0,
      expenses: [{ description: "氷", amount: 300 }, { description: "油", amount: 700 }],
    },
  ];
  assert.equal(dsp(rows).profitYen, 9000);
});

test("空欄（null）は0として扱い、計算を落とさない", () => {
  const rows = [{ date: "2026-08-01", sales_amount: null, labor: null }];
  assert.deepEqual(dsp(rows), { days: 1, salesYen: 0, profitYen: 0 });
});

/* ------------------------------------------------------------------
 * 2026-10-05 追加（f1-5・f1-2）
 *
 * ここが抜けていたせいで、店主に見せる事例ページの「月の利益」が
 * 経理画面・会計ソフト向けCSV・毎月お渡しする1枚と **51万円** 違っていた。
 * 立て替えて払った経費・外注費・家賃を引いていなかったのが原因。
 * ------------------------------------------------------------------ */

test("立て替えて払った経費も、月の経費に入れて利益から引く", () => {
  const rows = [
    { date: "2026-08-01", sales_amount: 100000, labor: 0, expenses: [] },
  ];
  const advances: KeiriAdvance[] = [
    { date: "2026-08-03", amount: 30000, description: "鶏肉の仕入れ" },
  ];
  const f = figures(rows, advances);
  assert.equal(f.salesYen, 100000);
  assert.equal(f.expenseYen, 30000);
  assert.equal(f.profitYen, 70000);
  assert.equal(f.profitTrusted, true);
});

test("家賃と外注費も引く（日報に出てこないお金を落とさない）", () => {
  const rows = [
    { date: "2026-08-01", sales_amount: 100000, labor: 0, expenses: [] },
  ];
  const f = figures(rows, [], {
    ...SETTINGS,
    outsourcing_rate: 0.1,
    monthly_rent: 35000,
    rent_start_month: "2026-01",
  });
  // 100,000 − 外注費 10,000 − 家賃 35,000
  assert.equal(f.expenseYen, 45000);
  assert.equal(f.profitYen, 55000);
});

test("同じ支払いが2か所にある疑いがある月は、利益を出さない", () => {
  const rows = [
    {
      date: "2026-08-12",
      sales_amount: 100000,
      labor: 0,
      expenses: [{ description: "ニクルの朝市 出店料", amount: 38500 }],
    },
  ];
  const advances: KeiriAdvance[] = [
    { date: "2026-08-12", amount: 38500, description: "ニクルの朝市 出店料" },
  ];
  const f = figures(rows, advances);
  assert.equal(f.profitTrusted, false);
  assert.ok(f.untrustedReason && f.untrustedReason.includes("2か所"));
});

test("経理の設定が読めなかった月も、利益を出さない（家賃と外注費が当てずっぽうになるため）", () => {
  const rows = [
    { date: "2026-08-01", sales_amount: 100000, labor: 0, expenses: [] },
  ];
  const f = figures(rows, [], SETTINGS, true);
  assert.equal(f.profitTrusted, false);
  assert.ok(f.untrustedReason && f.untrustedReason.includes("設定"));
});

test("立替の棚が読めなかった月も、利益を出さない（経費がまるごと落ちるため）", () => {
  const rows = [
    { date: "2026-08-01", sales_amount: 100000, labor: 0, expenses: [] },
  ];
  const f = summarizeCaseMonth({
    ym: "2026-08",
    rows,
    advances: [],
    settings: SETTINGS,
    template: TEMPLATE,
    advancesUnreadable: true,
  });
  assert.equal(f.profitTrusted, false);
  assert.ok(f.untrustedReason && f.untrustedReason.includes("立て替え"));
});

test("立替を前後に広く取るための日付ずらしが正しい（月またぎ・うるう年）", () => {
  assert.equal(shiftDate("2026-09-01", -40), "2026-07-23");
  assert.equal(shiftDate("2026-09-30", 40), "2026-11-09");
  assert.equal(shiftDate("2028-03-01", -1), "2028-02-29");
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
    { date: "2026-08-01", shop: "手羽屋", sales_amount: 50000, labor: 10000, expenses: [{ description: "氷", amount: 5000 }] },
    { date: "2026-08-01", shop: "もも屋", sales_amount: 40000, labor: 10000, expenses: [{ description: "氷", amount: 4000 }] },
    { date: "2026-08-02", shop: "手羽屋", sales_amount: 30000, labor: 10000, expenses: [{ description: "氷", amount: 2000 }] },
  ];
  // 手羽屋の2件だけ：売上 80,000／利益 80,000−20,000−7,000＝53,000
  assert.deepEqual(dsp(rows), { days: 2, salesYen: 80000, profitYen: 53000 });
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
    { date: "2026-08-01", shop: "もも屋", sales_amount: 471500, labor: 10000, expenses: [] },
  ];
  assert.deepEqual(dsp(rows), { days: 0, salesYen: 0, profitYen: 0 });
});

test("控えの数字は手羽屋だけの値。確かめていない利益は null にする（推測で書かない）", () => {
  const f = fallbackStats();
  assert.equal(f.days, 26);
  assert.equal(f.salesMan, 73.0);
  // ★ここが 0 や適当な数になっていたら、紹介ページに根拠の無い利益が出てしまう
  assert.equal(f.profitMan, null);
});
