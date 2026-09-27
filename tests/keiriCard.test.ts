/**
 * 出店の日に置く紙1枚（/keiri/card・kp193）の決めごとを固定する。
 *
 * この紙は **置いたら誰の手にも渡る** ものなので、崩れると次のどれかが起きる。
 *   ・手羽屋の売上・出店先・スタッフの名前が、知らない人の手元に紙で残る
 *   ・QRが読めないページを指して、その場が終わる
 *   ・「紙から来た人」と「それ以外」を数え分けられず、効いたか分からなくなる
 *   ・A4に4枚ちょうど並ばず、切れない・刷れない紙になる
 *   ・検索結果に印刷用の紙が出てしまう
 *
 * 読み戻し（作ったQRがちょうど元の住所に戻るか）は tests/keiriQr.test.ts の①で見る。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KEIRI_PRICE } from "../lib/keiri/caseNumbers";
import { KEIRI_COMPANY } from "../lib/keiri/legal";
import { OUTREACH_LINK } from "../lib/keiri/outreach";
// 送り先の呼び名（クレープ…）は検算からだけ読む。配られる側からは取り込まない（kp172）
import { OUTREACH_SHOPS } from "../lib/keiri/outreachShopLabels";
import {
  CARD_FROM_KEY,
  CARD_HEADLINE,
  CARD_SIGNER,
  CARD_SUBLINE,
  CARD_TAKEAWAY_URL,
} from "../lib/keiri/card";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

const page = readFileSync(new URL("../app/keiri/card/page.tsx", import.meta.url), "utf8");
const beacon = readFileSync(new URL("../components/VisitBeacon.tsx", import.meta.url), "utf8");
const sendPage = readFileSync(new URL("../app/keiri/send/page.tsx", import.meta.url), "utf8");

test("検索には出さない（noindex）", () => {
  assert.match(page, /robots:\s*\{\s*index:\s*false/, "noindex が付いていない");
});

test("sitemap（検索エンジンに知らせる一覧）には載せない", () => {
  assert.ok(
    !KEIRI_PUBLIC_PAGES.some((p) => p.path === "/keiri/card"),
    "外向きの一覧に /keiri/card が入っている（検索と訪問の数に混ざる）",
  );
});

test("QRの行き先はご案内ページ1本＋合言葉（from=card）だけ", () => {
  assert.equal(
    CARD_TAKEAWAY_URL,
    `${OUTREACH_LINK}?from=${CARD_FROM_KEY}`,
    "行き先の組み立て方が変わっている",
  );
  assert.match(
    CARD_TAKEAWAY_URL,
    /^https:\/\/[^/?]+\/keiri\/case\?from=card$/,
    "行き先の形が違う（読めないページを指すおそれ）",
  );
});

test("紙から来た訪問を数え分けられる（合言葉 from を受け取る作りになっている）", () => {
  assert.ok(
    beacon.includes('params.get("from")'),
    "訪問を数える部品が from を見ていない（紙から来た人を数え分けられない）",
  );
  assert.ok(
    beacon.includes('params.get("utm_campaign")'),
    "今までの utm_campaign を見なくなっている（前からの数え方が壊れる）",
  );
});

test("手羽屋の中身（売上・出店先・スタッフ名）は1文字も紙に載せない", () => {
  const forbidden = [
    "getCaseStats", // 日報から出す数字そのもの
    "getCaseUsage",
    "salesMan",
    "daily_reports",
    "locations",
    "イデ",
    "かずき",
    "なぎさ",
    "ながやま",
    "PASIO",
  ];
  for (const word of forbidden) {
    assert.ok(!page.includes(word), `紙に載ってはいけないものが入っている：${word}`);
  }
});

test("送り先のお店の呼び名は1つも出さない", () => {
  for (const shop of OUTREACH_SHOPS) {
    assert.ok(!page.includes(shop.label), `お店の呼び名が出ている：${shop.label}`);
  }
});

test("値段は lib からだけ出す（紙に金額を直書きしない）", () => {
  assert.ok(page.includes("priceSummaryLine("), "値段を lib から出していない");
  assert.ok(
    !page.includes(String(KEIRI_PRICE.monthlyYenTaxIncluded)),
    "画面に金額が直書きされている",
  );
  assert.ok(!/15,000/.test(page), "画面に金額が直書きされている");
});

test("差し出し主の名前と連絡先が、紙に必ず載る", () => {
  assert.match(CARD_SIGNER.name, /川畑/, "本人の名前が入っていない");
  assert.equal(CARD_SIGNER.tel, KEIRI_COMPANY.tel, "電話番号が会社の控えと違う");
  assert.equal(CARD_SIGNER.email, KEIRI_COMPANY.email, "メールが会社の控えと違う");
  assert.ok(page.includes("CARD_SIGNER.tel"), "紙に連絡先を出していない");
});

test("載せるのは5つだけ（言葉は lib から。紙に文章を直書きしない）", () => {
  for (const key of ["CARD_HEADLINE", "CARD_SUBLINE", "CARD_QR_LEAD", "CARD_TAKEAWAY_URL"]) {
    assert.ok(page.includes(key), `${key} を lib から出していない`);
  }
  // 数えられない言い切りを紙に書かない
  for (const word of ["最強", "必ず儲かる", "すぐ増え", "分で終わ"]) {
    assert.ok(
      !CARD_HEADLINE.includes(word) && !CARD_SUBLINE.includes(word),
      `数えられない言い切りが入っている：${word}`,
    );
  }
});

test("A4（210×297mm）に A6 が2列×2段でちょうど並び、切る線が入っている", () => {
  assert.ok(page.includes("width: 210mm"), "紙の横幅がA4でない");
  assert.ok(page.includes("grid-template-columns: 105mm 105mm"), "横に2枚並んでいない");
  assert.ok(page.includes("grid-template-rows: 148.5mm 148.5mm"), "縦に2枚並んでいない");
  assert.ok(page.includes("@page { size: A4; margin: 0; }"), "印刷の用紙がA4に決まっていない");
  assert.match(page, /border-right:\s*0\.2mm dashed/, "切る所の線が入っていない");
  // 札は4枚ちょうど
  const cards = page.match(/<Card qrPath=\{qrPath\} qrSpan=\{qrSpan\} \/>/g) ?? [];
  assert.equal(cards.length, 4, `A4に並ぶ札が4枚でない（${cards.length}枚）`);
});

test("JavaScript が動かなくても紙の中身は全部出る（折りたたみも画面送りも使わない）", () => {
  assert.ok(!page.includes('"use client"'), "画面側で組み立てる作りになっている");
  assert.ok(!page.includes("<details"), "折りたたみで中身が隠れている");
  assert.ok(!page.includes("useState"), "画面側の状態で中身が出たり消えたりする");
});

test("QRは自分で組み立てる（外の絵づくりサービスに頼まない）", () => {
  assert.ok(page.includes("qrMatrix("), "QRを自分で組み立てていない");
  assert.ok(!/api\.qrserver|chart\.googleapis|qrcode\.show/.test(page), "外のQR作成先を呼んでいる");
});

test("じゅんが探さずに見つけられる（送る1枚から1本だけ入口がある）", () => {
  assert.ok(
    sendPage.includes('href="/keiri/card"'),
    "じゅんが毎回開く1枚（/keiri/send）から、印刷用の紙へ行けない",
  );
});
