import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SUPPLY_GROUPS, supplyCount } from "../lib/supplies";

const items = SUPPLY_GROUPS.flatMap((g) => g.items);

test("備品は13点。同じ印（id）が2つ無い", () => {
  assert.equal(supplyCount(), 13);
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

import { ADDED_GROUP, checkNewSupply, mergeSupplies, supplyGroupTitles } from "../lib/supplies";

test("お店が足した品物は、選んだまとまりの最後に入る。知らないまとまりは「お店で足したもの」へ", () => {
  const merged = mergeSupplies(SUPPLY_GROUPS, [
    { id: "a", group_title: "揚げもの", name: "片栗粉", detail: "1kg", use_for: "衣", price_tax_in: 429, photo: null },
    { id: "b", group_title: "知らない", name: "ゴム手袋", detail: null, use_for: null, price_tax_in: null, photo: "https://x/y.jpg" },
  ]);
  const fry = merged.find((g) => g.title === "揚げもの")!;
  assert.equal(fry.items.at(-1)?.name, "片栗粉");
  assert.equal(fry.items.at(-1)?.priceTaxIn, 429);
  assert.equal(fry.items.at(-1)?.added, true);
  const extra = merged.find((g) => g.title === ADDED_GROUP)!;
  assert.equal(extra.items[0].name, "ゴム手袋");
  assert.equal(extra.items[0].priceTaxIn, undefined);
  assert.equal(extra.items[0].photo, "https://x/y.jpg");
});

test("足した品物が無ければ、一覧ははじめのまま（元の一覧も書き換えない）", () => {
  const merged = mergeSupplies(SUPPLY_GROUPS, []);
  assert.equal(supplyCount(merged), 13);
  mergeSupplies(SUPPLY_GROUPS, [{ id: "a", group_title: "備品", name: "x", detail: null, use_for: null, price_tax_in: null, photo: null }]);
  assert.equal(supplyCount(), 13);
});

test("名前の無い行は飛ばす（数字を作らない）", () => {
  const merged = mergeSupplies(SUPPLY_GROUPS, [{ id: "a", group_title: "備品", name: "  ", detail: null, use_for: null, price_tax_in: null, photo: null }]);
  assert.equal(supplyCount(merged), 13);
});

test("登録の入力チェック：名前は必須、値段は半角の数字だけ", () => {
  assert.equal(checkNewSupply({ name: "片栗粉", price: "429" }), null);
  assert.equal(checkNewSupply({ name: "片栗粉" }), null);
  assert.ok(checkNewSupply({ name: " " }));
  assert.ok(checkNewSupply({ name: "片栗粉", price: "４２９" }));
  assert.ok(checkNewSupply({ name: "片栗粉", price: "429円" }));
  assert.ok(checkNewSupply({ name: "あ".repeat(61) }));
});

test("並べる場所の選択肢は、はじめのまとまり＋「お店で足したもの」", () => {
  const titles = supplyGroupTitles();
  assert.equal(titles.at(-1), ADDED_GROUP);
  assert.equal(titles.length, SUPPLY_GROUPS.length + 1);
});
