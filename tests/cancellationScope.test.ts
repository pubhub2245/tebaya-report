/**
 * 出店中止の記録（daily_cancellations）の門のテスト（2026-10-25・f3-4）。
 *
 * 確かめたいのは1つだけ：
 * **手羽屋のときの答えが、門を足す前とまったく同じであること。**
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CANCELLATION_OUT_OF_SCOPE,
  cancellationInScope,
} from "../lib/cancellation/scope";
import { TEBAYA_SCOPE } from "../lib/tenantScope";

const SHOP_A = "11111111-2222-4333-8444-555555555555";

test("手羽屋（印が空）のときは、今までどおり読み書きする", () => {
  assert.equal(cancellationInScope(TEBAYA_SCOPE), true);
  assert.equal(cancellationInScope(null), true);
  assert.equal(cancellationInScope(""), true);
  // 形が違う値も手羽屋に倒す（lib/tenantScope.ts と同じ）
  assert.equal(cancellationInScope("tebaya"), true);
});

test("よその店のときは、1行も読まない・1行も書かない", () => {
  assert.equal(cancellationInScope(SHOP_A), false);
  assert.equal(cancellationInScope(SHOP_A.toUpperCase()), false);
});

test("断りの文は、黙って成功に見せない言い方になっている", () => {
  assert.ok(CANCELLATION_OUT_OF_SCOPE.includes("手羽屋"));
  assert.ok(CANCELLATION_OUT_OF_SCOPE.length >= 10);
});

test("読む係（lib/cancellation/db.ts）の読み書き4つが、ぜんぶ門の内側にある", () => {
  /**
   * ★中止の記録には、日付・出店場所・担当者の名前・理由が入る。
   *   門を外した道が1つでも残ると、よその店に手羽屋の中止の記録が見える。
   */
  const src = readFileSync("lib/cancellation/db.ts", "utf8");
  for (const fn of [
    "createCancellation",
    "getCancellationsForPeriod",
    "getCancellationsForDate",
    "isCancelled",
  ]) {
    const at = src.indexOf(`export async function ${fn}`);
    assert.ok(at > 0, `${fn} が見つかりません`);
    const body = src.slice(at, src.indexOf('.from("daily_cancellations")', at));
    assert.ok(
      body.includes("tebayaOnly()"),
      `${fn} が門（tebayaOnly）を通っていません`,
    );
  }
});
