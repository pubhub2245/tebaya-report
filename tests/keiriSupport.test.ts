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

/*
 * ★2026-09-20 に決まりを1つ変えた（kp112）。
 *   もとは「未設定なら null（画面は『準備中』）」だった。
 *   ところが本番はこの設定が入っておらず、窓口が **ずっと「準備中」のまま**で、
 *   同じ宛先が特商法のページには載っている、という食い違いになっていた。
 *   いまは「未設定なら、特商法と同じ連絡先に戻す」。
 *   前後の空白を落とすこと・設定があればそれを優先することは変えていない。
 */
test("問い合わせ先は、設定されていればその値（前後の空白は落とす）", () => {
  const before = process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL;
  try {
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

/* ──────────────────────────────────────────────────────────────
 * 2026-09-20 追加（司令室 kp112）
 *
 * 「困ったとき」のページに出る窓口が、本番で **ずっと「準備中」のまま**だった。
 * 設定（NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL）が入っていなかったため。
 * いっぽう同じ宛先は、特商法のページと紹介ページには載っている。
 * ＝ 法律で出すページには宛先があるのに、
 *   月15,000円に含まれる「聞かれたことに答える窓口」だけが準備中、という食い違い。
 *   払ったお店が最初に困ったとき、行き先が1つも無い状態だった。
 * ────────────────────────────────────────────────────────────── */

import { KEIRI_COMPANY } from "../lib/keiri/legal";

test("窓口の宛先：設定が無くても「準備中」にしない（特商法と同じ連絡先に戻す）", () => {
  const before = process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL;
  try {
    delete process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL;
    assert.equal(supportEmail(), KEIRI_COMPANY.email);
    process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL = "   ";
    assert.equal(supportEmail(), KEIRI_COMPANY.email, "空白だけの設定も「無い」と同じ扱い");
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL;
    else process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL = before;
  }
});

test("窓口の宛先：別の宛先に分けたいときは、設定したほうが優先される", () => {
  const before = process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL;
  try {
    process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL = "support@example.com";
    assert.equal(supportEmail(), "support@example.com");
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL;
    else process.env.NEXT_PUBLIC_KEIRI_SUPPORT_EMAIL = before;
  }
});
