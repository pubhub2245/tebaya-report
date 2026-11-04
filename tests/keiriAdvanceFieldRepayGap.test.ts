import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildFieldRepayGapWindow,
  EMPTY_FIELD_REPAY_GAP,
  fieldRepayFit,
  fieldRepayGapLines,
  fieldRepayGapNotice,
  measureFieldRepayGap,
} from "../lib/keiri/advanceFieldRepayGap";
import type { KeiriAdvance } from "../lib/keiri/types";

/**
 * 「現場スタッフの立替をお返しした分」の決まりを固定する（2026-11-04・f1-4）。
 *
 * ■ ここで守りたいこと
 *   ① 読めなかったのを「0件」と取り違えない
 *   ② 経営側の立替（返した日が分かる方）は、ここでは数えない
 *   ③ 数え始めの日より前・数えた日より後は数えない
 *   ④ 「お返し済み」と決めつけず、説明は上限（合計）の中かどうかまでにする
 *   ⑤ 金庫のほうが多い側（マイナスの差）では、この分の話をしない
 *   ⑥ 差が小さいときは行を出さない
 *   ⑦ ここは説明の行を作るだけで、金額は1円も直さない
 */

function field(date: string, amount: number, extra: Partial<KeiriAdvance> = {}): KeiriAdvance {
  return {
    date,
    amount,
    description: "仕入",
    payer: "イデ",
    settled: false,
    settledDate: null,
    source: "field",
    ...extra,
  };
}

function owner(date: string, amount: number, extra: Partial<KeiriAdvance> = {}): KeiriAdvance {
  return {
    date,
    amount,
    description: "仕入",
    payer: "じゅん",
    settled: true,
    settledDate: date,
    source: "owner",
    ...extra,
  };
}

const OPENING = "2026-09-10";
const AS_OF = "2026-10-31";

test("①読めなかったときは『0件』と言わない", () => {
  const gap = measureFieldRepayGap({
    advances: null,
    openingDate: OPENING,
    asOf: AS_OF,
  });
  assert.deepEqual(gap, EMPTY_FIELD_REPAY_GAP);
  assert.equal(gap.readable, false);

  const unreadable = measureFieldRepayGap({
    advances: [field("2026-09-20", 5000)],
    unreadable: true,
    openingDate: OPENING,
    asOf: AS_OF,
  });
  assert.equal(unreadable.readable, false);
  assert.equal(unreadable.rows, 0);
  // 読めていないのだから、説明の行も一言も出さない
  assert.deepEqual(fieldRepayGapLines(unreadable, 5000), []);
  assert.equal(fieldRepayGapNotice(unreadable), "");
  assert.equal(buildFieldRepayGapWindow({ gap: unreadable, diff: 5000 }).shown, false);
});

test("②経営側の立替は数えない（返した日で画面がもう引いている）", () => {
  const gap = measureFieldRepayGap({
    advances: [owner("2026-09-20", 50000), field("2026-09-21", 3000)],
    openingDate: OPENING,
    asOf: AS_OF,
  });
  assert.equal(gap.readable, true);
  assert.equal(gap.rows, 1);
  assert.equal(gap.total, 3000);
});

test("③数え始めの日より前・数えた日より後は数えない", () => {
  const gap = measureFieldRepayGap({
    advances: [
      field("2026-09-09", 1000), // 数え始めの前
      field("2026-09-10", 2000), // 数え始めの日そのものは数える
      field("2026-10-31", 4000), // 数えた日そのものは数える
      field("2026-11-01", 8000), // 数えた日より後
      field("2026-10-05", 0), // 0円は行を増やさない
      field("2026-10-06", 5000, { skipReason: "外注手数料はここでは数えません" }),
    ],
    openingDate: OPENING,
    asOf: AS_OF,
  });
  assert.equal(gap.rows, 2);
  assert.equal(gap.total, 6000);
  assert.equal(gap.firstDate, "2026-09-10");
  assert.equal(gap.lastDate, "2026-10-31");
});

test("④ぴったり・ほぼ・上限の中・それ以上 を言い分ける", () => {
  const gap = measureFieldRepayGap({
    advances: [field("2026-09-20", 10000), field("2026-09-21", 10000)],
    openingDate: OPENING,
    asOf: AS_OF,
  });
  assert.equal(gap.total, 20000);
  assert.equal(fieldRepayFit(gap, 20000), "exact");
  assert.equal(fieldRepayFit(gap, 19500), "near");
  assert.equal(fieldRepayFit(gap, 20500), "near");
  assert.equal(fieldRepayFit(gap, 12000), "within");
  assert.equal(fieldRepayFit(gap, 40000), "no");

  // 「お返し済み」と決めつけない＝上限の中のときは「確かめてください」までにする
  const within = fieldRepayGapLines(gap, 12000);
  assert.equal(within.length, 3);
  assert.match(within[2], /収まります/);
  assert.doesNotMatch(within.join(""), /お返し済み|返しました/);

  const over = fieldRepayGapLines(gap, 40000);
  assert.match(over[2], /この分だけでは説明がつきません/);
});

test("⑤金庫のほうが多い側（マイナスの差）では、この分の話をしない", () => {
  const gap = measureFieldRepayGap({
    advances: [field("2026-09-20", 10000)],
    openingDate: OPENING,
    asOf: AS_OF,
  });
  assert.equal(fieldRepayFit(gap, -10000), "no");
  assert.deepEqual(fieldRepayGapLines(gap, -10000), []);
  const w = buildFieldRepayGapWindow({ gap, diff: -10000 });
  assert.equal(w.shown, false);
  assert.match(w.note, /金庫のほうが多い側/);
});

test("⑥差が1,000円より小さいときは行を出さない（一言だけは押す前に出す）", () => {
  const gap = measureFieldRepayGap({
    advances: [field("2026-09-20", 10000)],
    openingDate: OPENING,
    asOf: AS_OF,
  });
  assert.deepEqual(fieldRepayGapLines(gap, 0), []);
  assert.deepEqual(fieldRepayGapLines(gap, 999), []);
  assert.equal(fieldRepayGapLines(gap, 1000).length, 3);
  // 押す前の一言は、差がまだ無くても出す（数えたあとでは1分が戻らないため）
  assert.match(fieldRepayGapNotice(gap), /計算上の現金からは引いていません/);
  assert.equal(buildFieldRepayGapWindow({ gap, diff: null }).shown, false);
});

test("⑦1件も無い月は、行も一言も出さない", () => {
  const gap = measureFieldRepayGap({
    advances: [owner("2026-09-20", 50000)],
    openingDate: OPENING,
    asOf: AS_OF,
  });
  assert.equal(gap.readable, true);
  assert.equal(gap.rows, 0);
  assert.deepEqual(fieldRepayGapLines(gap, 50000), []);
  assert.equal(fieldRepayGapNotice(gap), "");
  const w = buildFieldRepayGapWindow({ gap, diff: 50000 });
  assert.equal(w.shown, false);
  assert.match(w.note, /1件も入っていません/);
});

test("⑧外から読む窓口は、本物の金額を1円も返さない", () => {
  const gap = measureFieldRepayGap({
    advances: [field("2026-09-20", 12345), field("2026-10-02", 67890)],
    openingDate: OPENING,
    asOf: AS_OF,
  });
  const w = buildFieldRepayGapWindow({ gap, diff: 80235 });
  assert.equal(w.fit, "exact");
  assert.equal(w.shown, true);
  assert.equal(w.rows, 2);
  const text = JSON.stringify(w);
  for (const yen of ["12345", "67890", "80235", "12,345", "67,890", "80,235"]) {
    assert.ok(!text.includes(yen), `窓口に金額 ${yen} が入っています`);
  }
});
