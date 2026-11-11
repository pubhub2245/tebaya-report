import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SUPPLY_GROUPS, supplyCount } from "../lib/supplies";

const items = SUPPLY_GROUPS.flatMap((g) => g.items);

test("備品は14点。同じ印（id）が2つ無い", () => {
  assert.equal(supplyCount(), 14);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
});

test("どの備品にも写真がある（写真が無いと画面に穴があく）", () => {
  for (const i of items) {
    assert.ok(existsSync(join(__dirname, "..", "public", "supplies", `${i.id}.jpg`)), i.id);
  }
});

test("値段があるものは、税込が本体より高く、消費税で説明できる範囲（1.12倍以内）", () => {
  for (const i of items) {
    if (i.price === undefined) {
      assert.equal(i.priceTaxIn, undefined, `${i.id}：本体が無いのに税込だけある`);
      continue;
    }
    assert.ok(i.priceTaxIn !== undefined && i.priceTaxIn > i.price, i.id);
    assert.ok(i.priceTaxIn! <= Math.ceil(i.price * 1.12), i.id);
  }
});
