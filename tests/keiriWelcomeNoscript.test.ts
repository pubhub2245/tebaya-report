/**
 * 初回設定（/keiri/welcome）の逃げ道を固定する（kp180）。
 *
 * この画面は「お金を払ったお店がいちばん最初に開く画面」。
 * 中身はすべて画面で動く側（JavaScript）で描いているので、
 * 最初に配られる中身は「読み込み中…」の1行しかない。
 * JavaScript が動かない端末ではその1行で終わり、連絡する先も画面に無い
 * ＝「払ったのに何も起きない」が、いちばん高くつく場面で起きる。
 *
 * ここが狂うと、最初の1件を取りこぼす。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KEIRI_APPLY_COPY_TO, keiriContactMailto } from "../lib/keiri/apply";
import { KEIRI_COMPANY } from "../lib/keiri/legal";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf-8");

const LAYOUT = "app/keiri/welcome/layout.tsx";
const PAGE = "app/keiri/welcome/page.tsx";

test("初回設定の画面には、JavaScript が動かないときの逃げ道がある", () => {
  const src = read(LAYOUT);
  assert.ok(src.includes("<noscript>"), `${LAYOUT} に <noscript> の逃げ道があること`);
  assert.ok(
    src.includes(KEIRI_COMPANY.email) || src.includes("KEIRI_COMPANY.email"),
    "逃げ道にメールの宛先が出ていること",
  );
  assert.ok(
    src.includes(KEIRI_COMPANY.tel) || src.includes("KEIRI_COMPANY.tel"),
    "逃げ道に電話番号が出ていること",
  );
});

test("逃げ道のメールは、素の宛先ではなく写し付きの下書きにする", () => {
  const src = read(LAYOUT);
  assert.ok(
    src.includes("keiriContactMailto"),
    `${LAYOUT} は下書き付きのリンクを使うこと（写しが付かないと司令室が気づけない）`,
  );
  assert.ok(
    !src.includes("`mailto:${KEIRI_COMPANY.email}`"),
    `${LAYOUT} に素の mailto が残っていないこと`,
  );

  // 実際に2か所へ届くこと（宛先＋司令室が見ている受信箱）
  const mail = keiriContactMailto({ to: KEIRI_COMPANY.email, kind: "support" });
  assert.deepEqual(mail.recipients, [KEIRI_COMPANY.email, KEIRI_APPLY_COPY_TO]);
});

test("逃げ道は外枠（layout）に置く。中の画面は画面側で描くので最初の中身に出ない", () => {
  const page = read(PAGE);
  assert.ok(
    page.trimStart().startsWith('"use client"'),
    `${PAGE} は画面側で動く作り。もしここを作り変えるなら、逃げ道の置き場所も見直すこと`,
  );
  assert.ok(
    page.includes("<Suspense"),
    `${PAGE} は読み込み中の1枚をはさむ作り＝最初に配られる中身にフォームは出ない`,
  );

  const layout = read(LAYOUT);
  assert.ok(
    !layout.includes('"use client"'),
    `${LAYOUT} は外枠のまま（画面側にすると、逃げ道が最初の中身に出なくなる）`,
  );
});

test("逃げ道は、JavaScript が動く端末の見た目を変えない", () => {
  const src = read(LAYOUT);
  const open = src.indexOf("<noscript>");
  const close = src.indexOf("</noscript>");
  assert.ok(open >= 0 && close > open, "逃げ道は <noscript> で閉じてあること");

  // 外枠が出すのは「逃げ道」と「中身」だけ。ふだん見える飾りを足さない
  const outside = src.slice(close + "</noscript>".length);
  assert.ok(outside.includes("{children}"), "外枠は中身をそのまま出すこと");
  assert.ok(
    !/<div|<p |<section/.test(outside),
    "<noscript> の外に、ふだん見える囲みを足さないこと（見た目を変えないため）",
  );
});
