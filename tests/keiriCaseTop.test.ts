/**
 * 紙から来た人だけ、申し込みの欄をいちばん上に出す（kp209・2026-10-01）。
 *
 * ■ ここで守ること
 *   1. 並べ替わるのは **紙（card）から来た回だけ**。
 *      合言葉なし・app・show・trial・gh の見え方は1文字も変わらない。
 *   2. いちばん上に出す言葉は **紙に刷ってある文そのもの**。
 *      画面に直書きすると、紙を直したときに片方だけ古くなる。
 *   3. 入力欄は1ページに **1つだけ**（名札（id）が1組しか無いため、
 *      2つ出すと押し間違いが起きる）。
 *   4. 値段・解約の条件・特定商取引法のページは1文字も変えない（並び順だけの変更）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { CASE_APPLY_FIRST_KEYS, CASE_CARD_TOP, showsApplyFirst } from "../lib/keiri/caseTop";
import { CARD_AUDIENCE, CARD_FROM_KEY, CARD_SUBLINE } from "../lib/keiri/card";
import { SHOW_FROM_KEY } from "../lib/keiri/show";
import { TRIAL_FROM_KEY } from "../lib/keiri/trial";
import { APP_FROM_KEY } from "../lib/keiri/appLink";
import { README_FROM_KEY } from "../lib/keiri/readmeLink";

const PAGE = fs.readFileSync(
  path.join(process.cwd(), "app/keiri/case/page.tsx"),
  "utf8",
);

test("紙（card）から来た回だけ、申し込みの欄を先に出す", () => {
  assert.equal(showsApplyFirst(CARD_FROM_KEY), true);
  assert.deepEqual([...CASE_APPLY_FIRST_KEYS], [CARD_FROM_KEY]);
});

test("ほかの入口と、合言葉なしの回は今までどおり（並べ替えない）", () => {
  for (const key of [SHOW_FROM_KEY, TRIAL_FROM_KEY, APP_FROM_KEY, README_FROM_KEY]) {
    assert.equal(showsApplyFirst(key), false, `${key} まで並べ替わっている`);
  }
  for (const raw of [undefined, null, "", "   ", "CARD", "cards", "card2", 1, {}, []]) {
    assert.equal(showsApplyFirst(raw), false, `${JSON.stringify(raw)} で並べ替わっている`);
  }
});

test("古い記録に混じった形（末尾に余計な1文字・前後の空白）でも紙として扱う", () => {
  // 訪問を数えるときと同じ掃除を通す（kp195）。数え方と見え方がずれない。
  assert.equal(showsApplyFirst("`card`"), true);
  assert.equal(showsApplyFirst(" card "), true);
  assert.equal(showsApplyFirst(['card', 'show']), true);
});

test("いちばん上に出す2行は、紙に刷ってある文そのもの", () => {
  assert.equal(CASE_CARD_TOP.audience, CARD_AUDIENCE);
  assert.equal(CASE_CARD_TOP.subline, CARD_SUBLINE);
});

test("ご案内ページに、紙の文を直書きしていない（出どころは card.ts だけ）", () => {
  assert.ok(
    !PAGE.includes(CARD_AUDIENCE),
    "ご案内ページに紙の1行を直書きしている（lib/keiri/caseTop.ts 経由で出すこと）",
  );
  assert.ok(
    !PAGE.includes(CARD_SUBLINE),
    "ご案内ページに紙の1行を直書きしている（lib/keiri/caseTop.ts 経由で出すこと）",
  );
  assert.ok(PAGE.includes("CASE_CARD_TOP"), "紙の文を caseTop.ts から引いていない");
});

test("合言葉の判定をご案内ページに直書きしていない", () => {
  assert.ok(PAGE.includes("showsApplyFirst"), "判定を1か所から呼んでいない");
  assert.ok(
    !/from\s*===\s*["'`]card/.test(PAGE),
    "ご案内ページで合言葉を直に比べている（caseTop.ts に寄せること）",
  );
});

test("申し込みの入力欄は、どちらの回も1つだけ出す", () => {
  // 名札（id="apply"）が2つ出ると、欄の名札が二重になって押し間違いが起きる。
  assert.equal(
    (PAGE.match(/id="apply"/g) ?? []).length,
    1,
    "申し込みの区画が2か所に書かれている",
  );
  // 上に出す回と、下に出す回は**排他**（両方に出さない）
  assert.ok(PAGE.includes("{applyFirst && applySection}"), "紙から来た回に上へ出していない");
  assert.ok(PAGE.includes("{!applyFirst && applySection}"), "ふだんの回に下へ出していない");
  assert.equal((PAGE.match(/applySection}/g) ?? []).length, 2, "申し込みの区画の出し方が増えている");
});

test("値段と解約の言い方は、並べ替えでも1か所からしか出さない", () => {
  // 値段の1行は、並べ替えても関数から出す（画面に金額を打ち直さない）。
  // 紙から来た回と、ふだんの回で置き場所が違うので、呼ぶ所は2つある。
  // どちらか一方しか動かない（applyFirst ? ... : ...）ので、画面に出るのは1回だけ。
  assert.equal(
    (PAGE.match(/priceSummaryLine\(cardLive\)/g) ?? []).length,
    2,
    "値段の1行の出し方が変わっている（関数から出すこと）",
  );
  assert.ok(
    PAGE.includes("{applyFirst ? ("),
    "紙から来た回とふだんの回が、どちらか一方だけになっていない",
  );
  assert.ok(PAGE.includes("cancelLongLabel(cardLive)"), "解約の言い方を関数から出していない");
});
