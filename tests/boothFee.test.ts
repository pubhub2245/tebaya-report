/**
 * 出店料（場代）の決まりを、出店場所マスタから引くところのテスト。
 *
 * ここが狂うと、ちがうお店の場代が日報に入ってしまう
 * （例：PASIO鷹尾 と ながやま鷹尾 は別のお店。混ぜてはいけない）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBoothFeeRules,
  boothFeeRuleFor,
  toBoothFeeRule,
} from "../lib/boothFee";
import { calcBoothFee } from "../lib/money";

const MASTER = [
  { name: "ながやま鷹尾", booth_fee_type: "percent", booth_fee_rate: 10, booth_fee_amount: null },
  { name: "PASIO鷹尾", booth_fee_type: "percent", booth_fee_rate: 10, booth_fee_amount: null },
  { name: "ニシムタ", booth_fee_type: "fixed", booth_fee_rate: null, booth_fee_amount: 5000 },
  { name: "イオンモール", booth_fee_type: "fixed", booth_fee_rate: null, booth_fee_amount: 8250 },
  { name: "マンガ倉庫", booth_fee_type: "none", booth_fee_rate: null, booth_fee_amount: null },
];

test("マスタの行を、計算に使える決まりに変える", () => {
  assert.deepEqual(toBoothFeeRule(MASTER[0]), { type: "percent", rate: 10 });
  assert.deepEqual(toBoothFeeRule(MASTER[2]), { type: "fixed", amount: 5000 });
  assert.deepEqual(toBoothFeeRule(MASTER[4]), { type: "none" });
  assert.deepEqual(toBoothFeeRule(null), { type: "none" });
});

test("日報の書き方がバラバラでも、名寄せして正しい決まりを引く", () => {
  const rules = buildBoothFeeRules(MASTER);
  assert.deepEqual(boothFeeRuleFor(rules, "ニシムタ 都城店"), {
    type: "fixed",
    amount: 5000,
  });
  assert.deepEqual(boothFeeRuleFor(rules, "イオン"), {
    type: "fixed",
    amount: 8250,
  });
});

test("高城（たかじょう）と鷹尾（たかお）を混ぜない／ながやまとPASIOも混ぜない", () => {
  const rules = buildBoothFeeRules([
    ...MASTER,
    { name: "PASIO高城", booth_fee_type: "fixed", booth_fee_rate: null, booth_fee_amount: 3333 },
  ]);
  // ながやま鷹尾 は10%、PASIO高城 は定額3,333円（別のお店）
  assert.equal(calcBoothFee(boothFeeRuleFor(rules, "ながやま 鷹尾店"), 30000), 3000);
  assert.equal(calcBoothFee(boothFeeRuleFor(rules, "パシオ 高城店"), 30000), 3333);
});

test("マスタに無い場所・決まりが無い場所は「なし」（勝手に0円を作らない）", () => {
  const rules = buildBoothFeeRules(MASTER);
  assert.deepEqual(boothFeeRuleFor(rules, "高鍋祭り"), { type: "none" });
  assert.equal(calcBoothFee(boothFeeRuleFor(rules, "高鍋祭り"), 47500), null);
  assert.equal(calcBoothFee(boothFeeRuleFor(rules, "マンガ倉庫"), 30000), null);
});
