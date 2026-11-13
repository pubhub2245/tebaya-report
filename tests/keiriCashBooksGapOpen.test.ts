import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BOOKS_GAP_OPEN_COUNT_MEANS,
  booksGapDates,
  measureBooksGapOpen,
} from "../lib/keiri/cashBooksGapOpen";
import { buildCashCountReady } from "../lib/keiri/cashCountWindow";
import { buildCashVariants } from "../lib/keiri/cashVariant";
import { measureBooksGap } from "../lib/keiri/cashBooksGap";

/**
 * 「日報が入っていない日は、営業した日なのか お休みなのか」（2026-11-09・f1-4）。
 *
 * ■ ここで守りたいこと
 *   ① 空きが お休みだけなら、そう言い切る（じゅんの1分を無駄にしない）
 *   ② 予定があって日報が無い日は、日数と日付で名指しする
 *   ③ 予定が読めなかったら「お休みでした」と言わない（0件を「無い」にしない）
 *   ④ 比べる日そのもの（ふつうは今日）は「足りない日」に数えない
 *   ⑤ 金額・お店の名前・担当者の名前を1文字も出さない
 */

test("① 空きが お休みだけなら、そう言い切る", () => {
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-01", "2026-11-02", "2026-11-03"],
    shiftDates: [],
  });
  assert.equal(r.readable, true);
  assert.equal(r.holidaysOnly, true);
  assert.equal(r.openDays, 0);
  assert.equal(r.closedDays, 3);
  assert.match(r.note, /お休み/);
  assert.match(r.note, /食い違うことはありません/);
});

test("② 予定があって日報が無い日は、日数と日付で名指しする", () => {
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"],
    shiftDates: ["2026-11-02", "2026-11-04", "2026-10-30"],
  });
  assert.equal(r.holidaysOnly, false);
  assert.equal(r.openDays, 2);
  assert.equal(r.closedDays, 2);
  assert.equal(r.firstDate, "2026-11-02");
  assert.equal(r.lastDate, "2026-11-04");
  assert.match(r.note, /11月2日〜11月4日/);
  assert.match(r.note, /先にその日報を入れてから/);
});

test("③ 予定が読めなかったら「お休みでした」と言わない", () => {
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-01", "2026-11-02"],
    shiftDates: null,
  });
  assert.equal(r.readable, false);
  assert.equal(r.holidaysOnly, false);
  assert.ok(!r.note.includes("お休み）でした"));
  assert.match(r.note, /読めませんでした/);
  assert.match(r.note, /分かりません/);
});

test("③ 空きが無い日は、何も言わない", () => {
  const r = measureBooksGapOpen({ gapDates: [], shiftDates: null });
  assert.equal(r.openDays, 0);
  assert.equal(r.holidaysOnly, false);
  assert.match(r.note, /この行は出ません/);
});

test("④ 比べる日そのものは「足りない日」に数えない", () => {
  const days = booksGapDates({ lastDate: "2026-10-31", asOf: "2026-11-09" });
  assert.deepEqual(days, [
    "2026-11-01",
    "2026-11-02",
    "2026-11-03",
    "2026-11-04",
    "2026-11-05",
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
  ]);
  // 1日しか空いていなければ、数える日は無い
  assert.deepEqual(booksGapDates({ lastDate: "2026-11-08", asOf: "2026-11-09" }), []);
  // 壊れた日付では止まらない（空で返す）
  assert.deepEqual(booksGapDates({ lastDate: "こわれた", asOf: "2026-11-09" }), []);
});

test("⑤ 金額・お店の名前・担当者の名前を1文字も出さない", () => {
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-01", "2026-11-02"],
    shiftDates: ["2026-11-01"],
  });
  const text = JSON.stringify(r);
  assert.ok(!/ながやま|PASIO|イデ|じゅん/.test(text));
  assert.ok(!/[0-9]{4,}円/.test(text));
});

test("お休みだけの空きは、数える前の1行が「いま数えて大丈夫」に変わる", () => {
  const variants = buildCashVariants({
    screenBalance: 200_000,
    withRepaidBalance: null,
    registerFloat: 120_000,
  });
  const booksGap = measureBooksGap({
    reports: [{ date: "2026-10-31" } as never],
    asOf: "2026-11-09",
  });
  assert.equal(booksGap.wide, true);

  const holiday = buildCashCountReady({
    variants,
    registerFloatOn: "2026-10-31",
    booksGap,
    gapOpen: { readable: true, openDays: 0, holidaysOnly: true },
  });
  assert.equal(holiday.gapIsHolidaysOnly, true);
  assert.match(holiday.line, /いま数えていただいて大丈夫です/);

  const missing = buildCashCountReady({
    variants,
    registerFloatOn: "2026-10-31",
    booksGap,
    gapOpen: { readable: true, openDays: 3, holidaysOnly: false },
  });
  assert.equal(missing.gapIsHolidaysOnly, false);
  assert.match(missing.line, /日報が入っていない日が 3日/);
  assert.match(missing.line, /先にその日報を入れてから数えてください/);

  // 渡さなければ今までどおりの言い方
  const unknown = buildCashCountReady({
    variants,
    registerFloatOn: "2026-10-31",
    booksGap,
  });
  assert.equal(unknown.gapIsHolidaysOnly, false);
  assert.match(unknown.line, /それ以降に営業した日があると/);
});

/**
 * ⑥ 2つの行の日数が1日ちがって見えても、食い違いではないと**答えの中に書いてある**
 * （2026-11-13・B）。
 *
 * ■ なぜ要るか
 *   同じ窓口（/api/keiri/cashcount）に、空きの日数が2通り並びます。
 *   ・booksGap … 日報のいちばん新しい日から **数える日まで**（11/5→11/13 なら 8日）
 *   ・booksGapOpen … そこから **数える日そのものを外した** 日数（7日）
 *   わざと違う数ですが、そう書いていなければ、見比べた人は
 *   「数字が壊れている／本番が古い」と読みます（11/11 に 15件 と 13件 で1回 起きた形）。
 */
test("⑥ 空き日数の数え方が、どの答えにも書いてある", () => {
  const cases = [
    measureBooksGapOpen({ gapDates: [], shiftDates: null }),
    measureBooksGapOpen({ gapDates: ["2026-11-06"], shiftDates: null }),
    measureBooksGapOpen({ gapDates: ["2026-11-06"], shiftDates: [] }),
    measureBooksGapOpen({ gapDates: ["2026-11-06"], shiftDates: ["2026-11-06"] }),
  ];
  for (const r of cases) {
    assert.equal(r.countMeans, BOOKS_GAP_OPEN_COUNT_MEANS);
    assert.match(r.countMeans, /数える日そのものを外して/);
    assert.match(r.countMeans, /1日 少なく出ることがあります/);
    assert.match(r.countMeans, /食い違いではありません/);
    // 金額・店名・担当者の名前は1文字も入れない
    assert.ok(!/円/.test(r.countMeans));
  }
});

test("⑥ 実際に1日ちがう形で、2つの行が並ぶ（11月13日に数えた形）", () => {
  // 日報は 11/5 まで・数える日は 11/13
  const gap = measureBooksGap({
    reports: [{ date: "2026-11-05" } as never],
    asOf: "2026-11-13",
  });
  const dates = booksGapDates({ lastDate: "2026-11-05", asOf: "2026-11-13" });
  const open = measureBooksGapOpen({ gapDates: dates, shiftDates: [] });
  assert.equal(gap.days, 8); // 数える日まで
  assert.equal(dates.length, 7); // 数える日そのものは外す
  assert.equal(open.closedDays, 7);
  // 1日 ちがうが、その理由が答えの中に書いてある
  assert.equal(gap.days! - open.closedDays, 1);
  assert.match(open.countMeans, /食い違いではありません/);
});
