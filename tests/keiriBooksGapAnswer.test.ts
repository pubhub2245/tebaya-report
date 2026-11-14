/**
 * 「日報が入っていない日は お休みだったか」の、じゅんの答えを固定する
 * （2026-11-14・f1-4）。**計算だけ**（倉庫は1行も読み書きしません）。
 *
 * ■ ここで守るもの
 *   ① 答えは「答えた日」だけに効く。1日でも外に出たら効かない（古い答えで黙って説明しない）
 *   ② 「お休みでした」なら 分からない所が消える＝金庫を数えれば合否が出る
 *   ③ 「営業した日があります」なら 今までどおり 分からない所のまま
 *   ④ いま memo に書いてある ひとこと は1文字も消えない（金庫の控えと並んでも壊れない）
 *   ⑤ こわれた控えは「答えが無い」に倒す（画面を止めない・勝手に合格にしない）
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBooksGapAnswer,
  booksGapQuestion,
  decodeBooksGapAnswer,
  encodeBooksGapAnswer,
  stripBooksGapAnswer,
  GAP_ANSWER_MEMO_BEGIN,
  GAP_ANSWER_MEMO_END,
} from "../lib/keiri/booksGapAnswer";
import {
  encodeCashCountMemo,
  decodeCashCountMemo,
  planCashCountNoteKeep,
  stripAllMemoBlocks,
} from "../lib/keiri/cashCountMemo";
import {
  measureCashDiffCoverage,
  openingExpensesPiece,
} from "../lib/keiri/cashDiffCoverage";
import { cashCountOk, buildCashCountReady } from "../lib/keiri/cashCountWindow";
import { buildSetupTodo } from "../lib/keiri/setupTodo";

const ORIGINAL = "2026/9/10 の金庫 145,000円 から数え始めています。";
const GAP = ["2026-11-06", "2026-11-07", "2026-11-08"];

/* ------------------------------------------------------------------ */
/* 控える・読み返す                                                    */
/* ------------------------------------------------------------------ */

test("答えを控えて、そのまま読み返せる", () => {
  const next = encodeBooksGapAnswer(ORIGINAL, {
    from: "2026-11-06",
    to: "2026-11-08",
    answer: "holiday",
    answered_at: "2026-11-14T09:00:00.000Z",
  });
  assert.ok(next);
  const got = decodeBooksGapAnswer(next);
  assert.deepEqual(got, {
    from: "2026-11-06",
    to: "2026-11-08",
    answer: "holiday",
    answered_at: "2026-11-14T09:00:00.000Z",
  });
});

test("いま書いてある ひとこと は1文字も消えない", () => {
  const next = encodeBooksGapAnswer(ORIGINAL, {
    from: "2026-11-06",
    to: "2026-11-08",
    answer: "holiday",
  });
  assert.ok(next);
  assert.equal(stripBooksGapAnswer(next), ORIGINAL);
});

test("答え直すと、いちばん新しい1件だけが残る", () => {
  const first = encodeBooksGapAnswer(ORIGINAL, {
    from: "2026-11-06",
    to: "2026-11-08",
    answer: "holiday",
  });
  const second = encodeBooksGapAnswer(first, {
    from: "2026-11-06",
    to: "2026-11-09",
    answer: "operated",
  });
  assert.ok(second);
  assert.equal(decodeBooksGapAnswer(second)?.answer, "operated");
  assert.equal(decodeBooksGapAnswer(second)?.to, "2026-11-09");
  assert.equal(stripBooksGapAnswer(second), ORIGINAL);
  // 印は1組だけ
  assert.equal(second.split(GAP_ANSWER_MEMO_BEGIN).length - 1, 1);
  assert.equal(second.split(GAP_ANSWER_MEMO_END).length - 1, 1);
});

test("金庫の控えと同じ欄に並んでも、お互いを壊さない", () => {
  const withAnswer = encodeBooksGapAnswer(ORIGINAL, {
    from: "2026-11-06",
    to: "2026-11-08",
    answer: "holiday",
  });
  const both = encodeCashCountMemo(withAnswer, {
    happened_on: "2026-11-14",
    amount: 145000,
    note: null,
    saved_at: "2026-11-14T09:30:00.000Z",
  });
  assert.ok(both);
  assert.equal(decodeCashCountMemo(both).length, 1);
  assert.equal(decodeBooksGapAnswer(both)?.answer, "holiday");
  // どちらを外しても、じゅんの文は残る
  assert.equal(stripAllMemoBlocks(both), ORIGINAL);
});

test("ひとことの文字数は、控えが増えても じゅんの文のぶんだけ", () => {
  const withAnswer = encodeBooksGapAnswer(ORIGINAL, {
    from: "2026-11-06",
    to: "2026-11-08",
    answer: "holiday",
  });
  const plan = planCashCountNoteKeep(withAnswer);
  assert.equal(plan.has, true);
  assert.equal(plan.chars, ORIGINAL.length);
  assert.equal(plan.keptExactly, true);
});

test("こわれた控え・おかしな日付は「答えが無い」に倒す", () => {
  assert.equal(decodeBooksGapAnswer(null), null);
  assert.equal(decodeBooksGapAnswer(ORIGINAL), null);
  assert.equal(
    decodeBooksGapAnswer(`${GAP_ANSWER_MEMO_BEGIN}\nこわれた\n${GAP_ANSWER_MEMO_END}`),
    null,
  );
  assert.equal(
    decodeBooksGapAnswer(
      `${GAP_ANSWER_MEMO_BEGIN}\n{"from":"x","to":"y","answer":"holiday"}\n${GAP_ANSWER_MEMO_END}`,
    ),
    null,
  );
  // 知らない答えは受け取らない
  assert.equal(
    decodeBooksGapAnswer(
      `${GAP_ANSWER_MEMO_BEGIN}\n{"from":"2026-11-06","to":"2026-11-08","answer":"maybe"}\n${GAP_ANSWER_MEMO_END}`,
    ),
    null,
  );
  // 逆さまの範囲は控えない
  assert.equal(
    encodeBooksGapAnswer(null, { from: "2026-11-08", to: "2026-11-06", answer: "holiday" }),
    null,
  );
});

/* ------------------------------------------------------------------ */
/* 当てはめ（ここが「黙って嘘の合格」を止める所）                      */
/* ------------------------------------------------------------------ */

test("答えた日を ぜんぶ覆っていれば効く", () => {
  const use = applyBooksGapAnswer({
    gapDates: GAP,
    saved: { from: "2026-11-06", to: "2026-11-08", answer: "holiday", answered_at: "" },
  });
  assert.equal(use.covers, true);
  assert.equal(use.holidaysOnly, true);
  assert.equal(use.operated, false);
  assert.match(use.line ?? "", /お休みでした/);
});

test("1日でも外に出たら効かない（古い答えで黙って説明しない）", () => {
  const use = applyBooksGapAnswer({
    gapDates: [...GAP, "2026-11-09"],
    saved: { from: "2026-11-06", to: "2026-11-08", answer: "holiday", answered_at: "" },
  });
  assert.equal(use.covers, false);
  assert.equal(use.holidaysOnly, false);
  assert.match(use.line ?? "", /もう一度 答えて/);
});

test("「営業した日があります」は、分からない所のまま", () => {
  const use = applyBooksGapAnswer({
    gapDates: GAP,
    saved: { from: "2026-11-06", to: "2026-11-08", answer: "operated", answered_at: "" },
  });
  assert.equal(use.covers, true);
  assert.equal(use.holidaysOnly, false);
  assert.equal(use.operated, true);
  assert.match(use.line ?? "", /先にその日報を入れて/);
});

test("答えが無ければ、今までどおり何も言わない", () => {
  const use = applyBooksGapAnswer({ gapDates: GAP, saved: null });
  assert.equal(use.has, false);
  assert.equal(use.holidaysOnly, false);
  assert.equal(use.line, null);
  assert.match(booksGapQuestion(GAP) ?? "", /お休みでしたか/);
  assert.equal(booksGapQuestion([]), null);
});

/* ------------------------------------------------------------------ */
/* f1-4 の合否に、ちゃんと効くか（ここがこの一手の目的）               */
/* ------------------------------------------------------------------ */

/** 名前が付いた分が「0円〜20,000円」で、差が 50,000円 出ている日 */
const PIECES = [openingExpensesPiece({ count: 4, total: 20000 }, true)];

test("答えが無いと、数えても合否が出ない（いまの本番と同じ）", () => {
  const c = measureCashDiffCoverage({
    diff: 50000,
    pieces: PIECES,
    unknown: ["日報がまだ入っていない日"],
  });
  assert.equal(c.covered, null);
  assert.equal(cashCountOk({ verdict: "合っていない", covered: c.covered }).ok, null);
});

test("「お休みでした」と答えると、同じ1分で合否が出る", () => {
  const use = applyBooksGapAnswer({
    gapDates: GAP,
    saved: { from: "2026-11-06", to: "2026-11-08", answer: "holiday", answered_at: "" },
  });
  const c = measureCashDiffCoverage({
    diff: 50000,
    pieces: PIECES,
    unknown: use.holidaysOnly ? [] : ["日報がまだ入っていない日"],
  });
  // 名前の付いた分（最大20,000円）では 50,000円 を説明しきれない＝はっきり「合っていない」
  assert.equal(c.covered, false);
  assert.equal(cashCountOk({ verdict: "合っていない", covered: c.covered }).ok, false);
});

test("「お休みでした」と答えて、差が名前の付いた分に収まれば 合格 側", () => {
  const use = applyBooksGapAnswer({
    gapDates: GAP,
    saved: { from: "2026-11-06", to: "2026-11-08", answer: "holiday", answered_at: "" },
  });
  const c = measureCashDiffCoverage({
    diff: 12000,
    pieces: PIECES,
    unknown: use.holidaysOnly ? [] : ["日報がまだ入っていない日"],
  });
  assert.equal(c.covered, true);
  assert.equal(cashCountOk({ verdict: "合っていない", covered: c.covered }).ok, true);
});

test("押す前の一言も、答えたとおりに変わる（答えが無ければ今までどおり）", () => {
  const variants = [{ key: "nowScreen", label: "いまの画面の金額" }];
  const booksGap = { wide: true, lastDate: "2026-11-05", count: 30, days: 9 } as any;
  const before = buildCashCountReady({ variants, registerFloatOn: null, booksGap });
  assert.match(before.line, /日報が 11月5日 までしか入っていません/);
  assert.equal(before.gapIsHolidaysOnly, false);

  const after = buildCashCountReady({
    variants,
    registerFloatOn: null,
    booksGap,
    gapAnswer: { holidaysOnly: true, operated: false, line: "この3日は お休みでした。" },
  });
  assert.match(after.line, /お休みでした/);
  assert.match(after.line, /いま数えていただいて大丈夫です/);
  assert.equal(after.gapIsHolidaysOnly, true);

  const operated = buildCashCountReady({
    variants,
    registerFloatOn: null,
    booksGap,
    gapAnswer: {
      holidaysOnly: false,
      operated: true,
      line: "営業した日があります。先にその日報を入れてから数えてください。",
    },
  });
  assert.match(operated.line, /先にその日報を入れて/);
  assert.equal(operated.gapIsHolidaysOnly, false);
});

/* ------------------------------------------------------------------ */
/* じゅんの一覧（/keiri のいちばん上）とも食い違わないこと             */
/* ------------------------------------------------------------------ */

test("空きの答えがまだなら、じゅんの一覧も「先にこれを押す」と言う", () => {
  const common = {
    shelves: { done: 1, total: 13, unknown: 0 },
    key: { configured: true, usable: false },
    photo: { bucketPublic: true, keyUsable: false },
    leak: null,
  };
  const before = buildSetupTodo({
    ...common,
    cash: { shelfMissing: true, counted: false, countedInMemo: false },
  });
  const cashBefore = before.items.find((i) => i.id === "cash");
  assert.ok(cashBefore);
  assert.equal(cashBefore.presses?.length, 1);
  assert.doesNotMatch(cashBefore.detail ?? "", /お休みでした/);

  const after = buildSetupTodo({
    ...common,
    cash: {
      shelfMissing: true,
      counted: false,
      countedInMemo: false,
      gapQuestionOpen: true,
      gapQuestionDays: 8,
    },
  });
  const cashAfter = after.items.find((i) => i.id === "cash");
  assert.ok(cashAfter);
  // 押すのは2つ（空きの答え → 金額を比べる）。1回だけ、とは言わない
  assert.equal(cashAfter.presses?.length, 2);
  assert.match(cashAfter.presses?.[0] ?? "", /お休みでした/);
  assert.match(cashAfter.detail ?? "", /8日/);
  assert.match(cashAfter.detail ?? "", /いまは言えません/);
});

test("読めなかった日は、空きの答えを「無い」ことにしない", () => {
  // 窓口が読めなかったときは gapQuestionOpen を渡さない＝今までどおり1押し
  const todo = buildSetupTodo({
    shelves: { done: 1, total: 13, unknown: 0 },
    key: { configured: true, usable: false },
    photo: { bucketPublic: true, keyUsable: false },
    leak: null,
    cash: { shelfMissing: true, counted: false, countedInMemo: false },
  });
  const cash = todo.items.find((i) => i.id === "cash");
  assert.equal(cash?.presses?.length, 1);
});
