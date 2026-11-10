/**
 * 原価率の見張り（lib/costWatch.ts）のテスト。
 * 実際のレシートの書き方（2026-08〜11 の日報の経費の行）で固定する。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseQuantity,
  matchMaterial,
  quantityInUnit,
  observePrices,
  newUnitPrices,
  productCosts,
  priceForTarget,
  costAlerts,
  costAlertText,
  priceChanges,
  type CostMaterial,
  type CostRecipeLine,
} from "../lib/costWatch";

const WING: CostMaterial = { id: "w", name: "鶏手羽先", unit: "kg", unit_price: 1080, keywords: ["手羽先", "手羽代"] };
const OIL: CostMaterial = { id: "o", name: "揚げ油", unit: "kg", unit_price: 353.3, keywords: ["キャノーラ", "サラダ油"] };
const POTATO: CostMaterial = { id: "p", name: "冷凍ポテト", unit: "袋", unit_price: 395, keywords: ["ポテト"] };
const MATS = [WING, OIL, POTATO];

test("品物名から量を読む", () => {
  assert.deepEqual(parseQuantity("手羽先 仕入 12kg（恵比寿商事）"), { measure: { amount: 12, base: "kg" }, count: 1 });
  const oil = parseQuantity("一番搾りキャノーラ油 1500g (3コ×単530)");
  assert.equal(oil.count, 3);
  assert.ok(Math.abs(oil.measure!.amount - 1.5) < 1e-9);
  assert.deepEqual(parseQuantity("ポテト×2"), { measure: null, count: 2 });
  assert.deepEqual(parseQuantity("カナダ産シューストリングポテト"), { measure: null, count: 1 });
  assert.deepEqual(parseQuantity("手羽先 ２ｋｇ"), { measure: { amount: 2, base: "kg" }, count: 1 });
});

test("材料を見分ける（長いキーワードが勝つ・当たらなければ null）", () => {
  assert.equal(matchMaterial("手羽先 仕入 12kg", MATS)?.id, "w");
  assert.equal(matchMaterial("一番搾りキャノーラ油 1500g", MATS)?.id, "o");
  assert.equal(matchMaterial("キッチンペーパー", MATS), null);
  assert.equal(matchMaterial("場代", MATS), null);
});

test("材料の単位でいくつ買ったか（重さが無ければ読まない）", () => {
  assert.equal(quantityInUnit(WING, parseQuantity("手羽代")), null);
  assert.equal(quantityInUnit({ unit: "g" }, parseQuantity("片栗粉 1kg")), 1000);
  assert.equal(quantityInUnit(POTATO, parseQuantity("ポテト×2")), 2);
});

test("レシートの行から単価を拾う", () => {
  const obs = observePrices(
    [
      { description: "場代", amount: 5000, booth_fee: true },
      { description: "手羽先 仕入 12kg（恵比寿商事）", amount: 14160 },
      { description: "手羽代", amount: 8424 },
      { description: "キッチンペーパー", amount: 375 },
      { description: "ポテト×2", amount: 790 },
    ],
    MATS,
  );
  assert.equal(obs.length, 3);
  assert.deepEqual(
    obs.map((o) => [o.material_id, o.unit_price, o.applied]),
    [["w", 1180, true], ["w", null, false], ["p", 395, true]],
  );
  assert.equal(obs[1].reason, "量が読めない");
});

test("単価が2倍超・半分未満に跳んだら書き換えない", () => {
  const obs = observePrices([{ description: "手羽先 1kg", amount: 3000 }], MATS);
  assert.equal(obs[0].applied, false);
  assert.match(obs[0].reason!, /読み違い/);
});

test("同じ日に2回買ったら量で重みをつけて平均", () => {
  const obs = observePrices(
    [
      { description: "手羽先 10kg", amount: 11000 },
      { description: "手羽先 2kg", amount: 2600 },
    ],
    MATS,
  );
  assert.equal(newUnitPrices(obs).get("w"), 1133.3);
});

const PRODUCTS = [
  { id: 1, name: "手羽先", price: 200 },
  { id: 3, name: "ポテト", price: 350 },
  { id: 2, name: "手羽餃子", price: 300 },
];
const RECIPE: CostRecipeLine[] = [
  { product_id: 1, material_id: "w", yield_per_unit: 18 },
  { product_id: 1, material_id: "o", yield_per_unit: 200 },
  { product_id: 3, material_id: "p", yield_per_unit: 4 },
  { product_id: 3, material_id: "o", yield_per_unit: 100 },
];
const NAMES = new Map(MATS.map((m) => [m.id, m.name]));

test("商品の原価と原価率", () => {
  const prices = new Map<string, number | null>([["w", 1080], ["o", 353.3], ["p", 395]]);
  const pc = productCosts(PRODUCTS, RECIPE, prices, NAMES);
  // 手羽先：1080/18 + 353.3/200 = 60 + 1.77 = 61.8円 → 30.9%
  assert.equal(pc[0].cost, 61.8);
  assert.equal(pc[0].ratio, 30.9);
  assert.equal(pc[0].top_material, "鶏手羽先");
  // 材料が無い商品は出さない
  assert.equal(pc[2].no_recipe, true);
  assert.equal(pc[2].ratio, null);
  // 単価が分からない材料があれば出さない（数字を作らない）
  const pc2 = productCosts(PRODUCTS, RECIPE, new Map([["w", 1080], ["o", null]]), NAMES);
  assert.equal(pc2[0].ratio, null);
  assert.deepEqual(pc2[0].missing, ["揚げ油"]);
});

test("目安に戻す売値は10円単位で切り上げ", () => {
  assert.equal(priceForTarget(61.8, 30), 210);
  assert.equal(priceForTarget(279, 30), 930);
});

test("値上がりで目安を超えたら知らせる", () => {
  const before = productCosts(PRODUCTS, RECIPE, new Map<string, number | null>([["w", 1000], ["o", 353.3], ["p", 395]]), NAMES, new Map([[1, 32]]));
  const next = new Map([["w", 1180]]);
  const mats = MATS.map((m) => (m.id === "w" ? { ...m, unit_price: 1000 } : m));
  const after = productCosts(PRODUCTS, RECIPE, new Map<string, number | null>([["w", 1180], ["o", 353.3], ["p", 395]]), NAMES, new Map([[1, 32]]));
  const alerts = costAlerts(before, after, priceChanges(mats, next), RECIPE);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].name, "手羽先");
  assert.equal(alerts[0].cause, "鶏手羽先 +18%");
  const text = costAlertText(alerts);
  assert.match(text, /原価率のお知らせ/);
  assert.match(text, /目安32%/);
  // ポテトは材料が変わっていないので知らせない
  assert.ok(!text.includes("ポテト"));
});

test("小さな上がり（目安以下・3ポイント未満）は知らせない", () => {
  const before = productCosts(PRODUCTS, RECIPE, new Map<string, number | null>([["w", 900], ["o", 353.3], ["p", 395]]), NAMES, new Map([[1, 40]]));
  const after = productCosts(PRODUCTS, RECIPE, new Map<string, number | null>([["w", 950], ["o", 353.3], ["p", 395]]), NAMES, new Map([[1, 40]]));
  assert.equal(costAlerts(before, after, new Map(), RECIPE).length, 0);
  assert.equal(costAlertText([]), "");
});
