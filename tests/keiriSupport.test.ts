import { test } from "node:test";
import assert from "node:assert/strict";

import { FEEDBACK_PATH, KEIRI_FAQ, supportEmail } from "../lib/keiri/support";

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
