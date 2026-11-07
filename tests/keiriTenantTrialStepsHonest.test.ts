/**
 * 「手順4〜6まで通ったか」を測る窓口が、**倉庫（データのしまい場所）が眠っている日に
 * 確かめてもいないことを言い切らない**ことのテスト（2026-11-07・f5-4・f3-4）。
 *
 * ここが狂うと、倉庫が止まっている日に
 *   ・「テストの店がまだありません」（確かめていないのに まだと言う）
 *   ・separated: false（確かめていないのに 分かれていないと言う）
 * と答え、それを読んだ人が f5-4 を不合格に付け替えてしまう。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  STEP_KEYS,
  STEP_UNKNOWN,
  decideStepsMeasurable,
  stepsSummary,
  stepsSummaryUnmeasurable,
  unknownSteps,
} from "../lib/keiri/tenantTrialSteps";

const ALIVE = { alive: true, reason: "手羽屋の行が見えました（倉庫は読めています）" };
const DEAD = { alive: false, reason: "倉庫からの返事が時間内に来ませんでした" };

test("倉庫が読めないときは測れない（理由はそのまま持ち上げる）", () => {
  const got = decideStepsMeasurable({ warehouse: DEAD, shopLookup: "row" });
  assert.equal(got.measurable, false);
  assert.equal(got.why, DEAD.reason);
});

test("倉庫は読めたが、テストの店を聞けなかったときも測れない", () => {
  const got = decideStepsMeasurable({ warehouse: ALIVE, shopLookup: "error" });
  assert.equal(got.measurable, false);
  assert.match(String(got.why), /聞けませんでした/);
});

test("テストの店が『無い』のは測れている（まだ通っていない、が正しい答え）", () => {
  for (const kind of ["row", "none", "nokey"] as const) {
    const got = decideStepsMeasurable({ warehouse: ALIVE, shopLookup: kind });
    assert.equal(got.measurable, true, kind);
    assert.equal(got.why, null, kind);
  }
});

test("測れなかった日は、手順6つぶんぜんぶ『確かめられませんでした』", () => {
  const steps = unknownSteps();
  assert.equal(Object.keys(steps).length, STEP_KEYS.length);
  for (const key of STEP_KEYS) assert.equal(steps[key], STEP_UNKNOWN);
  // 「まだです」「入っています」「混ざりません」とは1つも言わない
  const joined = Object.values(steps).join("／");
  assert.ok(!joined.includes("まだです"));
  assert.ok(!joined.includes("入っています"));
  assert.ok(!joined.includes("混ざりません"));
});

test("測れなかった日のまとめは、合格とも不合格とも言わない", () => {
  const line = stepsSummaryUnmeasurable(DEAD.reason);
  assert.match(line, /いまは測れませんでした/);
  assert.match(line, /合格にも不合格にもしていません/);
  assert.ok(line.includes(DEAD.reason));
  // 止まっている日に出してはいけない言い方が混ざっていないこと
  assert.ok(!line.includes("テストの店がまだありません"));
  assert.ok(!line.includes("通りました"));
});

test("理由が分からないときも、言い切らない形になる", () => {
  const line = stepsSummaryUnmeasurable(null);
  assert.match(line, /理由が分かりません/);
  assert.match(line, /合格にも不合格にもしていません/);
});

test("測れた日のまとめは今までどおり（この直しで答えを変えていない）", () => {
  const none = stepsSummary({
    shopReady: false,
    locationReady: false,
    productReady: false,
    staffReady: false,
    reportReady: false,
    separated: false,
    numbersShown: false,
  });
  assert.match(none, /テストの店がまだありません/);
});
