import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import {
  FEEDBACK_PATH,
  KEIRI_FAQ,
  KEIRI_FIRST_DAY_INTRO,
  KEIRI_FIRST_DAY_STEPS,
  supportEmail,
} from "../lib/keiri/support";

test("よくある質問は10問ちょうどで、質問文が重なっていない", () => {
  assert.equal(KEIRI_FAQ.length, 10);
  assert.equal(new Set(KEIRI_FAQ.map((f) => f.q)).size, 10);
});

test("質問も答えも空でない", () => {
  for (const f of KEIRI_FAQ) {
    assert.ok(f.q.trim().length > 0, "質問が空です");
    assert.ok(f.a.trim().length > 0, `答えが空です: ${f.q}`);
  }
});

test("答えの中に金額を直書きしていない（料金は紹介ページが正）", () => {
  for (const f of KEIRI_FAQ) {
    assert.ok(!/円/.test(f.a), `料金を直書きしています: ${f.q}`);
  }
});

test("リンクはアプリの中（/で始まる）だけ", () => {
  for (const f of KEIRI_FAQ) {
    if (f.link) assert.ok(f.link.href.startsWith("/"), `外部リンクです: ${f.q}`);
  }
  assert.ok(FEEDBACK_PATH.startsWith("/"));
});

test("問い合わせ先は未設定なら null、設定されていればその値", () => {
  const before = process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL;
  try {
    delete process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL;
    assert.equal(supportEmail(), null);
    process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL = "   ";
    assert.equal(supportEmail(), null);
    process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL = " help@example.com ";
    assert.equal(supportEmail(), "help@example.com");
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL;
    else process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL = before;
  }
});

// ============================================================
// はじめの1回だけ：お店の設定（2026-09-19）
// ============================================================

test("はじめの1回だけの案内は、空で始まる3つを漏れなく説明している", () => {
  assert.equal(KEIRI_FIRST_DAY_STEPS.length, 3);
  assert.deepEqual(
    KEIRI_FIRST_DAY_STEPS.map((s) => s.title),
    ["出店場所", "担当者", "商品と単価"],
  );
  for (const s of KEIRI_FIRST_DAY_STEPS) {
    assert.ok(s.body.trim().length > 0, `説明が空です: ${s.title}`);
  }
  assert.ok(KEIRI_FIRST_DAY_INTRO.trim().length > 0);
});

test("案内に金額を直書きしない（料金は紹介ページが正）", () => {
  for (const text of [KEIRI_FIRST_DAY_INTRO, ...KEIRI_FIRST_DAY_STEPS.map((s) => s.body)]) {
    assert.ok(!/[0-9０-９][,，0-9０-９]*\s*円/.test(text), `料金を直書きしています: ${text}`);
  }
});

test("商品の案内は「空のままだと毎回ひっかかる」ことを書いている", () => {
  const product = KEIRI_FIRST_DAY_STEPS.find((s) => s.title === "商品と単価");
  assert.ok(product);
  assert.ok(
    product!.body.includes("差額の理由"),
    "商品が空だと毎日「差額の理由」を選ぶことになる、と書いておくこと",
  );
});

test("初回設定のあとの画面が、この案内をそのまま出している", () => {
  const src = readFileSync(new URL("../app/keiri/welcome/page.tsx", import.meta.url), "utf-8");
  assert.ok(src.includes("KEIRI_FIRST_DAY_STEPS"), "案内は lib から読むこと（画面に直書きしない）");
  assert.ok(src.includes("KEIRI_FIRST_DAY_INTRO"));
});

test("初回設定の入力は3つのまま（案内を足しても、入れる物は増やさない）", () => {
  const src = readFileSync(new URL("../app/keiri/welcome/page.tsx", import.meta.url), "utf-8");
  for (const f of ["shopName", "openingDate", "openingBalance"]) {
    assert.ok(src.includes(f), `${f} が無くなっています`);
  }
  // 入力欄（<input）の数は、店名・数え始めの日・その日の手元の現金の3つだけ
  assert.equal((src.match(/<input/g) ?? []).length, 3, "初回設定の入力欄は3つのまま");
});
