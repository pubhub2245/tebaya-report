import test from "node:test";
import assert from "node:assert/strict";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { KEIRI_PUBLIC_PAGES } from "@/app/keiri/components/nav";

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

test("お試し版（/keiri/demo）は、一覧にも許可にも入っている", () => {
  assert.ok(allowList().includes("/keiri/demo"));
  assert.ok(sitemap().some((u) => u.url.endsWith("/keiri/demo")));
});
