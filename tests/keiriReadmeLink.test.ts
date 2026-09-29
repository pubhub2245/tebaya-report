/**
 * 倉庫の表紙（README.md）が、ご案内ページへ渡る道になっていることを見張る（kp202・2026-09-29）。
 *
 * ■ なぜ要るか
 *   2026-09-29 18:41 に `site:tebaya-report.vercel.app` で検索したところ、
 *   **本番サイトのページは1件も出ず、出てきたのは倉庫（GitHub）のページばかり**でした。
 *   ＝Google はもう倉庫には来ています。そこから本番へ渡る1本が、
 *   いま外から指している唯一の入口なので、黙って壊れないように見張ります。
 *
 * ■ 何を確かめるか
 *   1. 表紙の中身が、唯一の正（lib/keiri/readmeLink.ts）と1文字も違わないこと
 *   2. 表紙に書いた住所に、余計な文字（記号 ` ・空白・引用符）が混じっていないこと
 *   3. 金額が表紙に直書きされていないこと（値段の出どころは caseNumbers.ts の1本だけ）
 *   4. 送り先のお店の呼び名・こちらの連絡先が表紙に出ていないこと（kp172 と同じ約束）
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  README_CASE_URL,
  README_FROM_KEY,
  README_SECTION_HEADING,
  readmeSection,
} from "../lib/keiri/readmeLink";
import { KEIRI_PRICE, priceLabel } from "../lib/keiri/caseNumbers";
import { OUTREACH_SHOP_LABELS } from "../lib/keiri/outreachShopLabels";
import { cleanCampaign } from "../lib/siteVisits";

const readme = readFileSync("README.md", "utf8");

test("表紙に、経理パッケージの区画がそのまま入っている", () => {
  assert.ok(
    readme.includes(`## ${README_SECTION_HEADING}`),
    "表紙に経理パッケージの見出しが無い",
  );
  assert.ok(
    readme.includes(readmeSection()),
    "表紙の中身が lib/keiri/readmeLink.ts と食い違っている（片方だけ直すと古いほうが外に出る）",
  );
});

test("表紙に書いた住所に、余計な文字が混じっていない", () => {
  // 住所のうしろに1文字でもくっ付いていたら拾えるよう、空白までを丸ごと取る
  const found = readme.match(/https:\/\/\S*\/keiri\/case\S*/g) ?? [];
  assert.ok(found.length >= 1, "表紙にご案内ページの住所が1本も無い");
  for (const href of found) {
    assert.equal(href, README_CASE_URL, `表紙の住所が決めごとと違う：${href}`);
    assert.ok(!href.includes("`"), `表紙の住所に記号 \` が入っている：${href}`);
  }
  // 受け取る側の掃除を通しても、合言葉が1文字も変わらない＝そのまま数え分けられる
  const written = new URL(README_CASE_URL).searchParams.get("from");
  assert.equal(written, README_FROM_KEY);
  assert.equal(cleanCampaign(written), README_FROM_KEY);
});

test("表紙に金額を直書きしていない（値段の出どころは1本だけ）", () => {
  const yen = KEIRI_PRICE.monthlyYenTaxIncluded.toLocaleString("ja-JP");
  // 表紙に出てよい金額の書き方は、caseNumbers.ts が作る1行だけ
  const occurrences = readme.split(yen).length - 1;
  assert.equal(
    occurrences,
    1,
    `表紙に金額が ${occurrences} か所ある。値段は priceLabel() の1行だけにする`,
  );
  assert.ok(readme.includes(priceLabel()), "表紙の料金の行が priceLabel() と違う");
});

test("表紙に、送り先のお店の呼び名と連絡先を書いていない", () => {
  for (const label of Object.values(OUTREACH_SHOP_LABELS)) {
    assert.ok(!readme.includes(label), `表紙に送り先の呼び名が出ている：${label}`);
  }
  const section = readmeSection();
  assert.ok(!/@/.test(section), "表紙の区画にメールアドレスらしき文字が入っている");
  assert.ok(!/\d{2,4}-\d{2,4}-\d{3,4}/.test(section), "表紙の区画に電話番号らしき文字が入っている");
});
