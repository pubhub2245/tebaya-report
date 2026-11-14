import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SHIFT_SHELF_NOT_MEASURED,
  measureShiftShelfFresh,
  shiftShelfStaleLine,
} from "../lib/keiri/shiftShelfFresh";
import { measureBooksGapOpen } from "../lib/keiri/cashBooksGapOpen";
import { measureCashCountDay } from "../lib/keiri/cashCountDay";

/**
 * 「出店予定の表が止まっているなら、予定が無いことを お休みの証しにしない」
 * （2026-11-14・f1-4）。
 *
 * ■ ここで守りたいこと
 *   ① 表が空きの期間まで入っていれば、今までどおり「ぜんぶお休み」と言い切る
 *   ② 表がその前で止まっていたら、言い切らない（holidaysOnly を false にする）
 *   ③ 表に1件も無いときも「お休み」と言わない
 *   ④ 渡さなければ（まだ測っていなければ）今までどおりの言い方のまま
 *   ⑤ 金額・お店の名前・担当者の名前を1文字も出さない
 */

test("① 表が空きの期間まで入っていれば、今までどおり お休みと言い切る", () => {
  const shelf = measureShiftShelfFresh({
    lastPublishedDate: "2026-11-20",
    since: "2026-11-06",
  });
  assert.equal(shelf.coversSince, true);
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-06", "2026-11-07"],
    shiftDates: [],
    shelf,
  });
  assert.equal(r.holidaysOnly, true);
  assert.equal(r.shelfCoversGap, true);
  assert.match(r.note, /お休み/);
});

test("② 表が空きの前で止まっていたら、お休みと言い切らない", () => {
  const shelf = measureShiftShelfFresh({
    lastPublishedDate: "2026-10-31",
    since: "2026-11-06",
  });
  assert.equal(shelf.coversSince, false);
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-06", "2026-11-07", "2026-11-08"],
    shiftDates: [],
    shelf,
  });
  assert.equal(r.readable, true);
  assert.equal(r.holidaysOnly, false);
  assert.equal(r.shelfCoversGap, false);
  assert.equal(r.shelfLastDate, "2026-10-31");
  assert.match(r.note, /10月31日 までで止まって/);
  assert.match(r.note, /分かりません/);
  assert.doesNotMatch(r.note, /円/);
});

test("③ 表に1件も無いときも、お休みと言わない", () => {
  const shelf = measureShiftShelfFresh({ lastPublishedDate: null, since: "2026-11-06" });
  assert.equal(shelf.coversSince, false);
  assert.equal(shelf.lastDate, null);
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-06"],
    shiftDates: [],
    shelf,
  });
  assert.equal(r.holidaysOnly, false);
  assert.match(r.note, /1件も入っていません/);
});

test("④ 渡さなければ、今までどおりの言い方のまま", () => {
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-06", "2026-11-07"],
    shiftDates: [],
  });
  assert.equal(r.holidaysOnly, true);
  assert.equal(r.shelfCoversGap, null);
  assert.equal(r.shelfLastDate, null);
});

test("⑤ 読めなかったときは、今までどおり『分かりません』（表の新しさも当てにしない）", () => {
  assert.equal(measureShiftShelfFresh({ since: "2026-11-06" }).coversSince, null);
  assert.deepEqual(
    measureShiftShelfFresh({ lastPublishedDate: "こわれた値", since: "2026-11-06" }),
    SHIFT_SHELF_NOT_MEASURED,
  );
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-06"],
    shiftDates: null,
    shelf: SHIFT_SHELF_NOT_MEASURED,
  });
  assert.equal(r.readable, false);
  assert.equal(r.holidaysOnly, false);
});

test("⑥ 予定があって日報が無い日は、今までどおり名指しする（表が止まっていても）", () => {
  const shelf = measureShiftShelfFresh({
    lastPublishedDate: "2026-11-08",
    since: "2026-11-06",
  });
  const r = measureBooksGapOpen({
    gapDates: ["2026-11-06", "2026-11-07"],
    shiftDates: ["2026-11-07"],
    shelf,
  });
  assert.equal(r.openDays, 1);
  assert.equal(r.holidaysOnly, false);
  assert.match(r.note, /11月7日/);
});

test("⑦ 数える日も同じ：表が止まっていたら『予定がありません』と言い切らない", () => {
  const shelf = measureShiftShelfFresh({
    lastPublishedDate: "2026-10-31",
    since: "2026-11-14",
  });
  const r = measureCashCountDay({
    date: "2026-11-14",
    shiftToday: false,
    reportIn: false,
    shelf,
  });
  assert.equal(r.openOnCountDay, false);
  assert.equal(r.shelfCoversDay, false);
  assert.match(r.line, /分かりません/);
  assert.doesNotMatch(r.line, /そのまま数えて大丈夫です。$/);

  const same = measureCashCountDay({
    date: "2026-11-14",
    shiftToday: false,
    reportIn: false,
  });
  assert.match(same.line, /そのまま数えて大丈夫です/);
  assert.equal(same.shelfCoversDay, null);
});

test("⑧ 一言には、お店の名前・担当者の名前・金額を入れない", () => {
  const line = shiftShelfStaleLine(
    measureShiftShelfFresh({ lastPublishedDate: "2026-10-31", since: "2026-11-06" }),
  );
  assert.equal(line, "出店予定の表は 10月31日 までで止まっています");
  assert.equal(shiftShelfStaleLine(SHIFT_SHELF_NOT_MEASURED), "");
});
