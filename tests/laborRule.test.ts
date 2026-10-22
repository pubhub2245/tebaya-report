/**
 * 日当（1日いくら払うか）の決め方の固定テスト（2026-10-22・f3-4）。
 *
 * 守りたいことは2つだけです。
 *  ① **手羽屋は今までどおり**（マスタに無い人はコードの保険の表・空なら ¥10,000）
 *  ② **よそのお店には、手羽屋の金額を1円も入れない**
 *     （マスタに日当が無ければ 0 のまま＝画面が「入っていません」と言う）
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  laborKnown,
  laborToSave,
  makeLaborFor,
  resolveLabor,
  resolveLaborDetail,
  type StaffWageMap,
} from "../lib/laborRule";
import { DEFAULT_DAILY_PAY, OTHER_DAILY_PAY, STAFF_DAILY_PAY } from "../lib/formState";

/** よそのお店の番号（かたちだけ本物に合わせた架空の値） */
const OTHER_SHOP = "11111111-2222-3333-4444-555555555555";

const emptyMaster: StaffWageMap = new Map();
const withMaster: StaffWageMap = new Map([["テスト太郎", 7000]]);

test("手羽屋：マスタに無い人は、今までどおりコードの保険の表を使う", () => {
  assert.equal(resolveLabor(emptyMaster, "イデ"), STAFF_DAILY_PAY["イデ"]);
  assert.equal(resolveLabor(emptyMaster, "だれか"), DEFAULT_DAILY_PAY);
  assert.equal(resolveLabor(emptyMaster, "", true), OTHER_DAILY_PAY);
  // 第4の引数を渡さないときも手羽屋として扱う（＝古い呼び方のまま壊れない）
  assert.equal(makeLaborFor(emptyMaster)("イデ"), STAFF_DAILY_PAY["イデ"]);
});

test("手羽屋：マスタに値があればマスタが勝つ（CLAUDE.md 4-3）", () => {
  assert.equal(resolveLabor(withMaster, "テスト太郎"), 7000);
  assert.equal(resolveLaborDetail(withMaster, "テスト太郎").source, "master");
});

test("よそのお店：マスタに無い人は 0 のまま。手羽屋の金額を入れない", () => {
  const d = resolveLaborDetail(emptyMaster, "イデ", false, OTHER_SHOP);
  assert.equal(d.amount, 0);
  assert.equal(d.known, false);
  assert.equal(d.source, "none");
  // 名前がどうであっても、よそのお店に手羽屋の表の金額は出ない
  for (const name of Object.keys(STAFF_DAILY_PAY)) {
    assert.equal(makeLaborFor(emptyMaster, OTHER_SHOP)(name), 0);
  }
  assert.equal(makeLaborFor(emptyMaster, OTHER_SHOP)("", true), 0);
});

test("よそのお店：自分のマスタに入っている日当は、そのまま使える", () => {
  assert.equal(resolveLabor(withMaster, "テスト太郎", false, OTHER_SHOP), 7000);
  assert.equal(laborKnown(withMaster, "テスト太郎", false, OTHER_SHOP), true);
});

test("画面に断りを出すのは、よそのお店でマスタに無いときだけ", () => {
  assert.equal(laborKnown(emptyMaster, "イデ"), true); // 手羽屋は今までどおり出さない
  assert.equal(laborKnown(emptyMaster, "イデ", false, OTHER_SHOP), false);
});

test("保存する日当：手羽屋は今までと同じ（空なら ¥10,000）", () => {
  assert.equal(laborToSave(9000), 9000);
  assert.equal(laborToSave(0), DEFAULT_DAILY_PAY);
  assert.equal(laborToSave(null), DEFAULT_DAILY_PAY);
  assert.equal(laborToSave(undefined), DEFAULT_DAILY_PAY);
});

test("保存する日当：よそのお店は、空なら 0。勝手な金額を作らない", () => {
  assert.equal(laborToSave(0, OTHER_SHOP), 0);
  assert.equal(laborToSave(null, OTHER_SHOP), 0);
  assert.equal(laborToSave(undefined, OTHER_SHOP), 0);
  // 入れた金額はそのまま使う
  assert.equal(laborToSave(7000, OTHER_SHOP), 7000);
});

test("保存する日当：おかしな値でも金額を作らない", () => {
  assert.equal(laborToSave(-500, OTHER_SHOP), 0);
  assert.equal(laborToSave(Number.NaN, OTHER_SHOP), 0);
  // 手羽屋は空と同じ扱い（今までどおり）
  assert.equal(laborToSave(-500), DEFAULT_DAILY_PAY);
  assert.equal(laborToSave(1234.9, OTHER_SHOP), 1234);
});
