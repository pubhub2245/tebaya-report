import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { COOKING_MANUAL, MANUAL_GROUPS, manualPhotoIds } from "../lib/cookingManual";

test("マニュアルの写真は全部ある（無いと画面に穴があく）", () => {
  for (const id of manualPhotoIds()) {
    assert.ok(existsSync(join(__dirname, "..", "public", "supplies", `${id}.jpg`)), id);
  }
});

test("目次の印（id）が重ならない。どの節もどこかのまとまりに入っている", () => {
  const ids = COOKING_MANUAL.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of COOKING_MANUAL) assert.ok(MANUAL_GROUPS.includes(s.group), s.id);
});

test("仕込みと調理がそろっている（タレ・餃子の種・骨抜き・揚げ方）", () => {
  const ids = COOKING_MANUAL.map((s) => s.id);
  for (const id of ["prep-tebasaki", "prep-gyoza", "prep-tare", "cook-tebasaki", "cook-potato"]) {
    assert.ok(ids.includes(id), id);
  }
});

test("タレは2026-02-24のレシピ（甘口しょうゆ320cc・酢80cc・ザラメ200g・砂糖130g）", () => {
  const tare = COOKING_MANUAL.find((s) => s.id === "prep-tare")!;
  const table = tare.blocks.find((b) => b.kind === "table");
  assert.ok(table && table.kind === "table");
  const rows = Object.fromEntries(table.rows.map((r) => [r[0], r[1]]));
  assert.equal(rows["甘口しょうゆ（あまくち福）"], "320cc");
  assert.equal(rows["酢"], "80cc");
  assert.equal(rows["ザラメ"], "200g");
  assert.equal(rows["砂糖"], "130g");
});
