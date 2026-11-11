import { test } from "node:test";
import assert from "node:assert/strict";
import { MUTA_SHOP, calcShopMonth, photoShopFor } from "../lib/photoShop";

test("手羽屋（印が空）と、載っていないお店は「写真だけの日報のお店」ではない", () => {
  assert.equal(photoShopFor(null), null);
  assert.equal(photoShopFor(""), null);
  assert.equal(photoShopFor("11111111-2222-3333-4444-555555555555"), null);
  assert.equal(photoShopFor("変な値"), null);
});

test("牟田町店の番号なら、牟田町店の決まりが返る（大文字でも同じ）", () => {
  assert.equal(photoShopFor(MUTA_SHOP.tenantId)?.shopName, "牟田町店");
  assert.equal(photoShopFor(MUTA_SHOP.tenantId.toUpperCase())?.shopName, "牟田町店");
});

test("日報が1枚も無い月は、数字を作らない（固定費だけ引かれる）", () => {
  const m = calcShopMonth([], MUTA_SHOP);
  assert.equal(m.days, 0);
  assert.equal(m.sales, 0);
  assert.equal(m.fixed, 41500);
  assert.equal(m.remaining, -41500);
  assert.equal(m.expenseRate, null);
  assert.equal(m.avgPrimaryPerDay, null);
  assert.equal(m.forecast, null);
});

test("収支計画の資料と同じ形：1日60本・12日営業（売上214,560円）で 30,056円 残る", () => {
  // 1日：売上 17,880円、仕入れ 4,917円、ガス 400円、人件費 6,600円
  const rows = Array.from({ length: 12 }, () => ({
    sales_amount: 17880,
    expenses_total: 4917 + 400,
    labor: 6600,
    product_counts: { 手羽先: 60, 手羽餃子: 17, ポテト: 2 },
  }));
  const m = calcShopMonth(rows, MUTA_SHOP);
  assert.equal(m.days, 12);
  assert.equal(m.sales, 214560);
  assert.equal(m.expenses, 63804);
  assert.equal(m.labor, 79200);
  assert.equal(m.remaining, 214560 - 63804 - 79200 - 41500);
  assert.equal(m.avgPrimaryPerDay, 60);
  // 月20日の見込み：1日の残り（17,880−5,317−6,600＝5,963）×20 − 41,500
  assert.equal(m.forecast, 5963 * 20 - 41500);
  assert.ok(Math.abs((m.expenseRate ?? 0) - 63804 / 214560) < 1e-9);
});

test("予定の日数より多く営業した月は、実際の日数で見込みを出す（見込み＝いまの残り）", () => {
  const rows = Array.from({ length: 22 }, () => ({ sales_amount: 10000, expenses_total: 3000, labor: 6600 }));
  const m = calcShopMonth(rows, MUTA_SHOP);
  assert.equal(m.forecast, m.remaining);
});

test("空や変な値が混ざっても落ちない", () => {
  const m = calcShopMonth(
    [{ sales_amount: null, expenses_total: undefined, labor: null, product_counts: null }, { sales_amount: 5000 }],
    MUTA_SHOP,
  );
  assert.equal(m.days, 2);
  assert.equal(m.sales, 5000);
  assert.equal(m.avgPrimaryPerDay, 0);
});
