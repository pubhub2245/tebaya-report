/**
 * 「経理まるごと」（月5万円前後）の1枚（下書き）のテスト。
 *
 * ★守るのは4点。
 *   ① **まだ公開していない**（検索に出さない・公開ページの並びに入れない）
 *   ② 文章は lib/keiri/plan50k.ts からだけ読む（画面に直書きしない）
 *   ③ **やらないこと**に、税務の個別判断と申告の代行が必ず入っている
 *   ④ やることは offer.ts（すでにしている約束）と、じゅんが決めた2つだけ
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PLAN_DOES,
  PLAN_DOES_NOT,
  PLAN_DRAFT_NOTICE,
  PLAN_NAME,
  PLAN_PRICE_LINE,
  PLAN_TAX_HANDOFF,
} from "../lib/keiri/plan50k";
import { KEIRI_OFFER_ITEMS, KEIRI_OFFER_NOT_INCLUDED } from "../lib/keiri/offer";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

const PAGE = readFileSync(
  new URL("../app/keiri/plan-draft/page.tsx", import.meta.url),
  "utf8",
);

test("この1枚はまだ公開していない（検索に出さず、公開ページの並びにも入れない）", () => {
  assert.ok(/index:\s*false/.test(PAGE), "noindex になっていない");
  assert.ok(/follow:\s*false/.test(PAGE), "nofollow になっていない");
  const paths = KEIRI_PUBLIC_PAGES.map((p) => p.path);
  assert.ok(
    !paths.includes("/keiri/plan-draft"),
    "公開ページの並びに入っている（sitemap と関連リンクに出てしまう）",
  );
});

test("どのページからも、この下書きへリンクしていない", () => {
  for (const file of [
    "../app/keiri/case/page.tsx",
    "../app/keiri/page.tsx",
    "../app/keiri/demo/board.tsx",
    "../app/keiri/components/nav.tsx",
    "../app/keiri/monthly-sample/page.tsx",
    "../app/keiri/show/page.tsx",
  ]) {
    const raw = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(!raw.includes("/keiri/plan-draft"), `${file} からリンクしている`);
  }
});

test("画面に文章を直書きしていない（言葉は lib から引く）", () => {
  for (const key of [
    "PLAN_DRAFT_NOTICE",
    "PLAN_NAME",
    "PLAN_PRICE_LINE",
    "PLAN_LEAD",
    "PLAN_DOES",
    "PLAN_DOES_NOT",
    "PLAN_TAX_HANDOFF",
  ]) {
    assert.ok(PAGE.includes(key), `${key} を使っていない`);
  }
  for (const text of [PLAN_DRAFT_NOTICE, PLAN_PRICE_LINE, PLAN_TAX_HANDOFF]) {
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
