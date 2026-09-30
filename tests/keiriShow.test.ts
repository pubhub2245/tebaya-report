/**
 * 「その場で見せる1枚」（/keiri/show・kp191）の決めごとを固定する。
 *
 * この1枚は **合言葉の要らない住所** で、しかも
 * **手羽屋の本物の数字を、同じ出店先に出ている同業の方に見せる**ための1枚。
 * 崩れると次のどれかが起きるので、戻り止めを置く。
 *   ・送り先のお店の呼び名や連絡先が、誰でも見られる所に出る
 *   ・日報1枚ぶんの数字や経費の明細まで出る（見せるつもりの無い手の内）
 *   ・検索結果に出てしまう
 *   ・JavaScript が動かない相手のスマホで、中身が丸ごと消える
 *   ・持ち帰りのQRが、読めないページを指す
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KEIRI_PRICE } from "../lib/keiri/caseNumbers";
import { OUTREACH_LINK } from "../lib/keiri/outreach";
// 呼び名（クレープ…）は検算からだけ読む。本番の画面に配られる側からは取り込まない（kp172）
import { OUTREACH_SHOPS } from "../lib/keiri/outreachShopLabels";
import {
  SHOW_APPLY_HREF,
  SHOW_AUDIENCE,
  SHOW_HANDOFF,
  SHOW_HEADLINE,
  SHOW_NUMBERS_LEAD,
  SHOW_PRICE_NOTE,
  SHOW_SUBLINE,
  SHOW_TAKEAWAY_URL,
} from "../lib/keiri/show";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

const page = readFileSync(new URL("../app/keiri/show/page.tsx", import.meta.url), "utf8");
const sendPage = readFileSync(new URL("../app/keiri/send/page.tsx", import.meta.url), "utf8");

test("検索には出さない（noindex）", () => {
  assert.match(page, /robots:\s*\{\s*index:\s*false/, "noindex が付いていない");
});

test("sitemap（検索エンジンに知らせる一覧）には載せない", () => {
  assert.ok(
    !KEIRI_PUBLIC_PAGES.some((p) => p.path === "/keiri/show"),
    "外向きの一覧に /keiri/show が入っている（検索と訪問の数に混ざる）",
  );
});

test("送り先のお店の呼び名は1つも出さない", () => {
  for (const shop of OUTREACH_SHOPS) {
    assert.ok(!page.includes(shop.label), `お店の呼び名が出ている：${shop.label}`);
  }
});

test("持ち帰り先はご案内ページ（/keiri/case）1本だけ・合言葉 show 付き・入力欄まで動く", () => {
  assert.ok(
    SHOW_TAKEAWAY_URL.startsWith(`${OUTREACH_LINK}?`),
    "持ち帰り先が案内ページと違う",
  );
  assert.match(
    SHOW_TAKEAWAY_URL,
    /^https:\/\/[^/]+\/keiri\/case\?from=show#apply$/,
    "持ち帰り先の形が違う（合言葉 show か、入力欄まで動く #apply が付いていない）",
  );
});

test("QRと、画面の中の押し所は『同じ所』に着く（kp203 ④）", () => {
  // ここがずれると、見せてもらった人と、QRを読み取った人が別の場所に落ちる。
  const qr = new URL(SHOW_TAKEAWAY_URL);
  const button = new URL(SHOW_APPLY_HREF, "https://example.invalid");
  assert.equal(button.pathname, qr.pathname, "押し所とQRの行き先のページが違う");
  assert.equal(button.search, qr.search, "押し所とQRの合言葉が違う");
  assert.equal(button.hash, qr.hash, "押し所とQRの着く場所（入力欄かどうか）が違う");
});

test("押し所は1タップで申し込みの入力欄に着く（kp203 ③）", () => {
  assert.match(SHOW_APPLY_HREF, /^\/keiri\/case\?from=show#apply$/, "押し所の行き先の形が違う");
  // 1画面目（表紙）と最後の画面の2か所に、同じ押し所が置かれていること
  assert.ok(page.includes("SHOW_APPLY_HREF"), "押し所が画面に置かれていない");
  assert.equal(
    (page.match(/<ApplyButton \/>/g) ?? []).length,
    2,
    "押し所は表紙と最後の画面の2か所（相手がどこで気持ちを決めても押せるように）",
  );
});

test("表紙だけで『どんなお店向けか・何が楽になるか・いくら』が分かる（kp203 ①）", () => {
  assert.ok(SHOW_AUDIENCE.length > 0, "どんなお店向けかの1行が無い");
  assert.ok(SHOW_HEADLINE.length > 0, "何が楽になるかの見出しが無い");
  assert.ok(SHOW_SUBLINE.length > 0, "誰が手を動かすかの1行が無い");
  // 表紙（1 / 4 の区画）の中に、3つとも、そして値段が入っていること
  const cover = page.slice(page.indexOf('step="1 / 4"'), page.indexOf('step="2 / 4"'));
  for (const name of ["SHOW_AUDIENCE", "SHOW_HEADLINE", "SHOW_SUBLINE", "priceLabel()"]) {
    assert.ok(cover.includes(name), `表紙に ${name} が出ていない`);
  }
});

test("立って見る字の大きさになっている（kp203 ②）", () => {
  const cover = page.slice(page.indexOf('step="1 / 4"'), page.indexOf('step="2 / 4"'));
  assert.ok(cover.includes("text-3xl"), "表紙の見出しが小さい（text-3xl より小さい）");
  // 表紙に小さい字（text-sm・text-xs）を混ぜない。小さくしてよいのは
  // 相手に読ませない注記（いちばん下のじゅん向け）と、区画の番号だけ。
  assert.ok(!/text-sm/.test(cover), "表紙に小さい字（text-sm）が混じっている");
});

test("日報の明細は読まない（合計だけ・CLAUDE.md 4-2）", () => {
  // 経費の明細・日報の生の行を取りに行く書き方が混ざっていないこと
  assert.ok(!page.includes('from("daily_reports")'), "日報を直接読んでいる");
  assert.ok(!page.includes('"expenses"'), "経費の明細を読んでいる");
  assert.ok(page.includes("getCaseStats"), "まとめた数字（getCaseStats）から出していない");
});

test("値段と金額は lib からだけ出す（画面に数字を直書きしない）", () => {
  assert.ok(page.includes("priceLabel()"), "値段を lib から出していない");
  assert.ok(
    !page.includes(String(KEIRI_PRICE.monthlyYenTaxIncluded)),
    "画面に金額が直書きされている",
  );
  assert.ok(!/15,000/.test(page), "画面に金額が直書きされている");
});

test("「初期費用なし・いつでもやめられる」と書いてよい決めごとになっている", () => {
  // 文（SHOW_PRICE_NOTE）が嘘にならないよう、値のほうを確かめる
  assert.equal(KEIRI_PRICE.setupFeeYen, 0, "初期費用が0でないのに「かかりません」と書いている");
  assert.equal(KEIRI_PRICE.cancelAnytime, true, "いつでも解約できないのに書いている");
  assert.match(SHOW_PRICE_NOTE, /初期費用/);
});

test("4画面ぶんの中身がそろっている", () => {
  assert.ok(SHOW_NUMBERS_LEAD.length > 0, "数字の画面の1行が無い");
  assert.equal(SHOW_HANDOFF.length, 3, "渡すもの・用意不要・こちらでやることの3行がそろっていない");
  for (const step of ["1 / 4", "2 / 4", "3 / 4", "4 / 4"]) {
    assert.ok(page.includes(`step="${step}"`), `${step} の画面が無い`);
  }
});

test("JavaScript が動かなくても4画面すべて読める作りになっている", () => {
  // 画面送りは CSS（scroll-snap）だけ。開く・出すを JS に頼らない
  assert.ok(!page.includes('"use client"'), "この1枚が JS 前提になっている");
  assert.ok(!page.includes("useState"), "この1枚が JS 前提になっている");
  assert.ok(page.includes("snap-y"), "画面送りが CSS になっていない");
});

test("QRは自分で組み立てる（外の絵づくりサービスに頼らない）", () => {
  assert.ok(page.includes("qrMatrix"), "QRを自分で組み立てていない");
  assert.ok(!/img\s+src=/.test(page), "外の絵を貼っている");
  assert.ok(
    !/api\.qrserver|chart\.googleapis|qrickit|quickchart/i.test(page),
    "よその絵づくりサービスに頼っている",
  );
});

test("送る1枚（/keiri/send）から、この1枚へ行ける", () => {
  assert.ok(sendPage.includes('href="/keiri/show"'), "送る1枚に入口が無い");
});
