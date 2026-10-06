/**
 * 「開いた瞬間に、どちらで渡すかを1タップで選ぶ」（2026-10-02・kp216）の決めごとを固定する。
 *
 * ■ なぜ固定するか
 *   10/7（水）の出店説明会は、立ち話の数十秒で決まります。
 *   ここが1タップから2タップ・3タップに戻ると、そのまま話題が流れて終わります。
 *   また、相手に見せる4画面の値段・約束・特商法の言い方が
 *   うっかり変わってしまうと、言っていることと請求が食い違います。
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  ONSITE_FROM_KEY,
  ONSITE_OPEN_LABEL,
  SHOW_APP_TITLE,
  SHOW_COVER_ANCHOR,
  SHOW_HOME_HINT,
  SHOW_ONSITE_PAGE_HREF,
  SHOW_START_MISERU_HREF,
  SHOW_START_MISERU_LABEL,
  SHOW_START_TITLE,
} from "../lib/keiri/show";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

const page = readFileSync(new URL("../app/keiri/show/page.tsx", import.meta.url), "utf8");
const toroku = readFileSync(
  new URL("../app/keiri/show/toroku/page.tsx", import.meta.url),
  "utf8",
);
const form = readFileSync(
  new URL("../app/keiri/show/OnsiteApplyForm.tsx", import.meta.url),
  "utf8",
);

/** 説明文（コメント）を外した、動く部分だけ（tests/keiriShowOnsite.test.ts と同じ考え方） */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const formCode = codeOnly(form);
const torokuCode = codeOnly(toroku);

test("開いた1画面目に、2つの道の押し所がそろっている", () => {
  assert.ok(page.includes("SHOW_START_MISERU_HREF"), "［相手に見せる］が無い");
  assert.ok(page.includes("SHOW_ONSITE_PAGE_HREF"), "［この場で代わりに登録する］が無い");
  // 帯は相手に見せる4画面の「前」。ここが後ろに回ると、開いた瞬間には出ない
  assert.ok(
    page.indexOf("SHOW_START_TITLE") < page.indexOf('step="1 / 4"'),
    "選ぶ帯が表紙より後ろに来ている（開いた瞬間に出ない）",
  );
  assert.ok(SHOW_START_TITLE.length > 0, "選ぶ帯の見出しが無い");
  assert.ok(SHOW_START_MISERU_LABEL.length > 0, "［相手に見せる］の文が無い");
});

test("［相手に見せる］は同じ1枚の表紙へ動くだけ（通信をやり直さない）", () => {
  assert.equal(SHOW_START_MISERU_HREF, `#${SHOW_COVER_ANCHOR}`, "行き先が同じ1枚の中ではない");
  assert.ok(
    page.includes("<Screen step=\"1 / 4\" id={SHOW_COVER_ANCHOR}>"),
    "表紙に目印が付いていない（押しても動かない）",
  );
});

test("［この場で代わりに登録する］は、欄が開いた状態で着く（もう1回 開かせない）", () => {
  assert.equal(SHOW_ONSITE_PAGE_HREF, "/keiri/show/toroku", "行き先が違う");
  assert.ok(toroku.includes("<OnsiteApplyForm defaultOpen />"), "欄が開いた状態になっていない");
  assert.match(form, /<details open=\{defaultOpen\}/, "開いた状態で呼べる作りになっていない");
  // 見せる1枚のいちばん下は、今までどおり閉じたまま
  assert.ok(page.includes("<OnsiteApplyForm />"), "見せる1枚の欄の呼び方が変わっている");
});

test("ホーム画面に置く手順が1行ある（1タップで開けるようにするため）", () => {
  assert.ok(page.includes("SHOW_HOME_HINT"), "ホーム画面に置く手順が画面に無い");
  assert.ok(SHOW_HOME_HINT.includes("ホーム画面に追加"), "手順の中身が足りない");
  assert.ok(SHOW_APP_TITLE.length <= 8, "ホーム画面の名前が長すぎる（途中で切れる）");
});

test("足した1枚も、検索には出さない", () => {
  assert.match(toroku, /robots:\s*\{\s*index:\s*false/, "noindex が付いていない");
  assert.ok(
    !KEIRI_PUBLIC_PAGES.some((p) => p.path === SHOW_ONSITE_PAGE_HREF),
    "外向きの一覧に入っている（検索と訪問の数に混ざる）",
  );
});

test("値段・約束・合言葉は、この直しで1文字も変わっていない", () => {
  // 足した1枚に金額・解約の言い換えを書かない
  assert.ok(
    !/15,000|15000|解約|やめられ/.test(torokuCode),
    "足した1枚で値段・解約を言い換えている",
  );
  // 申し込みの送り先と合言葉は、もとの欄の1本だけ
  assert.equal((formCode.match(/\/api\/keiri\/apply/g) ?? []).length, 1, "送り先が増えている");
  assert.equal(ONSITE_FROM_KEY, "onsite", "合言葉が変わっている");
  // 足した1枚は倉庫を1行も読まない（電波が細い会場でも出る）
  assert.ok(!/getCaseStats|supabase/i.test(torokuCode), "足した1枚が倉庫を読んでいる");
});

test("文章は lib/keiri/show.ts からだけ出す（画面に直書きしない）", () => {
  for (const label of [ONSITE_OPEN_LABEL, SHOW_START_MISERU_LABEL, SHOW_START_TITLE]) {
    assert.ok(!page.includes(`>${label}<`), `選ぶ帯に文章が直書きされている：${label}`);
    assert.ok(!toroku.includes(`>${label}<`), `足した1枚に文章が直書きされている：${label}`);
  }
});

test("この1枚は、JavaScript が動かなくても両方の道が開く（ただのリンク）", () => {
  assert.ok(!page.includes('"use client"'), "見せる1枚が JS 前提になった");
  assert.ok(!toroku.includes('"use client"'), "足した1枚が JS 前提になった");
  assert.ok(!/onClick/.test(codeOnly(page)), "押し所が JS 頼みになっている");
});
