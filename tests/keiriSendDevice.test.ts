/**
 * 「送る1枚」の端末の見分け（kp169）を固定する。
 *
 * LINE の「送り先を選ぶ画面」を開くリンクは **スマホの LINE 専用のしかけ**で、
 * パソコン版の LINE は対応していない。＝ パソコンで押しても送る画面は開かない。
 * だからパソコンでは［送る文をコピーする］を主役にする。
 * ここを取り違えると「押しても送れない」が戻ってくるので、戻り止めを置く。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isPhoneLike } from "../lib/keiri/sendDevice";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  mac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  ipadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
};

test("スマホは［LINEで送る］が主役のまま", () => {
  assert.equal(isPhoneLike({ userAgent: UA.iphone, pointerCoarse: true }), true);
  assert.equal(isPhoneLike({ userAgent: UA.android, pointerCoarse: true }), true);
});

test("パソコンは［コピー］が主役になる", () => {
  assert.equal(isPhoneLike({ userAgent: UA.windows, pointerCoarse: false }), false);
  assert.equal(isPhoneLike({ userAgent: UA.mac, pointerCoarse: false }), false);
});

test("iPad の Safari（Mac と名乗る）は、触れる画面かどうかで拾う", () => {
  assert.equal(isPhoneLike({ userAgent: UA.ipadSafari, pointerCoarse: true }), true);
  assert.equal(isPhoneLike({ userAgent: UA.ipadSafari, pointerCoarse: false }), false);
});

test("何も分からないときは、道が消えないスマホ扱いに倒す", () => {
  assert.equal(isPhoneLike({}), true);
  assert.equal(isPhoneLike({ userAgent: null, pointerCoarse: null }), true);
});

/** 押すところの作り（両方のボタンを必ず出す）を固定する */
const actions = readFileSync(
  new URL("../app/keiri/send/SendActions.tsx", import.meta.url),
  "utf8",
);

test("どちらの端末でも、LINEのボタンとコピーのボタンが両方出ている", () => {
  assert.ok(actions.includes("{phone ? lineButton : copyButton}"), "主役を先に出すこと");
  assert.ok(actions.includes("{phone ? copyButton : lineButton}"), "もう一方も消さないこと");
  assert.ok(actions.includes("送る文をコピーする"), "コピーのボタンがあること");
  assert.ok(actions.includes("LINEで送る"), "LINEのボタンを残していること");
});

test("勝手に送らない（コピーと、送り先を選ぶ画面までしか作らない）", () => {
  assert.ok(!actions.includes("fetch("), "この部品は外へ何も送らないこと");
  assert.ok(!actions.includes("supabase"), "倉庫を1行も読まないこと");
  assert.ok(!/[0-9０-９][0-9０-９,，]*\s*円/.test(actions), "値段を書かないこと");
});

test("パソコンのときは、コピーしたあとの手順が1行出る", () => {
  assert.ok(
    actions.includes("パソコンのLINEでお店のトークを開いて"),
    "貼って送るところまで書いてあること",
  );
});
