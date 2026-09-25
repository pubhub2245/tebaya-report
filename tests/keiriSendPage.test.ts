/**
 * 「送る1枚」（/keiri/send・kp162）の決めごとを固定する。
 *
 * この1枚は **合言葉も端末の印も要らない住所** なので、崩れると
 *   ・送り先8軒（同じ出店先の同業）の呼び名や連絡先が、誰でも見られる所に出る
 *   ・受け取る同業に値段が先に見える
 *   ・検索結果に出てしまう
 * のどれかが起きる。どれも取り返しがつかないので、戻り止めを置く。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OUTREACH_LINE_SHARE_URL,
  OUTREACH_LINK,
  OUTREACH_MESSAGE,
  OUTREACH_REPLY_HOLD,
  OUTREACH_REPLY_STEPS,
  OUTREACH_REPLY_WARNING,
  OUTREACH_SEND_LINK,
  OUTREACH_SEND_PATH,
  OUTREACH_SHOPS,
} from "../lib/keiri/outreach";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

const page = readFileSync(
  new URL("../app/keiri/send/page.tsx", import.meta.url),
  "utf8",
);

test("住所は1本（/keiri/send）で、絶対URLもそこを指す", () => {
  assert.equal(OUTREACH_SEND_PATH, "/keiri/send");
  assert.ok(
    OUTREACH_SEND_LINK.endsWith(OUTREACH_SEND_PATH),
    "渡す住所の最後が /keiri/send であること",
  );
  assert.ok(
    OUTREACH_SEND_LINK.startsWith("https://"),
    "そのまま貼れる絶対URLであること",
  );
});

test("この1枚の主役は［LINEで送る］の1タップ", () => {
  assert.ok(
    page.includes("OUTREACH_LINE_SHARE_URL"),
    "LINEの送り先を選ぶ画面へのリンクを、共通の定数から出していること",
  );
  assert.ok(
    OUTREACH_LINE_SHARE_URL.startsWith("https://line.me/R/share?text="),
    "勝手に送らず、送り先を選ぶ画面までしか開かないリンクであること",
  );
  assert.ok(page.includes("OUTREACH_MESSAGE"), "送る文を画面に出していること");
});

/**
 * 端末に合わせて主役を入れ替える（kp169）。
 * LINE の送り先を選ぶリンクはスマホ専用のしかけで、パソコンでは何も起きない。
 * ＝ ボタンが1つだけの形に戻すと、パソコンで開いた日は送れないままになる。
 */
test("押すところは、端末に合わせて主役が入れ替わる部品にしている", () => {
  assert.ok(page.includes("<SendActions"), "押すところを SendActions に任せていること");
  assert.ok(
    page.includes("shareUrl={OUTREACH_LINE_SHARE_URL}"),
    "LINEのリンクは共通の定数から渡すこと",
  );
  assert.ok(
    page.includes("message={OUTREACH_MESSAGE_SHARE}"),
    "コピーする文は宛名の空欄が入っていない方（貼ってすぐ送れる方）を渡すこと",
  );
});

test("送り先の呼び名・連絡先・値段を1つも出さない", () => {
  for (const shop of OUTREACH_SHOPS) {
    assert.ok(
      !page.includes(shop.label),
      `送り先の呼び名（${shop.label}）を、合言葉の要らない1枚に出さないこと`,
    );
  }
  // 画面に書いた文だけを見る（import の "@/lib/..." は連絡先ではない）
  const body = page
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("import") && !line.includes('"@/'))
    .join("\n");
  assert.ok(
    !/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(body),
    "メールアドレスを出さないこと",
  );
  assert.ok(!/LINE ?ID|ライン ?ID/i.test(body), "LINEのIDを出さないこと");
  assert.ok(!page.includes("15,000"), "受け取る同業に値段が先に見えないこと");
  assert.ok(!OUTREACH_MESSAGE.includes("15,000"), "送る文にも値段を書かないこと");
});

test("検索には出さない（noindex を付けたまま・sitemap にも載せない）", () => {
  assert.ok(page.includes("robots:"), "noindex の指定を消していないこと");
  assert.ok(page.includes("index: false"), "検索結果に出さないこと");
  assert.ok(
    !KEIRI_PUBLIC_PAGES.some((p) => p.path === OUTREACH_SEND_PATH),
    "外向きページの一覧（sitemap と robots の元）に入れないこと",
  );
});

test("相手が開く案内ページを、この1枚から確かめられる", () => {
  assert.ok(page.includes('href="/keiri/case"'), "案内ページへの出口があること");
  assert.ok(OUTREACH_LINK.endsWith("/keiri/case"), "送る文のリンクも案内ページであること");
});

test("倉庫（日報・売上）を1行も読まない", () => {
  assert.ok(!page.includes("supabase"), "この1枚はデータを読み書きしないこと");
  assert.ok(!page.includes('.from("'), "棚を開かないこと");
});

/**
 * 返事が来たあとの決めごと（kp167）。
 *
 * この1枚から送ると、返事は じゅんの LINE に直接返ってくる。そのとき
 * 手元にある支払いのリンクは**古い値段のもの**しかないので、貼られると
 * いまの値段ではない額で毎月の引き落としが決まってしまう（司令室 kp107 待ち）。
 * ＝ 最初の1件でいちばん高くつく間違い。ここを戻り止めで固定する。
 */
test("返事が来たときにやること2つが、この1枚に出ている", () => {
  assert.equal(OUTREACH_REPLY_STEPS.length, 2, "やることを3つに増やさないこと");
  assert.ok(
    page.includes("OUTREACH_REPLY_STEPS.map("),
    "やること2つを、共通の定数から画面に並べていること",
  );
  assert.ok(
    OUTREACH_REPLY_STEPS[0].includes(OUTREACH_REPLY_HOLD),
    "1つ目は『ありがとうございます、折り返します。』とだけ返すこと",
  );
  assert.ok(
    OUTREACH_REPLY_STEPS[1].includes("チャットに貼"),
    "2つ目は返事の文をそのままチャットに貼ること",
  );
});

test("『お支払いのリンクを自分で貼らない』を消さない", () => {
  assert.ok(
    page.includes("{OUTREACH_REPLY_WARNING}"),
    "やってはいけないことを、この1枚の画面に出していること（import だけでは足りない）",
  );
  assert.ok(
    OUTREACH_REPLY_WARNING.includes("お支払いのリンクを貼らないでください"),
    "自分では貼らない、と書いてあること",
  );
});

test("返事の決めごとにも、値段を1つも書かない", () => {
  for (const text of [...OUTREACH_REPLY_STEPS, OUTREACH_REPLY_WARNING, OUTREACH_REPLY_HOLD]) {
    assert.ok(
      !/[0-9０-９][0-9０-９,，]*\s*円/.test(text),
      `返事の決めごとに金額を書かないこと（${text}）`,
    );
  }
});
