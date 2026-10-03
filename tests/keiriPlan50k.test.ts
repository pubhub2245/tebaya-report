/**
 * 「経理まるごと」（月5万円前後）の1枚（/keiri/plan）のテスト。
 *
 * ★2026-10-03：下書き（/keiri/plan-draft）から**公開**に変えた。
 *   下書きのまま「じゅんの確認待ち」で置くと、
 *   お試し → 毎月の1枚 → 月5万円の中身 の3つが1本の道にならないため（f5-2）。
 *
 * ★守るのは6点。
 *   ① **公開している**（公開ページの並びに入っている・検索に出さない指定が無い）
 *   ② **3分で見せる順番が1本につながっている**
 *      お試し（/keiri/demo）→ 毎月の1枚（/keiri/monthly-sample）→ この1枚（/keiri/plan）
 *   ③ 前の住所（/keiri/plan-draft）を開いた人が、ここに着く
 *   ④ 文章は lib/keiri/plan50k.ts からだけ読む（画面に直書きしない）
 *   ⑤ **やらないこと**に、税務の個別判断と申告の代行が必ず入っている
 *   ⑥ やることは offer.ts（すでにしている約束）と、じゅんが決めた2つだけ
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PLAN_DOES,
  PLAN_DOES_NOT,
  PLAN_NAME,
  PLAN_PRICE_LINE,
  PLAN_TAX_HANDOFF,
} from "../lib/keiri/plan50k";
import { KEIRI_OFFER_ITEMS, KEIRI_OFFER_NOT_INCLUDED } from "../lib/keiri/offer";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const PAGE = read("../app/keiri/plan/page.tsx");
const SAMPLE = read("../app/keiri/monthly-sample/page.tsx");
const DEMO = read("../app/keiri/demo/board.tsx");

test("この1枚は公開ページの並びに入っている（sitemap と robots に出る）", () => {
  const found = KEIRI_PUBLIC_PAGES.find((p) => p.path === "/keiri/plan");
  assert.ok(found, "公開ページの並びに /keiri/plan が無い");
  assert.ok(found!.title.length > 0 && found!.lead.length > 0);
  assert.ok(!/index:\s*false/.test(PAGE), "検索に出さない指定が残っている");
  assert.ok(PAGE.includes("keiriMetadata("), "自分の題名のカードを持っていない");
});

test("3分で見せる順番が1本につながっている（お試し → 毎月の1枚 → この1枚）", () => {
  assert.ok(DEMO.includes("/keiri/monthly-sample"), "お試し版から毎月の1枚へ進めない");
  assert.ok(SAMPLE.includes("/keiri/plan"), "毎月の1枚から月5万円の中身へ進めない");
  // 行き止まりにしない：この1枚から前の2つと申し込みへ戻れる
  for (const href of ["/keiri/demo", "/keiri/monthly-sample", "/keiri/apply"]) {
    assert.ok(PAGE.includes(href), `この1枚から ${href} へ行けない`);
  }
});

test("前の住所（下書きのとき）を開いた人が、この1枚に着く", async () => {
  // ★ページの中で送る書き方（redirect()）は、このサイトの作りだと
  //   行き先の札が付かない 307 になり、ブラウザが移れない（2026-10-03 本番で実測）。
  //   配り口の設定（next.config.js の redirects）に書くこと。
  const config = require("../next.config.js") as {
    redirects?: () => Promise<{ source: string; destination: string }[]>;
  };
  assert.ok(typeof config.redirects === "function", "next.config.js に送り先の設定が無い");
  const moves = await config.redirects!();
  const found = moves.find((m) => m.source === "/keiri/plan-draft");
  assert.ok(found, "/keiri/plan-draft の送り先が設定に無い");
  assert.equal(found!.destination, "/keiri/plan");
});

test("画面に文章を直書きしていない（言葉は lib から引く）", () => {
  for (const key of [
    "PLAN_NAME",
    "PLAN_PRICE_LINE",
    "PLAN_LEAD",
    "PLAN_DOES",
    "PLAN_DOES_NOT",
    "PLAN_TAX_HANDOFF",
  ]) {
    assert.ok(PAGE.includes(key), `${key} を使っていない`);
  }
  for (const text of [PLAN_PRICE_LINE, PLAN_TAX_HANDOFF]) {
    assert.ok(!PAGE.includes(text), "文章が画面に直書きされている");
  }
});

test("やらないことに、税務の個別判断と申告の代行が入っている", () => {
  const all = PLAN_DOES_NOT.join("\n");
  assert.ok(all.includes("税務の個別判断はしません"));
  assert.ok(all.includes("確定申告そのものの代行はしません"));
  // 既にしている約束（offer.ts）を落としていない
  for (const t of KEIRI_OFFER_NOT_INCLUDED) {
    assert.ok(PLAN_DOES_NOT.includes(t), `offer.ts の「含まれないもの」が落ちている: ${t}`);
  }
  // 申告は税理士へつなぐと書いてある
  assert.ok(PLAN_TAX_HANDOFF.includes("税理士"));
});

test("やることは、すでにしている約束＋じゅんが決めた2つだけ", () => {
  assert.equal(PLAN_DOES.length, KEIRI_OFFER_ITEMS.length + 2);
  for (const o of KEIRI_OFFER_ITEMS) {
    assert.ok(
      PLAN_DOES.some((p) => p.title === o.title && p.body === o.body),
      `offer.ts の約束が落ちている: ${o.title}`,
    );
  }
  const added = PLAN_DOES.slice(KEIRI_OFFER_ITEMS.length).map((p) => p.title);
  assert.deepEqual(added, ["はじめの設定はこちらで", "月に1回、数字を一緒に見る"]);
});

test("名前と値段の言い方が、じゅんの決めたとおりである", () => {
  assert.equal(PLAN_NAME, "経理まるごと");
  assert.ok(PLAN_PRICE_LINE.includes("月5万円前後"));
  assert.ok(PLAN_PRICE_LINE.includes("1店舗"));
});
