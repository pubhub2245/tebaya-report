import { test } from "node:test";
import assert from "node:assert/strict";
import { decideStaffLogin, validStaffCode } from "../lib/photoShopStaffCode";

const MUTA = "bec74fef-6293-4c50-8c1c-a8d77bc34262";

test("倉庫（画面で決めた合言葉）に合えば、そのお店に入れる", () => {
  assert.equal(decideStaffLogin({ dbTenantId: MUTA, codeTenantId: null, codeIsSet: true }), MUTA);
});

test("まだ画面で決めていないお店は、仮の合言葉（コードの値）で入れる", () => {
  assert.equal(decideStaffLogin({ dbTenantId: null, codeTenantId: MUTA, codeIsSet: false }), MUTA);
});

test("画面で決めたあとは、仮の合言葉では入れない", () => {
  assert.equal(decideStaffLogin({ dbTenantId: null, codeTenantId: MUTA, codeIsSet: true }), null);
});

test("どちらにも合わなければ入れない。変な値も入れない", () => {
  assert.equal(decideStaffLogin({ dbTenantId: null, codeTenantId: null, codeIsSet: false }), null);
  assert.equal(decideStaffLogin({ dbTenantId: "変な値", codeTenantId: null, codeIsSet: false }), null);
});

test("新しい合言葉は半角の数字か英字で4〜12文字", () => {
  assert.equal(validStaffCode("1111"), true);
  assert.equal(validStaffCode("a1b2c3"), true);
  assert.equal(validStaffCode("123"), false);
  assert.equal(validStaffCode("1234567890123"), false);
  assert.equal(validStaffCode("１２３４"), false);
  assert.equal(validStaffCode("12 34"), false);
});
