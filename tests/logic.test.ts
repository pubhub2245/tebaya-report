/**
 * 純粋ロジックのユニットテスト（お金の計算まわり）。
 * 追加ライブラリ不要。Node標準の node:test を tsx で実行する。
 *   実行: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeSalesBreakdown,
  isBreakdownResolved,
  priceSnapshot,
  diffMessage,
  type SaleProduct,
} from "../lib/salesBreakdown";
import { yen } from "../lib/format";

// ---------- テスト用の商品マスタ ----------
const tebaya: SaleProduct[] = [
  { id: 1, shop: "手羽屋", name: "手羽先", price: 200, kind: "primary", is_active: true, sort_order: 0 },
  { id: 2, shop: "手羽屋", name: "手羽餃子", price: 300, kind: "normal", is_active: true, sort_order: 1 },
  { id: 3, shop: "手羽屋", name: "ポテト", price: 350, kind: "normal", is_active: true, sort_order: 2 },
  { id: 5, shop: "手羽屋", name: "オールスター", price: 2000, kind: "normal", is_active: true, sort_order: 4 },
  { id: 6, shop: "手羽屋", name: "お酒", price: 0, kind: "count_only", is_active: true, sort_order: 90 },
];

// ---------- 売上の内訳 ----------

test("computeSalesBreakdown: 単価×本数の合計が売上と一致する", () => {
  // 手羽先56×200 + 手羽餃子19×300 + ポテト4×350 + オールスター2×2000 = 22,300
  const b = computeSalesBreakdown({
    sales: 22300,
    products: tebaya,
    counts: { 手羽先: 56, 手羽餃子: 19, ポテト: 4, オールスター: 2 },
  });
  assert.equal(b.total, 22300);
  assert.equal(b.diff, 0);
  assert.equal(b.matched, true);
});

test("computeSalesBreakdown: 数え漏れがあると売上のほうが多くなる", () => {
  // 手羽先を1本ぶん入れ忘れた状態
  const b = computeSalesBreakdown({
    sales: 22300,
    products: tebaya,
    counts: { 手羽先: 55, 手羽餃子: 19, ポテト: 4, オールスター: 2 },
  });
  assert.equal(b.diff, 200);
  assert.equal(b.matched, false);
  assert.match(diffMessage(b), /売上のほうが/);
});

test("computeSalesBreakdown: 本数を入れすぎると内訳のほうが多くなる", () => {
  const b = computeSalesBreakdown({
    sales: 22300,
    products: tebaya,
    counts: { 手羽先: 57, 手羽餃子: 19, ポテト: 4, オールスター: 2 },
  });
  assert.equal(b.diff, -200);
  assert.match(diffMessage(b), /内訳のほうが/);
});

test("computeSalesBreakdown: 記録のみ(count_only)は金額に入れない", () => {
  const b = computeSalesBreakdown({
    sales: 400,
    products: tebaya,
    counts: { 手羽先: 2, お酒: 5 },
  });
  assert.equal(b.total, 400);
  assert.equal(b.matched, true);
});

test("computeSalesBreakdown: 限定商品はその月の単価で1行足す", () => {
  // 手羽先111×200 + 手羽餃子32×300 + オールスター3×2000 + 限定2×250 = 38,300
  const b = computeSalesBreakdown({
    sales: 38300,
    products: tebaya,
    counts: { 手羽先: 111, 手羽餃子: 32, オールスター: 3 },
    limited: { name: "スイートチリ", count: 2, price: 250 },
  });
  assert.equal(b.total, 38300);
  assert.equal(b.matched, true);
  assert.ok(b.lines.some((l) => l.isLimited && l.name === "スイートチリ"));
});

test("computeSalesBreakdown: 限定商品名がマスタと同じなら二重計上しない", () => {
  const b = computeSalesBreakdown({
    sales: 600,
    products: tebaya,
    counts: { ポテト: 1 },
    limited: { name: "ポテト", count: 1, price: 350 },
  });
  assert.equal(b.total, 350);
  assert.equal(b.lines.filter((l) => l.name === "ポテト").length, 1);
});

test("computeSalesBreakdown: 本数があるのに単価0の商品を知らせる", () => {
  const b = computeSalesBreakdown({
    sales: 400,
    products: tebaya.map((p) =>
      p.name === "お酒" ? { ...p, kind: "normal" as const } : p,
    ),
    counts: { 手羽先: 2, お酒: 5 },
  });
  assert.deepEqual(b.unpricedNames, ["お酒"]);
});

test("computeSalesBreakdown: 使わなくなった商品(is_active=false)は出さない", () => {
  const b = computeSalesBreakdown({
    sales: 400,
    products: tebaya.map((p) =>
      p.name === "ポテト" ? { ...p, is_active: false } : p,
    ),
    counts: { 手羽先: 2, ポテト: 9 },
  });
  assert.equal(b.total, 400);
  assert.ok(!b.lines.some((l) => l.name === "ポテト"));
});

test("priceSnapshot: その日の単価を控えとして残す", () => {
  const b = computeSalesBreakdown({
    sales: 22300,
    products: tebaya,
    counts: { 手羽先: 56, 手羽餃子: 19, ポテト: 4, オールスター: 2 },
  });
  const snap = priceSnapshot(b);
  assert.equal(snap["手羽先"], 200);
  assert.equal(snap["手羽餃子"], 300);
  assert.equal(snap["お酒"], undefined); // 記録のみは金額に関係しないので残さない
});

// ---------- 先に進めるかどうか ----------

test("isBreakdownResolved: ぴったり合っていれば理由なしで進める", () => {
  const b = computeSalesBreakdown({
    sales: 400,
    products: tebaya,
    counts: { 手羽先: 2 },
  });
  assert.equal(isBreakdownResolved(b, "", ""), true);
});

test("isBreakdownResolved: 合っていないのに理由が無ければ進めない", () => {
  const b = computeSalesBreakdown({
    sales: 500,
    products: tebaya,
    counts: { 手羽先: 2 },
  });
  assert.equal(isBreakdownResolved(b, "", ""), false);
  assert.equal(isBreakdownResolved(b, "でたらめな理由", ""), false);
});

test("isBreakdownResolved: 理由を選べば進める", () => {
  const b = computeSalesBreakdown({
    sales: 500,
    products: tebaya,
    counts: { 手羽先: 2 },
  });
  assert.equal(isBreakdownResolved(b, "discount", ""), true);
});

test("isBreakdownResolved: その他を選んだときは内容の記入が要る", () => {
  const b = computeSalesBreakdown({
    sales: 500,
    products: tebaya,
    counts: { 手羽先: 2 },
  });
  assert.equal(isBreakdownResolved(b, "other", ""), false);
  assert.equal(isBreakdownResolved(b, "other", "   "), false);
  assert.equal(isBreakdownResolved(b, "other", "常連さんに1本サービス"), true);
});

test("computeSalesBreakdown: マイナスの本数や売上は0として扱う", () => {
  const b = computeSalesBreakdown({
    sales: -100,
    products: tebaya,
    counts: { 手羽先: -5 },
  });
  assert.equal(b.sales, 0);
  assert.equal(b.total, 0);
  assert.equal(b.matched, true);
});

// ---------- 表示フォーマット ----------
test("yen: 3桁区切りの円表示", () => {
  assert.equal(yen(1000), "¥1,000");
  assert.equal(yen(0), "¥0");
  assert.equal(yen(197333), "¥197,333");
});
