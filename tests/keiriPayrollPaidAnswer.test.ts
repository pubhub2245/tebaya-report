/**
 * 「払った記録が無い日当を、もう金庫からお渡ししましたか」の答えを固定する試験
 * （2026-11-15・f1-4）。
 *
 * ここで守りたいのは6つです：
 *   ① 答えが無いときは、今までと1文字も変わらないこと（0円〜その額の幅のまま）
 *   ② 答えは、いまの日当を**ぜんぶ覆っているときだけ**効くこと
 *   ③ 「もうお渡しした」なら幅ではなく**その額ちょうど**になること
 *   ④ 「まだお渡ししていない」なら、差の心当たりから**外れる**こと
 *   ⑤ えらばなければ何も控えないこと（こちらで答えを作らない）
 *   ⑥ いま memo に書いてある ひとこと を1文字も消さないこと
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyPayrollPaidAnswer,
  buildPayrollPaidAnswerWindow,
  decodePayrollPaidAnswer,
  encodePayrollPaidAnswer,
  payrollPaidQuestion,
  payrollPickNeeded,
  planPayrollPaidPick,
  stripPayrollPaidAnswer,
  NO_PAYROLL_PAID_ANSWER,
  type PayrollSpan,
} from "../lib/keiri/payrollPaidAnswer";
import {
  measureCashDiffCoverage,
  unpaidPayrollPiece,
} from "../lib/keiri/cashDiffCoverage";
import { stripAllMemoBlocks } from "../lib/keiri/cashCountMemo";

/** 本番と同じ形（9/12〜10/31・21件・243,000円） */
const SPAN: PayrollSpan = {
  readable: true,
  rows: 21,
  unpaid: 243000,
  firstDate: "2026-09-12",
  lastDate: "2026-10-31",
};

test("答えが無ければ、今までどおり 0円〜その額 の幅のまま", () => {
  const use = applyPayrollPaidAnswer({ span: SPAN, saved: null });
  assert.deepEqual(use, NO_PAYROLL_PAID_ANSWER);
  const piece = unpaidPayrollPiece(SPAN, use);
  assert.equal(piece.lo, 0);
  assert.equal(piece.hi, 243000);
  assert.equal(piece.rows, 21);
  // 答えを渡さない呼び方（今までの呼び方）でも同じ
  const old = unpaidPayrollPiece(SPAN);
  assert.equal(old.lo, 0);
  assert.equal(old.hi, 243000);
});

test("「もうお渡しした」なら、幅ではなく その額ちょうど になる", () => {
  const saved = { from: "2026-09-12", to: "2026-10-31", answer: "handed" as const, answered_at: "" };
  const use = applyPayrollPaidAnswer({ span: SPAN, saved });
  assert.equal(use.covers, true);
  assert.equal(use.handed, true);
  const piece = unpaidPayrollPiece(SPAN, use);
  assert.equal(piece.lo, 243000);
  assert.equal(piece.hi, 243000);
});

test("「まだお渡ししていない」なら、差の心当たりから外れる", () => {
  const saved = { from: "2026-09-12", to: "2026-10-31", answer: "notyet" as const, answered_at: "" };
  const use = applyPayrollPaidAnswer({ span: SPAN, saved });
  assert.equal(use.notYet, true);
  const piece = unpaidPayrollPiece(SPAN, use);
  assert.equal(piece.rows, 0);
  assert.equal(piece.hi, 0);
  // 心当たりの名前にも出てこない（読めてはいるので「読めていない所」にも入らない）
  const c = measureCashDiffCoverage({ diff: 50000, pieces: [piece] });
  assert.deepEqual(c.namedLabels, []);
  assert.deepEqual(c.unknownLabels, []);
  assert.equal(c.covered, false);
});

test("答えの範囲からはみ出した日当には効かせない（また幅に戻る）", () => {
  const saved = { from: "2026-09-12", to: "2026-10-31", answer: "handed" as const, answered_at: "" };
  const wider: PayrollSpan = { ...SPAN, rows: 22, unpaid: 255000, lastDate: "2026-11-05" };
  const use = applyPayrollPaidAnswer({ span: wider, saved });
  assert.equal(use.has, true);
  assert.equal(use.covers, false);
  assert.equal(use.handed, false);
  assert.match(String(use.line), /もう一度 答えて/);
  const piece = unpaidPayrollPiece(wider, use);
  assert.equal(piece.lo, 0);
  assert.equal(piece.hi, 255000);
});

test("幅のままだと、どんな差でも『説明がつく範囲』になってしまう（答えると意味を持つ）", () => {
  const wide = unpaidPayrollPiece(SPAN, null);
  const anyDiff = measureCashDiffCoverage({ diff: 7000, pieces: [wide] });
  assert.equal(anyDiff.covered, true); // ← 7,000円でも「収まっている」
  const notYet = unpaidPayrollPiece(SPAN, {
    covers: true,
    handed: false,
    notYet: true,
  });
  const answered = measureCashDiffCoverage({ diff: 7000, pieces: [notYet] });
  assert.equal(answered.covered, false); // ← 答えると、ちゃんと「はみ出た」と言える
});

test("えらばなければ何も控えない（こちらで答えを作らない）", () => {
  const plan = planPayrollPaidPick({
    span: SPAN,
    pick: null,
    current: NO_PAYROLL_PAID_ANSWER,
  });
  assert.equal(plan.save, false);
  assert.equal(plan.answer, null);
  // 急かさない（えらばない道も正しい道なので、警告の行を出さない）
  assert.equal(plan.note, null);
});

test("同じ答えがもう効いていれば、控え直さない", () => {
  const saved = { from: "2026-09-12", to: "2026-10-31", answer: "handed" as const, answered_at: "" };
  const current = applyPayrollPaidAnswer({ span: SPAN, saved });
  const plan = planPayrollPaidPick({ span: SPAN, pick: "handed", current });
  assert.equal(plan.save, false);
  assert.match(String(plan.note), /もう控えてあります/);
  assert.equal(payrollPickNeeded({ span: SPAN, current }), false);
});

test("日当が無い・読めない日は、何も聞かない", () => {
  const none: PayrollSpan = { readable: true, rows: 0, unpaid: 0, firstDate: null, lastDate: null };
  assert.equal(payrollPickNeeded({ span: none, current: NO_PAYROLL_PAID_ANSWER }), false);
  assert.equal(payrollPaidQuestion(none), null);
  const unreadable: PayrollSpan = { ...SPAN, readable: false };
  assert.equal(payrollPickNeeded({ span: unreadable, current: NO_PAYROLL_PAID_ANSWER }), false);
});

test("控えても、いま書いてある ひとこと は1文字も消えない", () => {
  const memo = "9月は台風で3日 休みました。";
  const next = encodePayrollPaidAnswer(memo, {
    from: "2026-09-12",
    to: "2026-10-31",
    answer: "handed",
    answered_at: "2026-11-15T09:00:00.000Z",
  });
  assert.ok(next !== null);
  assert.ok(String(next).includes(memo));
  assert.equal(stripPayrollPaidAnswer(next), memo);
  // 金庫の画面が見る「ひとことだけ」も、元のまま
  assert.equal(stripAllMemoBlocks(next), memo);
  const back = decodePayrollPaidAnswer(next);
  assert.equal(back?.answer, "handed");
  assert.equal(back?.from, "2026-09-12");
  assert.equal(back?.to, "2026-10-31");
});

test("日付がおかしいときは控えない（黙って直さない）", () => {
  assert.equal(
    encodePayrollPaidAnswer(null, { from: "2026-10-31", to: "2026-09-12", answer: "handed" }),
    null,
  );
  assert.equal(encodePayrollPaidAnswer(null, { from: "ことし", to: "2026-09-12", answer: "handed" }), null);
  // 中身が壊れていても例外を投げず null（画面が丸ごと開かなくならないように）
  assert.equal(decodePayrollPaidAnswer("［日当をお渡ししたかの答え v1 ここから］\n{こわれ"), null);
  assert.equal(decodePayrollPaidAnswer(null), null);
});

test("外から確かめる窓口は、金額を1円も返さない", () => {
  const saved = { from: "2026-09-12", to: "2026-10-31", answer: "notyet" as const, answered_at: "" };
  const w = buildPayrollPaidAnswerWindow({
    span: SPAN,
    use: applyPayrollPaidAnswer({ span: SPAN, saved }),
  });
  const text = JSON.stringify(w);
  assert.equal(text.includes("243000"), false);
  assert.equal(text.includes("243,000"), false);
  assert.equal(w.notYet, true);
  assert.equal(w.needed, false);
});
