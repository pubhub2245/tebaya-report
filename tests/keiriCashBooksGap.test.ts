import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BOOKS_GAP_DAYS,
  buildCashBooksGapWindow,
  cashBooksGapLines,
  EMPTY_CASH_BOOKS_GAP,
  measureBooksGap,
} from "../lib/keiri/cashBooksGap";
import type { KeiriReport } from "../lib/keiri/types";

/**
 * 「日報がどこまで入っているか」の決まりを固定する（2026-11-01・f1-4）。
 *
 * ■ ここで守りたいこと
 *   ① 日報のいちばん新しい日を取り違えない（並び順に頼らない）
 *   ② 1〜2日の空きでは一言を出さない（ふだんの入力の遅れ）
 *   ③ 差が小さいときは行を出さない（よけいな行を増やさない）
 *   ④ 金額を1円も作らない・返さない
 */

const rep = (date: string): KeiriReport =>
  ({ date, sales_amount: 10000, labor: [], expenses: [] }) as unknown as KeiriReport;

test("日報のいちばん新しい日は、並び順に関係なく取れる", () => {
  const gap = measureBooksGap({
    reports: [rep("2026-10-05"), rep("2026-10-18"), rep("2026-10-11")],
    asOf: "2026-11-01",
  });
  assert.equal(gap.lastDate, "2026-10-18");
  assert.equal(gap.count, 3);
  assert.equal(gap.days, 14);
  assert.equal(gap.wide, true);
});

test("1〜2日の空きでは一言を出さない", () => {
  const gap = measureBooksGap({ reports: [rep("2026-10-31")], asOf: "2026-11-01" });
  assert.equal(gap.days, 1);
  assert.equal(gap.wide, false);
  assert.deepEqual(cashBooksGapLines(gap, 50000), []);
});

test("線はちょうど3日から（2日は出ない・3日は出る）", () => {
  const two = measureBooksGap({ reports: [rep("2026-10-30")], asOf: "2026-11-01" });
  const three = measureBooksGap({ reports: [rep("2026-10-29")], asOf: "2026-11-01" });
  assert.equal(two.days, 2);
  assert.equal(two.wide, false);
  assert.equal(three.days, BOOKS_GAP_DAYS);
  assert.equal(three.wide, true);
});

test("差が小さいときは行を出さない（差が大きいときだけ出す）", () => {
  const gap = measureBooksGap({ reports: [rep("2026-10-18")], asOf: "2026-11-01" });
  assert.deepEqual(cashBooksGapLines(gap, 500), []);
  assert.deepEqual(cashBooksGapLines(gap, null), []);
  const lines = cashBooksGapLines(gap, -250000);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes("10月18日"));
  assert.ok(lines[0].includes("14日前"));
  // 両方の向きを言う（売上なら金庫が多く、経費なら金庫が少なく見える）
  assert.ok(lines[1].includes("金庫のほうが多く"));
  assert.ok(lines[1].includes("金庫のほうが少なく"));
  // 言い切らない（休んだ日かもしれない）
  assert.ok(lines[1].includes("営業した日があれば"));
});

test("日報が1件も無いときは、空きを作らない", () => {
  const gap = measureBooksGap({ reports: [], asOf: "2026-11-01" });
  assert.deepEqual(gap, EMPTY_CASH_BOOKS_GAP);
  assert.deepEqual(cashBooksGapLines(gap, -250000), []);
});

test("比べる日より後の日報しか無いときは、空き0日として扱う", () => {
  const gap = measureBooksGap({ reports: [rep("2026-11-05")], asOf: "2026-11-01" });
  assert.equal(gap.days, 0);
  assert.equal(gap.wide, false);
});

test("おかしな日付の行は数えない", () => {
  const gap = measureBooksGap({
    reports: [rep("2026-10-18"), rep(""), rep("2026-13-99"), rep("2026-02-30")],
    asOf: "2026-11-01",
  });
  assert.equal(gap.count, 1);
  assert.equal(gap.lastDate, "2026-10-18");
});

test("外に出す形は、金額を1円も含まない", () => {
  const gap = measureBooksGap({ reports: [rep("2026-10-18")], asOf: "2026-11-01" });
  const w = buildCashBooksGapWindow({ gap, diff: -250000 });
  assert.equal(w.lastDate, "2026-10-18");
  assert.equal(w.days, 14);
  assert.equal(w.wide, true);
  assert.equal(w.shown, true);
  assert.ok(w.note.includes("10月18日"));
  // 金額（250000・250,000）はどこにも出さない
  const text = JSON.stringify(w);
  assert.ok(!text.includes("250000"));
  assert.ok(!text.includes("250,000"));
});

test("まだ数えていないとき（差が null）は、行は出ないが日付は外から読める", () => {
  const gap = measureBooksGap({ reports: [rep("2026-10-18")], asOf: "2026-11-01" });
  const w = buildCashBooksGapWindow({ gap, diff: null });
  assert.equal(w.shown, false);
  assert.equal(w.lastDate, "2026-10-18");
  assert.ok(w.note.includes("差が出ていないので"));
});

/**
 * ■ 2026-11-16（f1-4）：「空いた日は何日か」を1つの数字にそろえる
 *
 *   本番で、同じ1つのことに **2つの数字** が出ていました（2026-11-16 実測）：
 *     ・じゅんの一覧（/keiri のいちばん上）… 「この **10日** は お休みでした」
 *     ・同じ画面の用意の一言 …………………… 「日報が 11月5日 まで（そこから **11日**）」
 *   前者は じゅんが答える対象の日（11/6〜11/15）、後者は「何日前か」でした。
 *   答えるのは前者なので、画面に出す「空いています」は **missingDays** にそろえます。
 *   数える日そのもの（きょう）は、別に countDay（その日に出店の予定があるか）で見ます。
 */
test("空いた日の数は、数える日そのものを入れない（missingDays ＝ days − 1）", () => {
  const gap = measureBooksGap({ reports: [rep("2026-11-05")], asOf: "2026-11-16" });
  assert.equal(gap.days, 11); // 11月5日は「11日前」
  assert.equal(gap.missingDays, 10); // 11/6〜11/15 の10日が、まだ日報の無い日
});

test("前の日まで日報が入っていれば、空いた日は0日（数える日は空きに数えない）", () => {
  const gap = measureBooksGap({ reports: [rep("2026-11-15")], asOf: "2026-11-16" });
  assert.equal(gap.days, 1);
  assert.equal(gap.missingDays, 0);
  assert.equal(gap.wide, false);
});

test("日報が読めない日・日付が壊れている日は、空いた日も null のまま", () => {
  const none = measureBooksGap({ reports: [], asOf: "2026-11-16" });
  assert.equal(none.missingDays, null);
  const broken = measureBooksGap({ reports: [rep("2026-11-05")], asOf: "2026-13-99" });
  assert.equal(broken.missingDays, null);
  assert.equal(EMPTY_CASH_BOOKS_GAP.missingDays, null);
});

test("窓口のひとことも、空いた日の数（missingDays）で言う", () => {
  const gap = measureBooksGap({ reports: [rep("2026-11-05")], asOf: "2026-11-16" });
  const w = buildCashBooksGapWindow({ gap, diff: null });
  assert.equal(w.missingDays, 10);
  assert.ok(w.note.includes("そこから 10日 空いています"));
  assert.ok(!w.note.includes("11日"));
});
