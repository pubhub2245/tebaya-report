import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCashShopScopeWindow,
  cashShopScopeLine,
  EMPTY_CASH_SHOP_SCOPE,
  measureCashShopScope,
} from "../lib/keiri/cashShopScope";
import type { KeiriReport } from "../lib/keiri/types";

/**
 * 「金庫の計算は、どの屋号の日報から数えているのか」の決まりを固定する
 * （2026-11-04・f1-4）。
 *
 * ■ ここで守りたいこと
 *   ① 読めなかったのを「屋号は1つ」と取り違えない
 *   ② 数える範囲は金庫の計算と同じ（数え始めの日から、数えた日まで）
 *   ③ 屋号が1つだけ・区分が1つも入っていないときは、行を出さない
 *   ④ 2つ以上混ざっているときは、「足して数えている」と「立替は分けられない」を必ず言う
 *   ⑤ 外から確かめる窓口には、金額も屋号の名前も返さない
 */

function report(date: string, shop: string | null, sales = 10000): KeiriReport {
  return {
    date,
    location: "ながやま鷹尾",
    staff_name: "イデ",
    shop,
    sales_amount: sales,
    labor: 0,
    expenses: [],
  } as unknown as KeiriReport;
}

const WINDOW = { openingDate: "2026-09-10", asOf: "2026-10-31" };

test("日報が読めなかったら、屋号は1つだと言わない", () => {
  const unreadable = measureCashShopScope({ reports: null, ...WINDOW });
  assert.deepEqual(unreadable, EMPTY_CASH_SHOP_SCOPE);
  assert.equal(cashShopScopeLine(unreadable), "");
  const win = buildCashShopScopeWindow(unreadable);
  assert.equal(win.readable, false);
  assert.equal(win.shown, false);
  assert.match(win.note, /屋号が1つという意味ではありません/);

  const skipped = measureCashShopScope({
    reports: [report("2026-10-01", "手羽屋")],
    unreadable: true,
    ...WINDOW,
  });
  assert.equal(skipped.readable, false);
  assert.equal(cashShopScopeLine(skipped), "");
});

test("数える範囲は金庫の計算と同じ（数え始めの日より前・数えた日より後は数えない）", () => {
  const scope = measureCashShopScope({
    reports: [
      report("2026-09-09", "手羽屋"), // 数え始めの日より前
      report("2026-09-10", "手羽屋"), // 数え始めの日ちょうど＝数える
      report("2026-10-31", "もも屋"), // 数えた日ちょうど＝数える
      report("2026-11-01", "もも屋"), // 数えた日より後
      report("", "手羽屋"), // 日付が無い行
    ],
    ...WINDOW,
  });
  assert.equal(scope.reports, 2);
  assert.equal(scope.multi, true);
  assert.deepEqual(
    scope.shops.map((s) => [s.shop, s.reportCount]),
    // 件数が同じときは名前の順（文字の並び順で もも屋 が先に来る）
    [
      ["もも屋", 1],
      ["手羽屋", 1],
    ],
  );
});

test("屋号が1つだけなら行を出さない", () => {
  const scope = measureCashShopScope({
    reports: [report("2026-10-01", "手羽屋"), report("2026-10-02", "手羽屋")],
    ...WINDOW,
  });
  assert.equal(scope.multi, false);
  assert.equal(cashShopScopeLine(scope), "");
  const win = buildCashShopScopeWindow(scope);
  assert.equal(win.shops, 1);
  assert.equal(win.shown, false);
  assert.match(win.note, /取り違えようがない/);
});

test("お店の区分が1つも入っていない日報だけなら、行を出さない", () => {
  const scope = measureCashShopScope({
    reports: [report("2026-10-01", null), report("2026-10-02", "")],
    ...WINDOW,
  });
  assert.equal(scope.reports, 2);
  assert.equal(scope.shops.length, 1);
  assert.equal(cashShopScopeLine(scope), "");
});

test("日報が1件も無ければ行を出さない", () => {
  const scope = measureCashShopScope({ reports: [], ...WINDOW });
  assert.equal(scope.readable, true);
  assert.equal(scope.reports, 0);
  assert.equal(cashShopScopeLine(scope), "");
  assert.match(buildCashShopScopeWindow(scope).note, /日報が1件も入っていません/);
});

test("2つの屋号が混ざっているときは、足して数えていることと立替のことを言う", () => {
  const scope = measureCashShopScope({
    reports: [
      report("2026-10-01", "手羽屋"),
      report("2026-10-02", "手羽屋"),
      report("2026-10-03", "もも屋"),
    ],
    ...WINDOW,
  });
  const line = cashShopScopeLine(scope);
  assert.match(line, /手羽屋 2件・もも屋 1件/);
  assert.match(line, /日報 3件を足して数えています/);
  assert.match(line, /金庫は1つとして数える/);
  assert.match(line, /立替には、どの屋号のものかの印がまだ無い/);
  // 件数の多い順に並ぶ
  assert.equal(scope.shops[0].shop, "手羽屋");
});

test("「区分なし」は本物の屋号より後ろに並べる", () => {
  const scope = measureCashShopScope({
    reports: [
      report("2026-10-01", null),
      report("2026-10-02", null),
      report("2026-10-03", null),
      report("2026-10-04", "もも屋"),
    ],
    ...WINDOW,
  });
  assert.equal(scope.shops[0].shop, "もも屋");
  assert.equal(scope.shops[1].shop, "区分なし");
  assert.match(cashShopScopeLine(scope), /もも屋 1件・区分なし 3件/);
});

test("外から確かめる窓口は、金額も屋号の名前も返さない", () => {
  const scope = measureCashShopScope({
    reports: [report("2026-10-01", "手羽屋", 123456), report("2026-10-02", "もも屋", 7890)],
    ...WINDOW,
  });
  const win = buildCashShopScopeWindow(scope);
  assert.deepEqual(Object.keys(win).sort(), [
    "multi",
    "note",
    "readable",
    "reports",
    "shops",
    "shown",
  ]);
  const text = JSON.stringify(win);
  assert.equal(/手羽屋|もも屋/.test(text), false);
  assert.equal(/123456|123,456|7890/.test(text), false);
  assert.equal(win.shops, 2);
  assert.equal(win.reports, 2);
  assert.equal(win.shown, true);
  // ★ひとことには屋号の「数」を入れる（並びをそのまま入れると
  //   「[object Object]つの屋号」になる。2026-11-04 に本番で1回 出した）
  assert.match(win.note, /2つの屋号の日報 2件/);
  assert.equal(/object Object/.test(text), false);
});
