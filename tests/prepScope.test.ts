import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PREP_SAVE_OUT_OF_SCOPE,
  decidePrepSave,
} from "../lib/prepScope";

/**
 * 仕込み日報の保存の窓口を、手羽屋のときだけに絞る（f3-4・2026-10-24）。
 *
 * いちばん大事なのは **手羽屋の保存が1つも止まらないこと**。
 * 印が送られてこない（古い画面がそのまま開かれている）ときも、今までどおり保存できる。
 */

test("手羽屋（印が空）は、今までどおり保存できる", () => {
  for (const v of [null, undefined, "", "   ", "tebaya"]) {
    const r = decidePrepSave(v);
    assert.equal(r.allow, true, `手羽屋として扱われていない：${String(v)}`);
    assert.equal(r.message, null);
  }
});

test("よその店だとはっきり名乗ったときだけ、保存しない", () => {
  const r = decidePrepSave("11111111-2222-3333-4444-555555555555");
  assert.equal(r.allow, false);
  assert.equal(r.message, PREP_SAVE_OUT_OF_SCOPE);
});

test("断りの1行は日本語で、英語のエラーを出さない", () => {
  assert.ok(/[ぁ-んァ-ヶ一-龠]/.test(PREP_SAVE_OUT_OF_SCOPE));
  assert.ok(!/error|Error|failed/.test(PREP_SAVE_OUT_OF_SCOPE));
});

test("保存の窓口が、この判定を通している", () => {
  const src = readFileSync("app/api/prep/save/route.ts", "utf8");
  assert.ok(
    src.includes("decidePrepSave"),
    "/api/prep/save が門を通っていません（画面の門だけでは裏口が残ります）",
  );
});

test("仕込みの画面が、いまどのお店かを名乗って保存している", () => {
  const src = readFileSync("app/prep/page.tsx", "utf8");
  assert.ok(
    src.includes("readTenantScope"),
    "仕込みの画面が「どのお店か」を読んでいません",
  );
  assert.ok(
    /tenant_id:\s*readTenantScope\(\)/.test(src),
    "仕込みの画面が、保存するときに「どのお店か」を送っていません",
  );
});
