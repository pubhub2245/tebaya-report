import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  keiriLoginNoScriptHtml,
  keiriNoScriptHtml,
} from "../lib/keiri/noscriptFallback";
import { KEIRI_COMPANY } from "../lib/keiri/legal";

/**
 * JavaScript が動かない端末への逃げ道を固定するテスト（2026-09-26・B）。
 *
 * お金を払ったお店が毎日開く画面（/keiri）で、JavaScript が動かないときに
 * 「題名だけのページ」で終わらせないための決まりを、あとから消されないように留めておく。
 */

test("逃げ道には、連絡先（メールと電話）が必ず入っている", () => {
  const html = keiriLoginNoScriptHtml();
  assert.ok(html.includes(KEIRI_COMPANY.email), "メールアドレスが入っていること");
  assert.ok(html.includes(KEIRI_COMPANY.tel), "電話番号が入っていること");
  assert.ok(html.includes("mailto:"), "メールの下書きが開くようにすること");
  assert.ok(html.includes('href="tel:'), "電話がかけられるようにすること");
});

test("逃げ道に、合言葉・鍵のような秘密の言葉を入れない", () => {
  const html = keiriLoginNoScriptHtml();
  for (const word of [
    "SUPABASE",
    "SERVICE_ROLE",
    "ACCESS_TOKEN",
    "CHANNEL_SECRET",
    "process.env",
    "NEXT_PUBLIC_ADMIN_PASSWORD",
  ]) {
    assert.equal(html.includes(word), false, `${word} を出さないこと`);
  }
});

test("逃げ道の文字は、そのまま表示される形に直してから入れる", () => {
  const html = keiriNoScriptHtml({
    heading: '<script>あ&い"う',
    lead: "宛先は ",
  });
  assert.equal(html.includes("<script>"), false, "タグとして解釈されないこと");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&amp;"));
  assert.ok(html.includes("&quot;"));
});

test("経理の画面（/keiri）に逃げ道が置かれている", async () => {
  const src = await readFile(new URL("../app/keiri/page.tsx", import.meta.url), "utf8");
  assert.ok(
    src.includes("keiriLoginNoScriptHtml"),
    "app/keiri/page.tsx は逃げ道（keiriLoginNoScriptHtml）を出すこと",
  );
  assert.ok(src.includes("<noscript"), "<noscript> で出すこと（ふだんの見た目は変えない）");
});
