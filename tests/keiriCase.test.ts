/**
 * 経理パッケージの紹介ページ（/keiri/case）に載せる数字と表示のテスト。
 *
 * ★数字そのものの正しさは本番データの検算で担保する（lib/keiri/caseNumbers.ts の出典）。
 *   ここで守るのは「表示が数字を歪めない」「偽の申し込みリンクを出さない」の2点。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CASE_TEBAYA,
  KEIRI_PRICE,
  manYen,
  paymentLinkEnvName,
  paymentLinkUrl,
  priceLabel,
  priceSummaryLine,
} from "../lib/keiri/caseNumbers";

test("万円の表示は小数1桁まで。整数なら小数を出さない", () => {
  assert.equal(manYen(75.9), "75.9万円");
  assert.equal(manYen(6.5), "6.5万円");
  assert.equal(manYen(6), "6万円");
  assert.equal(manYen(6.04), "6万円");
});

test("価格の1行表示は確定した価格（月額15,000円・税込・1店舗）", () => {
  assert.equal(KEIRI_PRICE.monthlyYenTaxIncluded, 15000);
  assert.equal(priceLabel(), "月額15,000円（税込）／1店舗");
});

test("一番上の1行は「いくら・初期費用・やめられるか」の3つが入る（新しい約束は足さない）", () => {
  const line = priceSummaryLine();
  assert.ok(line.startsWith(priceLabel()));
  assert.ok(line.includes("初期費用なし"));
  assert.ok(line.includes("いつでも自分の画面から解約"));
  // 価格の枠に書いていないこと（無料お試しなど）を足していない
  assert.ok(!line.includes("無料"));
});

test("事例の数字は筋が通っている（利益は売上より小さく、正の数。確認日がある）", () => {
  assert.ok(CASE_TEBAYA.days > 0);
  assert.ok(CASE_TEBAYA.salesMan > 0);
  assert.match(CASE_TEBAYA.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
  // 利益は「確かめていないので null」でよい（推測で数字を作らない・2026-09-19 kp73）。
  // 値を入れるなら、正の数で売上より小さいこと。
  const profit: number | null = CASE_TEBAYA.profitMan;
  if (profit !== null) {
    assert.ok(profit > 0);
    assert.ok(profit < CASE_TEBAYA.salesMan);
  }
});

test("支払いリンクを入れる環境変数の名前には、いまの価格が入る", () => {
  assert.equal(paymentLinkEnvName(), "NEXT_PUBLIC_KEIRI_PAYMENT_LINK_15000");
  assert.ok(paymentLinkEnvName().endsWith(String(KEIRI_PRICE.monthlyYenTaxIncluded)));
});

test("申し込みリンクは https の環境変数があるときだけ。無ければ null（偽のリンクを出さない）", () => {
  const name = paymentLinkEnvName();
  const env = (v: string) => ({ [name]: v }) as unknown as NodeJS.ProcessEnv;
  assert.equal(paymentLinkUrl({} as unknown as NodeJS.ProcessEnv), null);
  assert.equal(paymentLinkUrl(env("  ")), null);
  assert.equal(paymentLinkUrl(env("http://example.com/x")), null);
  assert.equal(paymentLinkUrl(env("https://buy.stripe.com/test_abc")), "https://buy.stripe.com/test_abc");
});

test("前の価格のときに登録した支払いリンクは、値上げ後は使われない（表示と請求の食い違いを作らない）", () => {
  // 3,000円のときの名前で入っていても、いまの価格（15,000円）では見つからない＝「準備中」になる
  const old = {
    NEXT_PUBLIC_KEIRI_PAYMENT_LINK: "https://buy.stripe.com/old_3000",
    NEXT_PUBLIC_KEIRI_PAYMENT_LINK_3000: "https://buy.stripe.com/old_3000",
  } as unknown as NodeJS.ProcessEnv;
  assert.equal(paymentLinkUrl(old), null);
});
