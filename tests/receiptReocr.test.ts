/**
 * 「昔のレシート写真を読み直して税込に直す」判定のテスト。
 *
 * ★ここが緩いと、レシートの別の品物の金額を取り違えて経費が壊れます。
 *   だから「どの品物か分からなければ直さない」を固定します。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { findMatchingItem, decideReocrFix } from "../lib/receiptReocr";
import { parseReceiptText, toAmount, stripDataUrl } from "../lib/receiptOcr";
import type { ReadReceiptResult } from "../lib/receiptOcr";

/** テスト用の読み取り結果を作る */
const ocr = (
  items: { name: string; amount: number }[],
  total = 0,
): ReadReceiptResult => ({
  items,
  total,
  tax: 0,
  check: { itemsSum: 0, adjustedSum: 0, adjusted: false, matched: true, reason: "ok" },
  raw: "",
});

/* ---------- どの品物か決める ---------- */

test("findMatchingItem: 名前がぴったり同じなら、その品物", () => {
  const r = findMatchingItem(
    "火乃国 片栗粉 北海 1kg",
    ocr([
      { name: "火乃国 片栗粉 北海 1kg", amount: 1719 },
      { name: "花王 チェリーナ 4.5L", amount: 1848 },
    ]),
  );
  assert.equal(r?.amount, 1719);
});

test("findMatchingItem: 全角半角・空白の違いは同じとみなす", () => {
  const r = findMatchingItem(
    "火乃国　片栗粉　北海　１ｋｇ",
    ocr([{ name: "火乃国 片栗粉 北海 1kg", amount: 1719 }, { name: "他", amount: 100 }]),
  );
  assert.equal(r?.amount, 1719);
});

test("findMatchingItem: レシートで途中まで切れている名前は先頭一致で拾う", () => {
  const r = findMatchingItem(
    "源清田 中国産おろしにん",
    ocr([
      { name: "源清田 中国産おろしにんにく", amount: 754 },
      { name: "スターパック", amount: 300 },
    ]),
  );
  assert.equal(r?.amount, 754);
});

test("findMatchingItem: 同じ名前が2つあるときは決めない（取り違え防止）", () => {
  const r = findMatchingItem(
    "ポテト",
    ocr([
      { name: "ポテト", amount: 300 },
      { name: "ポテト", amount: 450 },
    ]),
  );
  assert.equal(r, null);
});

test("findMatchingItem: どれとも似ていないときは決めない", () => {
  const r = findMatchingItem(
    "場代",
    ocr([
      { name: "火乃国 片栗粉", amount: 1719 },
      { name: "花王 チェリーナ", amount: 1848 },
    ]),
  );
  assert.equal(r, null);
});

test("findMatchingItem: 品物が1つだけのレシートなら、それとみなす", () => {
  const r = findMatchingItem("何かの品物", ocr([{ name: "ガソリン", amount: 5000 }]));
  assert.equal(r?.amount, 5000);
});

test("findMatchingItem: 2文字以下の一致では決めない（偶然当たるため）", () => {
  const r = findMatchingItem(
    "氷",
    ocr([
      { name: "氷結レモン", amount: 1000 },
      { name: "スターパック", amount: 300 },
    ]),
  );
  assert.equal(r, null);
});

test("findMatchingItem: 説明が空・読み取りが空なら決めない", () => {
  assert.equal(findMatchingItem("", ocr([{ name: "x", amount: 1 }])), null);
  assert.equal(findMatchingItem("片栗粉", ocr([])), null);
});

/* ---------- 直すかどうか ---------- */

const R = ocr([{ name: "火乃国 片栗粉 北海 1kg", amount: 1719 }]);

test("decideReocrFix: 税込のほうが多く、消費税で説明できる範囲なら直す", () => {
  const d = decideReocrFix("火乃国 片栗粉 北海 1kg", 1592, R);
  assert.equal(d.action, "fix");
  assert.equal(d.newAmount, 1719);
});

test("decideReocrFix: すでに税込なら直さない", () => {
  const d = decideReocrFix("火乃国 片栗粉 北海 1kg", 1719, R);
  assert.equal(d.action, "skip");
});

test("decideReocrFix: 読み取りのほうが少ないときは直さない（人が確かめる）", () => {
  const d = decideReocrFix("火乃国 片栗粉 北海 1kg", 2000, R);
  assert.equal(d.action, "skip");
});

test("decideReocrFix: 差が大きすぎる（1.12倍を超える）ときは直さない", () => {
  const d = decideReocrFix("火乃国 片栗粉 北海 1kg", 1000, R);
  assert.equal(d.action, "skip");
  assert.match(d.reason, /消費税では説明できない/);
});

test("decideReocrFix: どの品物か決められないときは直さない", () => {
  const d = decideReocrFix(
    "場代",
    3000,
    ocr([
      { name: "片栗粉", amount: 1719 },
      { name: "チェリーナ", amount: 1848 },
    ]),
  );
  assert.equal(d.action, "skip");
  assert.match(d.reason, /名前が一致しない/);
});

test("decideReocrFix: 読み取れなかったときは直さない", () => {
  const d = decideReocrFix("片栗粉", 1592, ocr([]));
  assert.equal(d.action, "skip");
  assert.match(d.reason, /読み取れなかった/);
});

test("decideReocrFix: 元の金額が0円・読み取りが0円なら直さない", () => {
  assert.equal(decideReocrFix("火乃国 片栗粉 北海 1kg", 0, R).action, "skip");
  assert.equal(
    decideReocrFix("片栗粉", 1000, ocr([{ name: "片栗粉", amount: 0 }])).action,
    "skip",
  );
});

/* ---------- 読み取り結果の読み込み（指示文と同じファイル） ---------- */

test("parseReceiptText: 品物が税抜で返ってきたら、支払合計に合わせて税込に直す", () => {
  const out = parseReceiptText(
    JSON.stringify({ items: [{ name: "A", amount: 1000 }, { name: "B", amount: 1000 }], total: 2160, tax: 160 }),
  );
  assert.equal(out.items.reduce((s, i) => s + i.amount, 0), 2160);
  assert.equal(out.check.adjusted, true);
  assert.equal(out.tax, 160);
});

test("parseReceiptText: 説明文が前後についていてもJSONを取り出せる", () => {
  const out = parseReceiptText('はい。\n{"items":[{"name":"A","amount":500}],"total":500}\n以上です');
  assert.equal(out.items.length, 1);
  assert.equal(out.total, 500);
});

test("parseReceiptText: 読み取れない文字なら空の結果（例外を投げない）", () => {
  const out = parseReceiptText("読み取れませんでした");
  assert.equal(out.items.length, 0);
  assert.equal(out.check.reason, "no_total");
});

test("toAmount / stripDataUrl", () => {
  assert.equal(toAmount("¥1,234"), 1234);
  assert.equal(toAmount(1234.4), 1234);
  assert.equal(toAmount(null), 0);
  assert.equal(stripDataUrl("data:image/jpeg;base64,AAAA"), "AAAA");
  assert.equal(stripDataUrl("AAAA"), "AAAA");
});
