/**
 * 「同じ支払いなので こちらは数えない」と決めた印を、置き場ができるまでのあいだ
 * 経理の設定のひとこと欄に控えるところの試験（2026-10-22・kp230・f1-5）。
 *
 * ここで縛っていること：
 *  ① いま書いてあるひとことは消さない（印ごと外せば元の文がそのまま戻る）
 *  ② 金庫の控えと同じ欄に並んでも、お互いを壊さない
 *  ③ 棚のほうが正（同じ行を指す印が両方にあるときは棚を使う）
 *  ④ 元に戻すときは印を消さず、効かなくするだけ
 *  ⑤ 控えから読んだ印でも、月の経費が棚と同じように減る（画面・CSV・1枚が同じ数字）
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  addIgnoreWritesToMemo,
  decodeExpenseIgnoreMemo,
  encodeExpenseIgnoreMemo,
  IGNORE_MEMO_MAX_ROWS,
  ignoreStoreOf,
  mergeIgnoreRows,
  stripExpenseIgnoreMemo,
  undoIgnoresInMemo,
} from "../lib/keiri/expenseIgnoreMemo";
import {
  BOTH_COUNT_REASON,
  BOTH_COUNT_UNDONE_REASON,
  IGNORE_REASON,
  readIgnoreMarks,
  writesForChoice,
  type ExpenseIgnoreRow,
  type IgnoreWrite,
} from "../lib/keiri/expenseIgnores";
import {
  decodeCashCountMemo,
  encodeCashCountMemo,
} from "../lib/keiri/cashCountMemo";
import { summarizeMonth } from "../lib/keiri/aggregate";
import { TEBAYA_TEMPLATE } from "../lib/keiri/templates/tebaya";
import type { KeiriAdvance, KeiriReport, KeiriSettings } from "../lib/keiri/types";

const SUSPECT = {
  amount: 12000,
  sameMonth: true,
  report: { date: "2026-09-12", id: 101, lineIndex: 1 },
  advance: { date: "2026-09-12", id: 55, source: "field" as const },
};

function writes(choice: "count-report" | "count-advance" | "both"): IgnoreWrite[] {
  return writesForChoice(SUSPECT, choice, new Date("2026-09-30T00:00:00.000Z"));
}

test("ひとことは消さない：印ごと外すと元の文だけが戻る", () => {
  const before = "9月から数え始めています。";
  const next = addIgnoreWritesToMemo(before, writes("count-report"));
  assert.ok(next && next.includes(before));
  assert.equal(stripExpenseIgnoreMemo(next), before);
});

test("控えに書いた印を、そのまま読み返せる", () => {
  const next = addIgnoreWritesToMemo(null, writes("count-report"));
  const rows = decodeExpenseIgnoreMemo(next);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "advance_field");
  assert.equal(String(rows[0].ref_id), "55");
  assert.equal(rows[0].amount, 12000);
  assert.equal(rows[0].reason, IGNORE_REASON);
  assert.equal(rows[0].undone_at ?? null, null);
});

test("金庫の控えと同じ欄に並んでも、お互いを壊さない", () => {
  const withIgnore = addIgnoreWritesToMemo("もとの文", writes("count-advance"));
  const both = encodeCashCountMemo(withIgnore, {
    happened_on: "2026-10-22",
    amount: 1004399,
    note: null,
    saved_at: "2026-10-22T04:00:00.000Z",
  });
  assert.ok(both);
  // 金庫の1回も、数えない印も、どちらも読める
  assert.equal(decodeCashCountMemo(both).length, 1);
  assert.equal(decodeExpenseIgnoreMemo(both).length, 1);
  // どちらを外しても、元の文は残る
  assert.ok(stripExpenseIgnoreMemo(both).includes("もとの文"));
});

test("押し替えても、両方 数えないことにならない（経費が二重に減らない）", () => {
  const pair = [
    { source: "report" as const, ref_id: "101", line_index: 1 },
    { source: "advance_field" as const, ref_id: "55", line_index: null },
  ];
  // ① 日報のほうだけ数える（＝立て替えの印が効く）
  const first = addIgnoreWritesToMemo(null, writes("count-report"), pair);
  // ② 押し替えて、立て替えのほうだけ数える（＝日報の印が効く）
  const second = addIgnoreWritesToMemo(first, writes("count-advance"), pair);
  const rows = decodeExpenseIgnoreMemo(second);
  const marks = readIgnoreMarks(rows);
  // 効いている印は1つだけ（日報の側）。立て替えの印は残っているが効いていない
  assert.equal(marks.ignored.size, 1);
  assert.ok(marks.ignored.has("report|101|1"));
});

test("棚のほうが正：同じ行を指す印が両方にあれば棚を使う", () => {
  const memoRows = decodeExpenseIgnoreMemo(addIgnoreWritesToMemo(null, writes("count-report")));
  const shelfRows: ExpenseIgnoreRow[] = [
    {
      id: 7,
      source: "advance_field",
      ref_id: 55,
      line_index: null,
      amount: 12000,
      paid_on: "2026-09-12",
      reason: IGNORE_REASON,
      // 棚では「元に戻した」ことになっている
      undone_at: "2026-10-01T00:00:00.000Z",
    },
  ];
  const merged = mergeIgnoreRows(shelfRows, memoRows);
  assert.equal(merged.length, 1);
  const marks = readIgnoreMarks(merged);
  // 棚で戻してあるので、数えない印は効かない
  assert.equal(marks.ignored.size, 0);
});

test("棚に無い印だけ、控えから足す（貼り紙より前に決めた分が消えない）", () => {
  const memoRows = decodeExpenseIgnoreMemo(addIgnoreWritesToMemo(null, writes("count-report")));
  const merged = mergeIgnoreRows([], memoRows);
  assert.equal(merged.length, 1);
  assert.equal(readIgnoreMarks(merged).ignored.size, 1);
});

test("元に戻す：印は消さず、効かなくするだけ", () => {
  const memo = addIgnoreWritesToMemo(null, writes("count-report"));
  const undone = undoIgnoresInMemo(
    memo,
    [{ source: "advance_field", ref_id: "55", line_index: null }],
    new Date("2026-10-22T04:00:00.000Z"),
  );
  assert.equal(undone.changed, 1);
  const rows = decodeExpenseIgnoreMemo(undone.memo);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].undone_at, "2026-10-22T04:00:00.000Z");
  assert.equal(readIgnoreMarks(rows).ignored.size, 0);
});

test("元に戻す：『両方数える』は理由に（元に戻しました）が付く", () => {
  const memo = addIgnoreWritesToMemo(null, writes("both"));
  assert.equal(decodeExpenseIgnoreMemo(memo)[0].reason, BOTH_COUNT_REASON);
  const undone = undoIgnoresInMemo(
    memo,
    [{ source: "report", ref_id: "101", line_index: 1 }],
    new Date("2026-10-22T04:00:00.000Z"),
  );
  assert.equal(undone.changed, 1);
  assert.equal(decodeExpenseIgnoreMemo(undone.memo)[0].reason, BOTH_COUNT_UNDONE_REASON);
});

test("見つからない印を戻そうとしたら、何も変えずに0件と答える", () => {
  const memo = addIgnoreWritesToMemo(null, writes("count-report"));
  const undone = undoIgnoresInMemo(memo, [
    { source: "report", ref_id: "999", line_index: 0 },
  ]);
  assert.equal(undone.changed, 0);
  assert.equal(undone.memo, null);
});

test("読めない行は読み飛ばす（その組はまた画面に出る＝黙って経費が減らない）", () => {
  const broken = [
    "［数えない印の控え v1 ここから］",
    '{"source":"report","ref_id":"","line_index":0,"amount":1,"paid_on":null,"reason":"x","undone_at":null}',
    "これは JSON ではありません",
    "［数えない印の控え v1 ここまで］",
  ].join("\n");
  assert.deepEqual(decodeExpenseIgnoreMemo(broken), []);
});

test("印が0件なら、挟み込みごと外した文になる（空の控えを残さない）", () => {
  const memo = addIgnoreWritesToMemo("もとの文", writes("count-report"));
  assert.equal(encodeExpenseIgnoreMemo(memo, []), "もとの文");
});

test("上限を超える数は控えない（黙って切り捨てない）", () => {
  const many: ExpenseIgnoreRow[] = Array.from({ length: IGNORE_MEMO_MAX_ROWS + 1 }, (_, i) => ({
    id: null,
    source: "report",
    ref_id: String(i + 1),
    line_index: 0,
    amount: 100,
    paid_on: "2026-09-01",
    reason: IGNORE_REASON,
    undone_at: null,
  }));
  assert.equal(encodeExpenseIgnoreMemo(null, many), null);
});

test("どこに残すか：棚があれば棚／無ければ控え／設定の行が無ければ残せない", () => {
  assert.equal(ignoreStoreOf({ shelf: "ready", settingsRowExists: true }), "shelf");
  assert.equal(ignoreStoreOf({ shelf: "ready", settingsRowExists: false }), "shelf");
  assert.equal(ignoreStoreOf({ shelf: "missing", settingsRowExists: true }), "memo");
  assert.equal(ignoreStoreOf({ shelf: "missing", settingsRowExists: false }), "none");
  assert.equal(ignoreStoreOf({ shelf: "unknown", settingsRowExists: true }), "none");
});

/* ------------------------------------------------------------------ *
 *  控えから読んだ印でも、月の経費が棚と同じように減る
 * ------------------------------------------------------------------ */

const SETTINGS: KeiriSettings = {
  opening_date: "2026-09-01",
  opening_balance: 0,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

const REPORTS: KeiriReport[] = [
  {
    id: 101,
    date: "2026-09-12",
    shop: "手羽屋",
    sales_amount: 50000,
    labor: 0,
    expenses: [
      { description: "肉代", amount: 8000 },
      { description: "場代", amount: 12000 },
    ],
  } as unknown as KeiriReport,
];

const ADVANCES: KeiriAdvance[] = [
  {
    id: 55,
    source: "field",
    date: "2026-09-12",
    amount: 12000,
    description: "場代",
    settled: false,
  } as unknown as KeiriAdvance,
];

function expenseTotalWith(rows: ExpenseIgnoreRow[]): number {
  return summarizeMonth({
    ym: "2026-09",
    reports: REPORTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: ADVANCES,
    ignoreMarks: readIgnoreMarks(rows),
  }).expenseTotal;
}

test("控えの印でも、棚と1円まで同じだけ経費が減る", () => {
  // 印なし＝日報の場代 12,000 と 立替の場代 12,000 の両方が入る
  const none = expenseTotalWith([]);
  assert.equal(none, 8000 + 12000 + 12000);

  // 棚に置いた印
  const shelfRows: ExpenseIgnoreRow[] = [
    {
      id: 1,
      source: "advance_field",
      ref_id: 55,
      line_index: null,
      amount: 12000,
      paid_on: "2026-09-12",
      reason: IGNORE_REASON,
      undone_at: null,
    },
  ];
  // 控えに置いた同じ印
  const memoRows = decodeExpenseIgnoreMemo(addIgnoreWritesToMemo(null, writes("count-report")));

  assert.equal(expenseTotalWith(shelfRows), none - 12000);
  assert.equal(expenseTotalWith(memoRows), expenseTotalWith(shelfRows));
});

test("印が1つも無ければ、経費は1円も変わらない", () => {
  assert.equal(expenseTotalWith(mergeIgnoreRows([], decodeExpenseIgnoreMemo(null))), 32000);
});
