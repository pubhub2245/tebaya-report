/**
 * レシートの写真から読み取った中身を、科目つきの経費の行にするところ
 * （lib/keiri/receiptIntake.ts・2026-10-05・kp229・f1-6）。
 *
 * ■ なぜ要るか
 *   仕上げチェック表 f1-6 は「レシートの写真から、金額と中身を取り込んで
 *   仕分けできるか」です。写真を読む・税込に直す・科目を当てるの3つが
 *   つながっていないと、「取り込みと仕分けができる」と言えません。
 *
 * ■ ここで守ること
 *   ① **金額を作らない。**支払合計と合わない差は直さず「要確認」にする（CLAUDE.md 4-12）
 *   ② 科目の当て方は経理画面と同じ（classifyExpense）。ここで別の当て方を作らない
 *   ③ 税抜で読めたレシートは、割り振ったあとの合計が支払合計とぴったり合う
 *   ※ 数字は作り物です（実在のお店の金額は置きません）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildReceiptIntake, descriptionOf, sumByAccount } from "../lib/keiri/receiptIntake";
import { parseReceiptText } from "../lib/receiptOcr";
import { TEBAYA_TEMPLATE } from "../lib/keiri/templates/tebaya";

/** 読み取りの文字から intake まで、端から端まで通す（写真を読む所だけ差し替え） */
function through(raw: string) {
  const read = parseReceiptText(raw);
  return buildReceiptIntake({
    items: read.items,
    check: read.check,
    total: read.total,
    template: TEBAYA_TEMPLATE,
  });
}

test("税込で読めたレシートは、そのまま科目つきの経費の行になる", () => {
  const intake = through(
    JSON.stringify({
      items: [
        { name: "鶏手羽 2kg", amount: 2160 },
        { name: "ガソリン", amount: 3000 },
      ],
      total: 5160,
      tax: 400,
      itemsAreTaxIncluded: true,
    }),
  );
  assert.equal(intake.rows.length, 2);
  assert.equal(intake.rows[0].account, "purchase");
  assert.equal(intake.rows[1].account, "vehicle");
  assert.equal(intake.rowsTotal, 5160);
  assert.equal(intake.total, 5160);
  assert.equal(intake.totalMatched, true);
  assert.equal(intake.unmatchedCount, 0);
  assert.equal(intake.needsHuman, false);
  assert.equal(intake.ok, true);
});

test("品物が税抜だったレシートは、割り振ったあとの合計が支払合計とぴったり合う", () => {
  // 品物の合計 1,000円 ＋ 消費税 80円 ＝ 支払合計 1,080円
  const intake = through(
    JSON.stringify({
      items: [
        { name: "片栗粉", amount: 400 },
        { name: "鶏肉", amount: 600 },
      ],
      total: 1080,
      tax: 80,
      itemsAreTaxIncluded: false,
    }),
  );
  assert.equal(intake.taxAdjusted, true);
  assert.equal(intake.rowsTotal, 1080, "割り振ったあとの合計は支払合計ぴったり");
  assert.equal(intake.totalMatched, true);
  assert.equal(intake.rows.every((r) => r.account === "purchase" || r.account === "supplies"), true);
});

test("消費税で説明がつかない差は、直さずに『要確認』として返す", () => {
  const intake = through(
    JSON.stringify({ items: [{ name: "鶏肉", amount: 1000 }], total: 5000, tax: 0 }),
  );
  assert.equal(intake.rowsTotal, 1000, "金額を勝手に作らない");
  assert.equal(intake.totalMatched, false);
  assert.equal(intake.needsHuman, true);
  assert.equal(intake.reason, "mismatch");
  assert.equal(intake.ok, false);
});

test("科目が当たらない行は雑費に置き、件数を数える", () => {
  const intake = through(
    JSON.stringify({ items: [{ name: "保健所 検便", amount: 1800 }], total: 1800 }),
  );
  assert.equal(intake.rows[0].account, "misc");
  assert.equal(intake.rows[0].matched, false);
  assert.equal(intake.unmatchedCount, 1);
  assert.equal(intake.needsHuman, true, "当たらない行があるときは人に確かめてもらう");
});

test("1つも読み取れなかったときは、作り話をせず『読み取れなかった』と返す", () => {
  const intake = through("よく分からない文字");
  assert.equal(intake.rows.length, 0);
  assert.equal(intake.rowsTotal, 0);
  assert.equal(intake.ok, false);
  assert.equal(intake.needsHuman, true);
  assert.match(intake.message, /読み取れませんでした/);
});

test("支払合計が読めなかったレシートは、合わせたことにしない", () => {
  const intake = through(JSON.stringify({ items: [{ name: "鶏肉", amount: 1000 }] }));
  assert.equal(intake.reason, "no_total");
  assert.equal(intake.totalMatched, false);
  assert.equal(intake.needsHuman, true);
});

test("品名が読めなかった行も落とさず、内容に『商品名？』を置く", () => {
  assert.equal(descriptionOf({ name: "  " }), "商品名？");
  assert.equal(descriptionOf({ name: "場代" }), "場代");
});

test("科目ごとの合計は、行の合計と1円も違わない", () => {
  const intake = through(
    JSON.stringify({
      items: [
        { name: "鶏手羽", amount: 2000 },
        { name: "鶏もも", amount: 1000 },
        { name: "駐車場", amount: 500 },
      ],
      total: 3500,
    }),
  );
  const by = sumByAccount(intake);
  assert.equal(
    by.reduce((s, b) => s + b.amount, 0),
    intake.rowsTotal,
  );
  const purchase = by.find((b) => b.account === "purchase");
  assert.equal(purchase?.amount, 3000, "同じ科目の行はまとまる");
});
