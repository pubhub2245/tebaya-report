import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildRegisterDiffGapWindow,
  EMPTY_REGISTER_DIFF_GAP,
  measureRegisterDiffGap,
  normalizeRegisterDiffs,
  registerDiffDirection,
  registerDiffGapLines,
  registerDiffGapNotice,
} from "../lib/keiri/registerDiffGap";

/**
 * 「日報に入っているレジの過不足」の決まりを固定する（2026-11-04・f1-4）。
 *
 * ■ ここで守りたいこと
 *   ① 読めなかったのを「0円」と取り違えない
 *   ② 0円の過不足で行を増やさない
 *   ③ 数え始めの日より前・数えた日より後は数えない
 *   ④ 不足（マイナス）は「金庫のほうが少なく出る」、過剰は「多く出る」
 *   ⑤ 差が小さいときは行を出さない
 *   ⑥ ここは説明の行を作るだけで、金額は1円も直さない
 */

test("読めていないときは『0円』と言わない（行も出ない）", () => {
  const gap = measureRegisterDiffGap({
    rows: null,
    openingDate: "2026-08-10",
    asOf: "2026-11-04",
  });
  assert.deepEqual(gap, EMPTY_REGISTER_DIFF_GAP);
  assert.equal(gap.readable, false);
  assert.deepEqual(registerDiffGapLines(gap, -50000), []);
  assert.equal(registerDiffGapNotice(gap), "");
  const w = buildRegisterDiffGapWindow({ gap, diff: -50000 });
  assert.equal(w.shown, false);
  assert.match(w.note, /0円という意味ではありません/);
});

test("0円・空・数字でない過不足は数えない", () => {
  const rows = normalizeRegisterDiffs([
    { date: "2026-10-01", register_diff: 0 },
    { date: "2026-10-02", register_diff: null },
    { date: "2026-10-03", register_diff: "あ" },
    { date: "こわれた日付", register_diff: -500 },
    { date: "2026-10-04", register_diff: -500 },
  ]);
  assert.deepEqual(rows, [{ date: "2026-10-04", amount: -500 }]);
});

test("数え始めの日より前と、数えた日より後は数えない", () => {
  const rows = normalizeRegisterDiffs([
    { date: "2026-08-01", register_diff: -9999 }, // 数え始めより前
    { date: "2026-10-04", register_diff: -500 },
    { date: "2026-11-20", register_diff: -7777 }, // 数えた日より後
  ]);
  const gap = measureRegisterDiffGap({
    rows,
    openingDate: "2026-08-10",
    asOf: "2026-11-04",
  });
  assert.equal(gap.rows, 1);
  assert.equal(gap.total, -500);
  assert.equal(gap.lastDate, "2026-10-04");
});

test("不足は『金庫のほうが少なく』、過剰は『多く』", () => {
  const short = measureRegisterDiffGap({
    rows: [{ date: "2026-10-04", amount: -3000 }],
    openingDate: "2026-08-10",
    asOf: "2026-11-04",
  });
  assert.equal(registerDiffDirection(short), "少なく");
  const over = measureRegisterDiffGap({
    rows: [{ date: "2026-10-04", amount: 3000 }],
    openingDate: "2026-08-10",
    asOf: "2026-11-04",
  });
  assert.equal(registerDiffDirection(over), "多く");
});

test("足してちょうど0になる月は、行も一言も出さない", () => {
  const gap = measureRegisterDiffGap({
    rows: [
      { date: "2026-10-04", amount: -3000 },
      { date: "2026-10-05", amount: 3000 },
    ],
    openingDate: "2026-08-10",
    asOf: "2026-11-04",
  });
  assert.equal(gap.rows, 2);
  assert.equal(gap.total, 0);
  assert.equal(registerDiffDirection(gap), null);
  assert.deepEqual(registerDiffGapLines(gap, -50000), []);
  assert.equal(registerDiffGapNotice(gap), "");
  assert.equal(buildRegisterDiffGapWindow({ gap, diff: -50000 }).shown, false);
});

test("差が小さいうちは行を出さない（1,000円の線）", () => {
  const gap = measureRegisterDiffGap({
    rows: [{ date: "2026-10-04", amount: -3000 }],
    openingDate: "2026-08-10",
    asOf: "2026-11-04",
  });
  assert.deepEqual(registerDiffGapLines(gap, 500), []);
  assert.deepEqual(registerDiffGapLines(gap, null), []);
  assert.equal(registerDiffGapLines(gap, 3000).length, 2);
});

test("行には金額と向きが入り、『書き忘れではない』と言う", () => {
  const gap = measureRegisterDiffGap({
    rows: [
      { date: "2026-10-04", amount: -3000 },
      { date: "2026-10-20", amount: -576 },
    ],
    openingDate: "2026-08-10",
    asOf: "2026-11-04",
  });
  const lines = registerDiffGapLines(gap, 3576);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /3,576円/);
  assert.match(lines[0], /2日ぶん/);
  assert.match(lines[0], /10月20日/);
  assert.match(lines[1], /少なく出ます/);
  assert.match(lines[1], /書き忘れではありません/);
});

test("数える前の一言は、押す前でも出る（差が無くても出す）", () => {
  const gap = measureRegisterDiffGap({
    rows: [{ date: "2026-10-04", amount: -3000 }],
    openingDate: "2026-08-10",
    asOf: "2026-11-04",
  });
  const notice = registerDiffGapNotice(gap);
  assert.match(notice, /1日ぶん/);
  assert.match(notice, /3,000円/);
  assert.match(notice, /少なく出ます/);
});

test("外から確かめる窓口は、本物の金額を1円も返さない", () => {
  const gap = measureRegisterDiffGap({
    rows: [{ date: "2026-10-04", amount: -3576 }],
    openingDate: "2026-08-10",
    asOf: "2026-11-04",
  });
  const w = buildRegisterDiffGapWindow({ gap, diff: 3576 });
  assert.equal(w.readable, true);
  assert.equal(w.rows, 1);
  assert.equal(w.differs, true);
  assert.equal(w.direction, "少なく");
  assert.equal(w.shown, true);
  // 金額（3576 / 3,576）が1文字も出ていないこと
  const all = JSON.stringify(w);
  assert.equal(all.includes("3576"), false);
  assert.equal(all.includes("3,576"), false);
});
