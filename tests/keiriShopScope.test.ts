/**
 * 「どのお店の日報を数えているか」のテスト（lib/keiri/shopScope.ts・kp234・f1-5/f3-4）。
 *
 * ★ここで守るのは5点。どれも「数字が黙って変わらない／範囲が黙って混ざらない」ための守りです。
 *   ① 既定は**今までどおり全部**（しぼらない）。合計が1円も変わらない
 *   ② お店の区分が空の日報を「手羽屋」と決めつけない
 *   ③ 2つのお店が混ざっていたら、必ず断り書きが出る
 *   ④ 1枚の見出しのお店と、数えている範囲がずれていたら、必ず断り書きが出る
 *   ⑤ 立替は分けられないことを、しぼったときに必ず書く
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  UNSET_SHOP,
  filterReportsByShop,
  sameShopName,
  shopCountsLabel,
  shopOf,
  shopScopeNotes,
  shopScopeSentence,
  summarizeShopScope,
} from "../lib/keiri/shopScope";
import { summarizeMonth } from "../lib/keiri/aggregate";
import { templateFor } from "../lib/keiri";
import type { KeiriReport, KeiriSettings } from "../lib/keiri/types";

const SETTINGS: KeiriSettings = {
  opening_date: "2026-09-01",
  opening_balance: 0,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

/** 手羽屋2件・もも屋1件・区分なし1件（9月）＋別の月1件 */
const REPORTS: KeiriReport[] = [
  { date: "2026-09-01", shop: "手羽屋", sales_amount: 10_000, labor: 0, expenses: [] },
  { date: "2026-09-02", shop: "手羽屋", sales_amount: 20_000, labor: 0, expenses: [] },
  { date: "2026-09-03", shop: "もも屋", sales_amount: 5_000, labor: 0, expenses: [] },
  { date: "2026-09-04", shop: "", sales_amount: 1_000, labor: 0, expenses: [] },
  { date: "2026-08-31", shop: "もも屋", sales_amount: 99_000, labor: 0, expenses: [] },
];

test("お店の区分が空の日報を「手羽屋」と決めつけない", () => {
  assert.equal(shopOf({ date: "2026-09-01", shop: "手羽屋" }), "手羽屋");
  assert.equal(shopOf({ date: "2026-09-01", shop: "" }), UNSET_SHOP);
  assert.equal(shopOf({ date: "2026-09-01" }), UNSET_SHOP);
  assert.equal(shopOf({ date: "2026-09-01", shop: null }), UNSET_SHOP);
  assert.notEqual(UNSET_SHOP, "手羽屋");
});

test("その月の日報だけを、お店ごとに数える（件数の多い順）", () => {
  const got = summarizeShopScope(REPORTS, "2026-09");
  assert.equal(got.reportCount, 4);
  assert.equal(got.sales, 36_000);
  assert.deepEqual(
    got.shops.map((s) => [s.shop, s.reportCount, s.sales]),
    [
      ["手羽屋", 2, 30_000],
      ["もも屋", 1, 5_000],
      // ★「区分なし」はお店の名前ではないので、必ずいちばん後ろ
      [UNSET_SHOP, 1, 1_000],
    ],
  );
  // 8月は別の月なので入らない
  assert.equal(summarizeShopScope(REPORTS, "2026-08").reportCount, 1);
});

test("既定（しぼらない）は今までどおり全部で、合計が1円も変わらない", () => {
  assert.equal(filterReportsByShop(REPORTS, "").length, REPORTS.length);
  assert.equal(filterReportsByShop(REPORTS, null).length, REPORTS.length);
  assert.equal(filterReportsByShop(REPORTS, undefined).length, REPORTS.length);

  const template = templateFor("tebaya");
  const all = summarizeMonth({
    ym: "2026-09",
    reports: filterReportsByShop(REPORTS, null),
    template,
    settings: SETTINGS,
  });
  const before = summarizeMonth({
    ym: "2026-09",
    reports: REPORTS,
    template,
    settings: SETTINGS,
  });
  assert.equal(all.sales, before.sales);
  assert.equal(all.expenseTotal, before.expenseTotal);
  assert.equal(all.reportCount, 4);
  // 内訳が付いても合計は変わらない（内訳の売上の合計＝売上）
  assert.equal(
    all.shops.reduce((s, x) => s + x.sales, 0),
    all.sales,
  );
  assert.equal(
    all.shops.reduce((s, x) => s + x.reportCount, 0),
    all.reportCount,
  );
});

test("お店でしぼると、その店の日報だけになる", () => {
  const only = filterReportsByShop(REPORTS, "手羽屋");
  assert.equal(only.length, 2);
  const summary = summarizeMonth({
    ym: "2026-09",
    reports: only,
    template: templateFor("tebaya"),
    settings: SETTINGS,
  });
  assert.equal(summary.sales, 30_000);
  assert.equal(summary.reportCount, 2);
  assert.deepEqual(
    summary.shops.map((s) => s.shop),
    ["手羽屋"],
  );
});

test("1行の言葉：1つのお店のときと、混ざっているときで書き分ける", () => {
  assert.equal(
    shopScopeSentence({ shops: [{ shop: "手羽屋", reportCount: 2, sales: 1 }], reportCount: 2 }),
    "この数字は 手羽屋 の日報 2件から数えています。",
  );
  const mixed = summarizeShopScope(REPORTS, "2026-09");
  const sentence = shopScopeSentence({ shops: mixed.shops, reportCount: mixed.reportCount });
  assert.ok(sentence.includes("手羽屋 2件"));
  assert.ok(sentence.includes("もも屋 1件"));
  assert.ok(sentence.includes("足して"));
  assert.equal(shopScopeSentence({ shops: [], reportCount: 0 }), "この月の日報はまだありません。");
  assert.equal(
    shopCountsLabel([
      { shop: "手羽屋", reportCount: 12, sales: 0 },
      { shop: "もも屋", reportCount: 3, sales: 0 },
    ]),
    "手羽屋 12件・もも屋 3件",
  );
});

test("2つのお店が混ざっていたら断り書きが出る／1つだけなら出ない", () => {
  const mixed = summarizeShopScope(REPORTS, "2026-09").shops;
  const notes = shopScopeNotes({ shopName: "手羽屋", shops: mixed });
  assert.ok(notes.length >= 2);
  assert.ok(notes.some((n) => n.includes("足して数えています")));
  assert.ok(notes.some((n) => n.includes("ほかのお店")));
  assert.ok(notes.some((n) => n.includes("立て替え")));

  const alone = shopScopeNotes({
    shopName: "手羽屋",
    shops: [{ shop: "手羽屋", reportCount: 12, sales: 0 }],
  });
  assert.deepEqual(alone, []);
});

test("見出しのお店と数えている範囲がずれていたら、必ず断る", () => {
  const notes = shopScopeNotes({
    shopName: "手羽屋",
    shops: [{ shop: "もも屋", reportCount: 3, sales: 0 }],
  });
  assert.ok(notes.some((n) => n.includes("そろっていません")));
  // 書き方のゆれ（「手羽屋」と「手羽屋（移動販売）」）はずれと見なさない
  assert.ok(sameShopName("手羽屋（移動販売）", "手羽屋"));
  assert.ok(sameShopName("手羽屋", "手羽屋"));
  assert.ok(!sameShopName("手羽屋", "もも屋"));
  assert.ok(!sameShopName("", "手羽屋"));
  assert.deepEqual(
    shopScopeNotes({ shopName: "手羽屋（移動販売）", shops: [{ shop: "手羽屋", reportCount: 1, sales: 0 }] }),
    [],
  );
});

test("お店でしぼったときは、立替が分けられないことを必ず書く", () => {
  const notes = shopScopeNotes({
    shopName: "もも屋",
    shops: [{ shop: "もも屋", reportCount: 1, sales: 0 }],
    filtered: true,
  });
  assert.equal(notes.length, 1);
  assert.ok(notes[0].includes("立て替え"));
  assert.ok(notes[0].includes("印がまだありません"));
});
