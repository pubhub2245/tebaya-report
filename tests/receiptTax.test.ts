/**
 * レシートの消費税の取りこぼしを直す計算のテスト。
 *
 * ★ここが壊れると、経費が毎回 8〜10% 少なく記録され、
 *   利益が実際より多く見え、「今の現金」も実際と合わなくなります。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  distributeToTotal,
  reconcileItemsToTotal,
  sumItems,
  MAX_TAX_RATIO,
} from "../lib/receiptTax";

/* ---------- 割り振り ---------- */

test("distributeToTotal: 割り振ったあとの合計は必ず狙った額ぴったり", () => {
  const items = [
    { name: "A", amount: 1592 },
    { name: "B", amount: 560 },
    { name: "C", amount: 1440 },
  ];
  for (const target of [3880, 3881, 3882, 4000, 3592]) {
    const out = distributeToTotal(items, target);
    assert.equal(sumItems(out), target, `target=${target}`);
  }
});

test("distributeToTotal: 金額の大きい行が多く受け取る", () => {
  const out = distributeToTotal(
    [
      { name: "大", amount: 1000 },
      { name: "小", amount: 100 },
    ],
    1210, // 10%
  );
  assert.equal(out[0].amount, 1100);
  assert.equal(out[1].amount, 110);
});

test("distributeToTotal: 0円の行には配らない", () => {
  const out = distributeToTotal(
    [
      { name: "品物", amount: 1000 },
      { name: "0円の行", amount: 0 },
    ],
    1080,
  );
  assert.equal(out[1].amount, 0);
  assert.equal(out[0].amount, 1080);
});

test("distributeToTotal: 全部0円なら何もしない（0で割らない）", () => {
  const items = [{ name: "A", amount: 0 }];
  assert.deepEqual(distributeToTotal(items, 100), items);
});

/* ---------- 実データで起きていたこと ---------- */

test("reconcileItemsToTotal: 税抜で読み取られた品物に消費税を足して税込にする", () => {
  // 実データの書き方（単価×個数ちょうど＝消費税が乗っていなかった）
  const items = [
    { name: "火乃国 片栗粉 北海 1kg 4コ×単398", amount: 1592 },
    { name: "マッケイン シューストリング 2コ×単280", amount: 560 },
    { name: "スターパック 中深 100枚 3コ×単480", amount: 1440 },
  ];
  const itemsSum = 1592 + 560 + 1440; // 3592
  const total = 3880; // レシートの支払合計（税込・8%相当）

  const r = reconcileItemsToTotal(items, total);
  assert.equal(r.reason, "adjusted");
  assert.equal(r.adjusted, true);
  assert.equal(r.matched, true);
  assert.equal(r.itemsSum, itemsSum);
  assert.equal(r.adjustedSum, total, "直したあとの合計はレシートの合計とぴったり同じ");
  // どの行も元より増えている（減っていない）
  for (let i = 0; i < items.length; i++) {
    assert.ok(r.items[i].amount >= items[i].amount);
  }
});

test("reconcileItemsToTotal: もともと税込で合っていれば何もしない", () => {
  const items = [
    { name: "A", amount: 300 },
    { name: "B", amount: 700 },
  ];
  const r = reconcileItemsToTotal(items, 1000);
  assert.equal(r.reason, "ok");
  assert.equal(r.adjusted, false);
  assert.equal(r.matched, true);
  assert.deepEqual(r.items, items);
});

test("reconcileItemsToTotal: 合計が読めなければ何もしない（勝手に金額を作らない）", () => {
  const items = [{ name: "A", amount: 500 }];
  for (const total of [0, null, undefined, "", "よめない"]) {
    const r = reconcileItemsToTotal(items, total);
    assert.equal(r.reason, "no_total");
    assert.equal(r.adjusted, false);
    assert.equal(r.matched, false);
    assert.deepEqual(r.items, items);
  }
});

test("reconcileItemsToTotal: 差が大きすぎるときは直さず「合っていません」にする", () => {
  // 品物を1つ読み落としたようなケース。消費税では説明がつかない
  const items = [{ name: "A", amount: 1000 }];
  const r = reconcileItemsToTotal(items, 5000);
  assert.equal(r.reason, "mismatch");
  assert.equal(r.adjusted, false);
  assert.equal(r.matched, false);
  assert.deepEqual(r.items, items, "勝手に5倍にしたりしない");
});

test("reconcileItemsToTotal: 合計のほうが小さいときも直さない（値引きなど）", () => {
  const r = reconcileItemsToTotal([{ name: "A", amount: 1000 }], 900);
  assert.equal(r.reason, "mismatch");
  assert.equal(r.adjusted, false);
});

test("reconcileItemsToTotal: 8%も10%も直せる／上限（12%）を超えたら直さない", () => {
  const items = [{ name: "A", amount: 1000 }];
  assert.equal(reconcileItemsToTotal(items, 1080).reason, "adjusted"); // 8%
  assert.equal(reconcileItemsToTotal(items, 1100).reason, "adjusted"); // 10%
  assert.equal(reconcileItemsToTotal(items, 1120).reason, "adjusted"); // ちょうど上限
  assert.equal(reconcileItemsToTotal(items, 1121).reason, "mismatch"); // 上限超え
  assert.equal(MAX_TAX_RATIO, 1.12);
});

test("reconcileItemsToTotal: 8%と10%が混ざったレシートでも合計にぴったり合う", () => {
  // 食品（8%）と消耗品（10%）が混ざったレシート
  const items = [
    { name: "肉", amount: 12960 },
    { name: "レジ袋", amount: 500 },
    { name: "片栗粉", amount: 1194 },
  ];
  const total = 15271; // 12960*1.08 + 500*1.1 + 1194*1.08 ≒ 15271
  const r = reconcileItemsToTotal(items, total);
  assert.equal(r.reason, "adjusted");
  assert.equal(r.adjustedSum, total);
});

test("reconcileItemsToTotal: 壊れた値でも落ちない", () => {
  const r = reconcileItemsToTotal(
    [
      { name: "A", amount: NaN as unknown as number },
      { name: "B", amount: 1000 },
    ],
    1080,
  );
  assert.equal(r.adjustedSum, 1080);
  assert.equal(r.items[0].amount, 0);
});
