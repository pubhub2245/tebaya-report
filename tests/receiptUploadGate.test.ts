/**
 * よそのお店のレシート写真を、公開のままの置き場に置かないための門（f3-4・2026-10-27）。
 *
 * ■ ここで固定したいこと
 *   ① 手羽屋（印が空）は、置き場の設定がどうであっても今までどおり置ける
 *   ② よそのお店は、置き場が**非公開のときだけ**置ける
 *   ③ 公開のまま／確かめられないときは置かない（＝写真は記録の中に残る）
 *   ④ 理由の1行に、鍵・住所・金額が入らない
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { judgeReceiptUpload, RECEIPT_KEEP_NOTE } from "../lib/receiptUploadGate";
import { TEBAYA_SCOPE } from "../lib/tenantScope";

const OTHER = "11111111-1111-4111-8111-111111111111";

test("手羽屋の写真は、置き場の設定がどうであっても今までどおり置ける", () => {
  for (const pub of [true, false, null] as const) {
    const gate = judgeReceiptUpload(TEBAYA_SCOPE, pub);
    assert.equal(gate.allowed, true, `手羽屋が止まっています（置き場=${String(pub)}）`);
    assert.equal(gate.tebaya, true);
  }
});

test("よそのお店は、置き場が非公開のときだけ置ける", () => {
  assert.equal(judgeReceiptUpload(OTHER, false).allowed, true);
  assert.equal(judgeReceiptUpload(OTHER, true).allowed, false);
  assert.equal(judgeReceiptUpload(OTHER, null).allowed, false);
});

test("置けないときは、写真が記録の中に残ることを理由の1行で言う", () => {
  for (const pub of [true, null] as const) {
    const gate = judgeReceiptUpload(OTHER, pub);
    assert.equal(gate.allowed, false);
    assert.ok(
      gate.reason.includes(RECEIPT_KEEP_NOTE),
      `写真の行き先が書かれていません（置き場=${String(pub)}）：${gate.reason}`,
    );
  }
});

test("理由の1行に、鍵・住所・金額は入らない", () => {
  for (const scope of [TEBAYA_SCOPE, OTHER]) {
    for (const pub of [true, false, null] as const) {
      const { reason } = judgeReceiptUpload(scope, pub);
      assert.ok(!/https?:\/\//.test(reason), `住所が入っています：${reason}`);
      assert.ok(!/eyJ|sb_|service_role/.test(reason), `鍵が入っています：${reason}`);
      assert.ok(!/\d{3,}/.test(reason), `数字が入っています：${reason}`);
    }
  }
});

test("置き場へ上げる所が、門を必ず通る（通らない道を作ったら落ちる）", () => {
  const src = readFileSync("lib/receiptStorage.ts", "utf8");
  assert.ok(
    src.includes("await assertUploadAllowed("),
    "置き場へ上げる前に門を通っていません（lib/receiptStorage.ts）",
  );
  assert.ok(
    src.includes("judgeReceiptUpload"),
    "門の決まりを lib/receiptUploadGate.ts から使っていません",
  );
  // 手羽屋は門に聞きに行かない（通信を増やさない）ことも固定する
  assert.ok(
    /if \(isTebayaScope\(scope\)\) return;/.test(src),
    "手羽屋のときに窓口へ聞きに行かない、という道が消えています",
  );
});

test("門の窓口が、外から確かめられる一覧に載っている", () => {
  const src = readFileSync("lib/keiri/checkWindow.ts", "utf8");
  assert.ok(
    src.includes('"/api/keiri/photo-gate"'),
    "/api/keiri/photo-gate が窓口の一覧に載っていません（載っていないと誰も気づけません）",
  );
});
