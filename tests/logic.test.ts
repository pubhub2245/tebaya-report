/**
 * 純粋ロジックのユニットテスト（お金の計算まわり）。
 * 追加ライブラリ不要。Node標準の node:test を tsx で実行する。
 *   実行: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeMomoPrimary, type SaleProduct } from "../lib/momoCalc";
import { calculateTebasakiCount } from "../lib/calculateTebasakiCount";
import { yen } from "../lib/format";

// ---------- テスト用の商品マスタ ----------
const products: SaleProduct[] = [
  { id: 1, shop: "もも屋", name: "もも焼き", price: 800, kind: "primary", is_active: true, sort_order: 1 },
  { id: 2, shop: "もも屋", name: "ポテト", price: 300, kind: "normal", is_active: true, sort_order: 2 },
  { id: 3, shop: "もも屋", name: "生ビール", price: 500, kind: "count_only", is_active: true, sort_order: 3 },
];

test("computeMomoPrimary: 主力本数を売上から正しく逆算する", () => {
  // 売上10000, ポテト2本(600円) → 主力売上9400 ÷ 800 = 11本
  const r = computeMomoPrimary(10000, products, { ポテト: 2 });
  assert.equal(r.otherSales, 600);
  assert.equal(r.primarySales, 9400);
  assert.equal(r.count, 11);
  assert.equal(r.warning, null);
  assert.equal(r.primaryName, "もも焼き");
});

test("computeMomoPrimary: お酒(count_only)は他商品売上に含めない", () => {
  // 生ビールの本数を入れても otherSales は変わらない
  const r = computeMomoPrimary(10000, products, { ポテト: 2, 生ビール: 5 });
  assert.equal(r.otherSales, 600);
  assert.equal(r.count, 11);
});

test("computeMomoPrimary: 他商品売上が売上を超えたら警告", () => {
  const r = computeMomoPrimary(500, products, { ポテト: 2 }); // 600 > 500
  assert.ok(r.warning);
  assert.equal(r.count, 0);
});

test("computeMomoPrimary: 主力商品が無ければ警告し本数0", () => {
  const noPrimary = products.filter((p) => p.kind !== "primary");
  const r = computeMomoPrimary(10000, noPrimary, {});
  assert.equal(r.count, 0);
  assert.ok(r.warning);
});

test("computeMomoPrimary: extraOtherSales(限定商品売上)を差し引く", () => {
  // 売上10000 − ポテト600 − 限定1000 = 8400 ÷ 800 = 10本
  const r = computeMomoPrimary(10000, products, { ポテト: 2 }, 1000);
  assert.equal(r.otherSales, 1600);
  assert.equal(r.count, 10);
});

// ---------- 手羽先の本数逆算 ----------
const tebasakiPrices = {
  TEBASAKI: 200,
  GYOZA: 250,
  POTATO: 300,
  TORNADO: 400,
  LIMITED: 500,
  ALLSTAR: 1300,
};

test("calculateTebasakiCount: 手羽先本数を正しく計算する", () => {
  // 売上10000 − 餃子2(500) − ポテト1(300) = 9200 ÷ 200 = 46本
  const r = calculateTebasakiCount(
    {
      sales_amount: 10000,
      gyoza_count: 2,
      potato_count: 1,
      tornado_count: 0,
      limited_count: 0,
      allstar_count: 0,
    },
    tebasakiPrices,
  );
  assert.equal(r.other_sales, 800);
  assert.equal(r.tebasaki_sales, 9200);
  assert.equal(r.count, 46);
  assert.equal(r.warning, null);
});

test("calculateTebasakiCount: 他商品売上が上回ったら警告し0本", () => {
  const r = calculateTebasakiCount(
    {
      sales_amount: 100,
      gyoza_count: 2,
      potato_count: 0,
      tornado_count: 0,
      limited_count: 0,
      allstar_count: 0,
    },
    tebasakiPrices,
  );
  assert.equal(r.count, 0);
  assert.ok(r.warning);
});

// ---------- 表示フォーマット ----------
test("yen: 3桁区切りの円表示", () => {
  assert.equal(yen(1000), "¥1,000");
  assert.equal(yen(0), "¥0");
  assert.equal(yen(197333), "¥197,333");
});
