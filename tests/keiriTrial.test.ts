/**
 * お試し版（/keiri/demo）から「このまま申し込む」への道を固定する（kp199）。
 *
 * ここが崩れると、次のどれかが静かに起きる。
 *   ・いちばん興味を持った人（お試しを触っている人）が、
 *     申し込みに戻れないまま画面を閉じる
 *   ・押したのに「読むところ」に着いて、入力欄まで自分で探すことになる
 *   ・お試しから来た申し込みを、あとから数え分けられなくなる（効いたか分からない）
 *   ・お試しの画面に金額が直書きされ、値段を変えたときに食い違う
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TRIAL_APPLY_HREF,
  TRIAL_CTA_LABEL,
  TRIAL_CTA_NOTE,
  TRIAL_FROM_KEY,
} from "../lib/keiri/trial";

const page = readFileSync("app/keiri/demo/page.tsx", "utf8");
const board = readFileSync("app/keiri/demo/board.tsx", "utf8");

test("①行き先は、ご案内ページの入力欄そのもの（読むところではない）", () => {
  assert.equal(TRIAL_APPLY_HREF, `/keiri/case?from=${TRIAL_FROM_KEY}#apply`);
  // 入力欄まで動く印（#apply）が必ず付いている
  assert.ok(TRIAL_APPLY_HREF.endsWith("#apply"));
  // 同じサイトの中なので、住所は相対のまま（http… を書かない）
  assert.ok(TRIAL_APPLY_HREF.startsWith("/keiri/case?"));
});

test("②お試しから来た人を数え分けられる合言葉が付いている", () => {
  assert.equal(TRIAL_FROM_KEY, "trial");
  assert.ok(TRIAL_APPLY_HREF.includes(`from=${TRIAL_FROM_KEY}`));
  // 紙（card）と混ざらないこと
  assert.notEqual(TRIAL_FROM_KEY, "card");
});

test("③お試しの画面から、別の画面（/keiri/apply）へ移す押し所は1つも無い", () => {
  // 「ほかのページ」の並び（KeiriRelated）は案内なので対象外。
  // ここで見るのは、画面に直接書かれた行き先だけ。
  assert.equal(page.includes('href="/keiri/apply"'), false);
  assert.equal(board.includes('href="/keiri/apply"'), false);
});

test("④押し所は、上・書き出した直後・いちばん下・貼り付く帯の4か所ある", () => {
  const inPage = page.split("TRIAL_APPLY_HREF").length - 1;
  const inBoard = board.split("TRIAL_APPLY_HREF").length - 1;
  // page: 取り込み1 ＋ 上の1本 ＋ 貼り付く帯の1本
  assert.ok(inPage >= 3, `お試しの1枚に押し所が足りません（${inPage}）`);
  // board: 取り込み1 ＋ 書き出した直後の1本 ＋ いちばん下の1本
  assert.ok(inBoard >= 3, `お試しの中身に押し所が足りません（${inBoard}）`);
});

test("⑤お金の話はその場で作らない（金額を画面に直書きしない）", () => {
  assert.equal(TRIAL_CTA_LABEL.includes("15,000"), false);
  assert.equal(TRIAL_CTA_NOTE.includes("15,000"), false);
  // 値段は caseNumbers.ts が出す1行をそのまま使う
  assert.ok(page.includes("priceSummaryLine"));
  // 画面に出る所だけを見る（説明書きのコメントは読み手には見えないので外す）
  const visible = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/15,?000/.test(visible(page)), false);
  assert.equal(/15,?000/.test(visible(board)), false);
});

test("⑥『この画面でお支払いは発生しません』は消さない", () => {
  assert.ok(TRIAL_CTA_NOTE.includes("お支払いは発生しません"));
  assert.ok(page.includes("TRIAL_CTA_NOTE"));
});

test("⑦貼り付く帯が本文を隠さないよう、下に余白を取ってある", () => {
  assert.ok(page.includes("pb-32"), "貼り付く帯のぶんの余白（pb-32）がありません");
  assert.ok(page.includes("fixed inset-x-0 bottom-0"), "貼り付く帯がありません");
});
