import test from "node:test";
import assert from "node:assert/strict";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { KEIRI_PUBLIC_PAGES } from "@/app/keiri/components/nav";
import { OUTREACH_LINK } from "@/lib/keiri/outreach";
import { PUBLIC_SITE_URL } from "@/lib/keiri/siteUrl";

/**
 * 検索エンジンに「どこを読んでよいか」を伝える紙（robots.txt）と、
 * 「どのページが在るか」を渡す一覧（sitemap.xml）の見張り。
 *
 * ★2026-09-19：ページ一覧そのものが「ことわる」側に入っていた。
 *   売り場を16ページ許していても、一覧だけ届かない状態だったので、
 *   同じ取りこぼしが戻らないように検算で固定する。
 */

function rule() {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  const all = rules.find((x) => x.userAgent === "*");
  assert.ok(all, "すべての検索エンジン向けの決まりが1つある");
  return all!;
}

function allowList(): string[] {
  const a = rule().allow;
  return Array.isArray(a) ? a : a ? [a] : [];
}

test("ページ一覧（sitemap.xml）は、必ず読ませる側に入っている", () => {
  assert.ok(allowList().includes("/sitemap.xml"));
});

test("robots.txt 自身も読ませる側に入っている", () => {
  assert.ok(allowList().includes("/robots.txt"));
});

test("robots.txt に、ページ一覧の在りかが書いてある", () => {
  const s = robots().sitemap;
  const list = Array.isArray(s) ? s : s ? [s] : [];
  assert.equal(list.length, 1);
  assert.ok(list[0]!.endsWith("/sitemap.xml"));
});

test("公開ページは1つ残らず読ませる側に入っている", () => {
  const allow = allowList();
  for (const p of KEIRI_PUBLIC_PAGES) {
    assert.ok(allow.includes(p.path), `${p.path} が robots の許可に入っていない`);
  }
});

/**
 * ★2026-09-26：「入口の /keiri が検索から遮断されている」という見立てが出たが、
 *   外から数えて確かめたところ **直してはいけない見立て** だった。
 *   ・`/keiri` は合言葉で入る経理の画面で、お店の売上・利益・現金がそのまま出る。
 *     検索に載せる所ではない（だから下の検算で「入れない」と固定してある）。
 *   ・ご案内で送るリンクの行き先は `/keiri` ではなく `/keiri/case` で、
 *     こちらは許可にも一覧にも入っている（すぐ下の検算で固定した）。
 *   同じ見立てが戻ってきても、この2本の検算が止めてくれる。
 */
test("お店の中の数字が出る画面は、読ませる側に入れない", () => {
  const allow = allowList();
  // /keiri（経理の画面）・/keiri/welcome（初回設定）・/keiri/advances（立替）と
  // 手羽屋の業務画面は、検索から入る所ではない
  for (const p of ["/keiri", "/keiri/welcome", "/keiri/advances", "/report", "/admin", "/cash", "/shifts"]) {
    assert.ok(!allow.includes(p), `${p} が robots の許可に入っている`);
  }
  assert.equal(rule().disallow, "/");
});

test("ページ一覧に載るのは公開ページだけで、数も一致する", () => {
  const urls = sitemap().map((u) => u.url);
  assert.equal(urls.length, KEIRI_PUBLIC_PAGES.length);
  for (const p of KEIRI_PUBLIC_PAGES) {
    assert.ok(urls.some((u) => u.endsWith(p.path)), `${p.path} が sitemap に無い`);
  }
});

/**
 * ご案内で送る1本のリンク（LINEの文に入る `OUTREACH_LINK`）の行き先が、
 * ・公開ページの一覧に在る（＝ほんとうに出ているページ）
 * ・robots.txt の許可に在る（＝検索エンジンが読みに行ける）
 * ・sitemap.xml に在る（＝Googleに差し出している）
 * の3つを満たしていることを固定する。
 *
 * ★なぜ要るか：じゅんが押すのは「送る」の1回だけで、送った文は取り消せない。
 *   その1回が読めないページを指していたら、送った先が丸ごと無駄になる。
 *   ページの名前を変えたときに、ここで気づけるようにしておく。
 */
test("ご案内で送るリンクの行き先は、公開ページで・検索に許可されていて・一覧にも載っている", () => {
  assert.ok(
    OUTREACH_LINK.startsWith(`${PUBLIC_SITE_URL}/`),
    "ご案内のリンクが、このサイトの住所で始まっていない",
  );
  const path = OUTREACH_LINK.slice(PUBLIC_SITE_URL.length);
  assert.ok(
    KEIRI_PUBLIC_PAGES.some((p) => p.path === path),
    `ご案内のリンクの行き先 ${path} が公開ページの一覧に無い`,
  );
  assert.ok(allowList().includes(path), `${path} が robots の許可に入っていない`);
  assert.ok(
    sitemap().some((u) => u.url === OUTREACH_LINK),
    `${path} が sitemap に無い`,
  );
});

test("お試し版（/keiri/demo）は、一覧にも許可にも入っている", () => {
  assert.ok(allowList().includes("/keiri/demo"));
  assert.ok(sitemap().some((u) => u.url.endsWith("/keiri/demo")));
});
