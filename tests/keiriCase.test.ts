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
  paymentLinkUrl,
  priceLabel,
} from "../lib/keiri/caseNumbers";

test("万円の表示は小数1桁まで。整数なら小数を出さない", () => {
  assert.equal(manYen(75.9), "75.9万円");
  assert.equal(manYen(6.5), "6.5万円");
  assert.equal(manYen(6), "6万円");
  assert.equal(manYen(6.04), "6万円");
});

test("価格の1行表示は確定した価格（月額3,000円・税込・1店舗）", () => {
  assert.equal(KEIRI_PRICE.monthlyYenTaxIncluded, 3000);
  assert.equal(priceLabel(), "月額3,000円（税込）／1店舗");
});

test("事例の数字は筋が通っている（利益は売上より小さく、正の数。確認日がある）", () => {
  assert.ok(CASE_TEBAYA.days > 0);
  assert.ok(CASE_TEBAYA.salesMan > 0);
  assert.ok(CASE_TEBAYA.profitMan > 0);
  assert.ok(CASE_TEBAYA.profitMan < CASE_TEBAYA.salesMan);
  assert.match(CASE_TEBAYA.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
});

test("申し込みリンクは https の環境変数があるときだけ。無ければ null（偽のリンクを出さない）", () => {
  assert.equal(paymentLinkUrl({} as NodeJS.ProcessEnv), null);
  assert.equal(paymentLinkUrl({ NEXT_PUBLIC_KEIRI_PAYMENT_LINK: "  " } as NodeJS.ProcessEnv), null);
  assert.equal(paymentLinkUrl({ NEXT_PUBLIC_KEIRI_PAYMENT_LINK: "http://example.com/x" } as NodeJS.ProcessEnv), null);
  assert.equal(
    paymentLinkUrl({ NEXT_PUBLIC_KEIRI_PAYMENT_LINK: "https://buy.stripe.com/test_abc" } as NodeJS.ProcessEnv),
    "https://buy.stripe.com/test_abc"
  );
});
