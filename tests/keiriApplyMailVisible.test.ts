/**
 * お申し込みのページで「メールの道」が、いつも見える所にあるかのテスト
 * （f2-4・2026-10-27）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   電波が細くて入力欄から送れなかったとき、店主にはメールの道が1本 要ります。
 *   その道は 2026-10-25 に入れたのですが、**<noscript> の中だけ**に置いてありました。
 *   <noscript> は「JavaScript が切れている人にだけ見える札」で、
 *   ページを読み取る道具はこの中を外します。そのため外から確かめた A と B2 の
 *   2通りの読み方で「メールの下書きが1件も無い」と出て、
 *   消したのかどうか分からないまま実行が2回 使われました。
 *   店主の側でも、入力欄は出ているのに送信だけが止まる回線では <noscript> は出ません。
 *
 *   ＝ **<noscript> の外にも1本あること**を、ここで固定します。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { keiriContactMailto } from "../lib/keiri/apply";
import { KEIRI_COMPANY } from "../lib/keiri/legal";

const PAGE = readFileSync(
  path.join(process.cwd(), "app/keiri/apply/page.tsx"),
  "utf8",
);

/** <noscript> … </noscript> の中を取り除いた、いつも見える所だけ */
function alwaysVisible(source: string): string {
  return source.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
}

test("メールの道は <noscript> の外にもある（読み取る道具からも見える）", () => {
  const visible = alwaysVisible(PAGE);
  assert.notEqual(
    visible,
    PAGE,
    "<noscript> が見つかりません（このテストの前提が変わっています）",
  );
  assert.ok(
    /keiriContactMailto\(/.test(visible),
    "いつも見える所にメールの下書きのリンクがありません（f2-4）",
  );
  assert.ok(
    /kind:\s*"apply"/.test(visible),
    "いつも見える所の下書きが『お申し込み』の形になっていません（f2-4）",
  );
});

test("お申し込みの下書きは、件名と お電話の欄が入っている", () => {
  const mail = keiriContactMailto({ to: KEIRI_COMPANY.email, kind: "apply" });
  assert.ok(mail.subject.includes("お申し込み"), "件名が お申し込みになっていません");
  assert.ok(mail.body.includes("お電話"), "下書きに お電話の欄がありません");
  assert.ok(mail.url.startsWith("mailto:"), "メールの下書きの住所になっていません");
});
