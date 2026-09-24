/**
 * 経理パッケージの紹介ページ（/keiri/case）に載せる数字と表示のテスト。
 *
 * ★数字そのものの正しさは本番データの検算で担保する（lib/keiri/caseNumbers.ts の出典）。
 *   ここで守るのは「表示が数字を歪めない」「偽の申し込みリンクを出さない」の2点。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  CASE_TEBAYA,
  KEIRI_PRICE,
  manYen,
  paymentLinkEnvName,
  paymentLinkUrl,
  priceLabel,
  cancelLongLabel,
  cancelShortLabel,
  cardCheckoutLive,
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
  // カードで払える状態のとき（Stripe の支払いリンクが入っているとき）
  const line = priceSummaryLine(true);
  assert.ok(line.startsWith(priceLabel()));
  assert.ok(line.includes("初期費用なし"));
  assert.ok(line.includes("いつでも自分の画面から解約"));
  // 価格の枠に書いていないこと（無料お試しなど）を足していない
  assert.ok(!line.includes("無料"));
});

test("カードの受付口が無いときは「自分の画面から解約」と書かない（できないことを書かない）", () => {
  // ★ 2026-09-19 実測：本番は支払いリンクが未設定で、解約できる「自分の画面」は存在しない。
  //   ここが崩れると、店主が自分で解約できると思い込んだまま申し込むことになる。
  const line = priceSummaryLine(false);
  assert.ok(line.startsWith(priceLabel()));
  assert.ok(line.includes("初期費用なし"));
  assert.ok(!line.includes("自分の画面"));
  assert.ok(!line.includes("ご自身の画面"));
  assert.ok(line.includes("いつでも解約"));
  // 渡し忘れたときも、正直なほうに倒れること
  assert.equal(priceSummaryLine(), priceSummaryLine(false));
});

test("解約のしかたの言い方は、カードで払えるかどうかだけで決まる", () => {
  assert.ok(cancelShortLabel(true).includes("自分の画面"));
  assert.ok(!cancelShortLabel(false).includes("画面"));
  assert.ok(cancelLongLabel(true).includes("ご自身の画面"));
  assert.ok(!cancelLongLabel(false).includes("画面"));
  assert.ok(cancelLongLabel(false).includes("最低利用期間はありません"));
  // 既定は正直なほう
  assert.equal(cancelShortLabel(), cancelShortLabel(false));
  assert.equal(cancelLongLabel(), cancelLongLabel(false));
});

test("cardCheckoutLive は、いまの価格の支払いリンクが入っているときだけ true", () => {
  assert.equal(cardCheckoutLive({} as unknown as NodeJS.ProcessEnv), false);
  // 前の値段（3,000円）のリンクが残っていても使われない
  assert.equal(
    cardCheckoutLive({ NEXT_PUBLIC_KEIRI_PAYMENT_LINK_3000: "https://buy.stripe.com/x" } as unknown as NodeJS.ProcessEnv),
    false,
  );
  assert.equal(
    cardCheckoutLive({ NEXT_PUBLIC_KEIRI_PAYMENT_LINK_15000: "https://buy.stripe.com/x" } as unknown as NodeJS.ProcessEnv),
    true,
  );
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

/**
 * 1画面目から申し込みフォームへ行けること（kp133）。
 *
 * このページはスマホ（幅390px）で画面10枚ぶんの長さがあり、2026-09-24 の実測では
 * 「申し込む」ボタンは 6,215px＝7.4枚目まで下りないと出てこなかった。
 * 8軒への1通を受け取った店主は、知り合いからの紹介として開くので、
 * 読み切る前に申し込みたい人がいる。その人を7枚ぶんスクロールさせない。
 *
 * ★ここで守るのは「一番上の枠から /keiri/apply へ行ける」ことだけ。
 *   主役は「まず触ってみる」のままで、支払いの約束は1つも足さない。
 */
test("紹介ページの一番上の枠から、申し込みフォームへ行ける（kp133）", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app", "keiri", "case", "page.tsx"),
    "utf8",
  );
  // 一番上の枠＝「まず触ってみる」のボタンがある所。その枠が閉じるまでの間に
  // /keiri/apply への行き先があることを見る。
  const heroStart = src.indexOf("読むより、触ったほうが早いと思います。");
  assert.ok(heroStart > 0, "一番上の枠（お試し版へのご案内）が見つかりません");
  const heroEnd = src.indexOf("</header>", heroStart);
  assert.ok(heroEnd > heroStart, "一番上の枠の終わりが見つかりません");
  const hero = src.slice(heroStart, heroEnd);

  assert.ok(
    hero.includes('href="/keiri/apply"'),
    "一番上の枠から申し込みフォーム（/keiri/apply）へ行けなくなっています",
  );
  assert.ok(
    hero.includes("まず触ってみる"),
    "一番上の主役は『まず触ってみる』のままにしてください",
  );
  // この画面では払わない、と書いてあること（下の申し込み枠と食い違わせない）
  assert.ok(
    hero.includes("お支払いは発生しません"),
    "近道のリンクに『この画面でお支払いは発生しません』を残してください",
  );
});
