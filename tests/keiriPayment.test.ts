/**
 * 「お金をどうやって受け取るか」の言い方（lib/keiri/payment.ts）のテスト。
 *
 * ★ここで守るのは4点。
 *   ① カードがまだ使えないときも、**受け取り方が必ず書いてある**（「準備中」で終わらせない）
 *   ② 口座番号・支店名などのお振込先そのものは、**どの文にも入らない**
 *      （公開ページに出さず、お申し込みのあと個別にご案内する形）
 *   ③ カードの受付口が入った瞬間、自動でカードの書き方に戻る
 *   ④ 画面（紹介ページ・特商法）に文章が直書きされていない
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KEIRI_BANK_TRANSFER,
  paymentMethodLine,
  paymentNoticeLine,
  paymentStepBody,
  paymentTimingLine,
} from "../lib/keiri/payment";
import { keiriStartSteps } from "../lib/keiri/offer";
import { tokushohoRows } from "../lib/keiri/legal";

/** 口座そのものを指す言葉。どれか1つでも出たら落とす */
const ACCOUNT_WORDS = ["普通預金", "当座", "支店", "口座番号", "名義"];

test("カードがまだ無いときも、受け取り方が必ず書いてある（準備中で終わらせない）", () => {
  for (const line of [
    paymentMethodLine(false),
    paymentTimingLine(false),
    paymentStepBody(false),
    paymentNoticeLine(),
  ]) {
    assert.ok(line.length > 0);
    assert.ok(!line.includes("準備中"), `「準備中」が残っています: ${line}`);
  }
  assert.ok(paymentMethodLine(false).includes(KEIRI_BANK_TRANSFER));
  assert.ok(paymentNoticeLine().includes(KEIRI_BANK_TRANSFER));
  assert.ok(paymentStepBody(false).includes(KEIRI_BANK_TRANSFER));
});

test("お振込先そのものは、どの文にも入らない", () => {
  const all = [
    paymentMethodLine(false),
    paymentMethodLine(true),
    paymentTimingLine(false),
    paymentTimingLine(true),
    paymentStepBody(false),
    paymentStepBody(true),
    paymentNoticeLine(),
    ...tokushohoRows(false).map((r) => r.value),
    ...keiriStartSteps(false).map((s) => s.body),
  ].join("");
  for (const w of ACCOUNT_WORDS) {
    assert.ok(!all.includes(w), `お振込先の中身（${w}）が文に入っています`);
  }
  // 数字の並び（口座番号らしきもの）も出さない
  assert.ok(!/\d{7,}/.test(all), "口座番号らしい数字の並びが入っています");
});

test("カードの受付口ができたら、自動でカードの書き方に戻る", () => {
  assert.equal(paymentMethodLine(true), "クレジットカード決済（Stripe）");
  assert.ok(paymentTimingLine(true).includes("お申し込み時に初回分を決済"));
  assert.ok(paymentStepBody(true).includes("カードでお支払い"));
  assert.ok(!paymentStepBody(true).includes(KEIRI_BANK_TRANSFER));
  // 渡し忘れたときは、正直なほう（カードではない側）に倒れる
  assert.equal(paymentMethodLine(), paymentMethodLine(false));
  assert.equal(paymentTimingLine(), paymentTimingLine(false));
  assert.equal(paymentStepBody(), paymentStepBody(false));
});

test("特商法と紹介ページの②は、この1本から作られている（直書きしていない）", () => {
  const rows = tokushohoRows(false);
  const get = (label: string) => rows.find((r) => r.label === label)!.value;
  assert.equal(get("支払方法"), paymentMethodLine(false));
  assert.equal(get("支払時期"), paymentTimingLine(false));

  const step2 = keiriStartSteps(false).find((s) => s.n === "2")!;
  assert.equal(step2.body, paymentStepBody(false));
  assert.equal(keiriStartSteps(true).find((s) => s.n === "2")!.body, paymentStepBody(true));

  // 画面のファイルに同じ文が直書きされていないこと
  const casePage = readFileSync("app/keiri/case/page.tsx", "utf8");
  assert.ok(!casePage.includes("いまはカード決済の受付を準備中のため"));
  assert.ok(casePage.includes("paymentNoticeLine()"));
});
