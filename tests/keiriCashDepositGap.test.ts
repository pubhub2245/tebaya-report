import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  DEPOSIT_UNKNOWN_LABEL,
  applyCashDepositAnswer,
  decodeCashDepositAnswer,
  depositPickNeeded,
  encodeCashDepositAnswer,
  measureCashDepositGap,
  planCashDepositPick,
  stripCashDepositAnswer,
  NO_CASH_DEPOSIT_ANSWER,
} from "../lib/keiri/cashDepositGap";
import { measureCashDiffCoverage, openingExpensesPiece } from "../lib/keiri/cashDiffCoverage";

/**
 * 「売上の現金を銀行に入れた分」（2026-11-17・f1-4）。
 *
 * ここで固定したいのは1つだけ：**入れた記録を残す置き場がまだ無いあいだ、
 * 「名前の付かない差が残っている＝ここが探し物です」と言い切らない**こと。
 * 言い切ると、じゅんが1分 数えたあとに、無い探し物をさせることになります。
 */

test("置き場が無く、まだ答えてもらっていない＝『分からない所』として数える", () => {
  const g = measureCashDepositGap({ shelfMissing: true });
  assert.equal(g.shelfExists, false);
  assert.equal(g.unknown, true);
  assert.deepEqual(g.unknownLabels, [DEPOSIT_UNKNOWN_LABEL]);
  assert.ok(g.line && g.line.includes("銀行に入れた"));
});

test("置き場が有るなら、0件は『入れていない』と言い切れる（分からない所にしない）", () => {
  const none = measureCashDepositGap({ shelfMissing: false, deposits: 0 });
  assert.equal(none.unknown, false);
  assert.deepEqual(none.unknownLabels, []);
  const some = measureCashDepositGap({ shelfMissing: false, deposits: 3 });
  assert.equal(some.unknown, false);
  assert.ok(some.note.includes("3件"));
});

test("「1円も入れていない」と答えてもらえれば、置き場が無くても言い切れる", () => {
  const answer = applyCashDepositAnswer({
    from: "2026-09-10",
    to: "2026-11-17",
    saved: {
      from: "2026-09-10",
      to: "2026-11-17",
      answer: "none",
      answered_at: "2026-11-17T04:00:00.000Z",
    },
  });
  assert.equal(answer.covers, true);
  assert.equal(answer.none, true);
  const g = measureCashDepositGap({ shelfMissing: true, answer });
  assert.equal(g.unknown, false);
  assert.deepEqual(g.unknownLabels, []);
});

test("「入れた」と答えてもらった日は、金額が無いので言い切らない（でも理由に名前が付く）", () => {
  const answer = applyCashDepositAnswer({
    from: "2026-09-10",
    to: "2026-11-17",
    saved: {
      from: "2026-09-01",
      to: "2026-12-31",
      answer: "some",
      answered_at: "",
    },
  });
  assert.equal(answer.covers, true);
  assert.equal(answer.some, true);
  const g = measureCashDepositGap({ shelfMissing: true, answer });
  assert.equal(g.unknown, true);
  assert.ok(g.line && g.line.includes("金額はどこにも残っていません"));
});

test("答えの範囲からはみ出したら効かせない（＝また分からない所に戻る）", () => {
  const answer = applyCashDepositAnswer({
    from: "2026-09-10",
    // 答えたときより後の日まで数えている
    to: "2026-12-01",
    saved: {
      from: "2026-09-10",
      to: "2026-11-17",
      answer: "none",
      answered_at: "",
    },
  });
  assert.equal(answer.has, true);
  assert.equal(answer.covers, false);
  assert.equal(answer.none, false);
  assert.equal(measureCashDepositGap({ shelfMissing: true, answer }).unknown, true);
});

test("日付が読めないときは効かせない（黙って直さない）", () => {
  const saved = {
    from: "2026-09-10",
    to: "2026-11-17",
    answer: "none" as const,
    answered_at: "",
  };
  assert.equal(applyCashDepositAnswer({ from: null, to: "2026-11-17", saved }).covers, false);
  assert.equal(applyCashDepositAnswer({ from: "2026-09-10", to: null, saved }).covers, false);
  assert.equal(applyCashDepositAnswer({ from: "x", to: "y", saved }).covers, false);
  assert.deepEqual(
    applyCashDepositAnswer({ from: "2026-09-10", to: "2026-11-17", saved: null }),
    NO_CASH_DEPOSIT_ANSWER,
  );
});

test("控えは、いま書いてあるひとことを1文字も消さない", () => {
  const memo = "8/10起点からの突合で実残高に合わせた";
  const next = encodeCashDepositAnswer(memo, {
    from: "2026-09-10",
    to: "2026-11-17",
    answer: "none",
    answered_at: "2026-11-17T04:00:00.000Z",
  });
  assert.ok(next);
  assert.ok(next!.includes(memo));
  assert.equal(stripCashDepositAnswer(next), memo);
  const back = decodeCashDepositAnswer(next);
  assert.equal(back?.answer, "none");
  assert.equal(back?.from, "2026-09-10");
  // 控え直しても、ひとことは1つだけ・控えも1つだけ
  const again = encodeCashDepositAnswer(next, {
    from: "2026-09-10",
    to: "2026-11-18",
    answer: "some",
  });
  assert.equal(stripCashDepositAnswer(again), memo);
  assert.equal(decodeCashDepositAnswer(again)?.answer, "some");
});

test("日付がおかしい・答えが知らない言葉なら控えない（null を返す）", () => {
  assert.equal(
    encodeCashDepositAnswer(null, { from: "2026-11-17", to: "2026-09-10", answer: "none" }),
    null,
  );
  assert.equal(
    encodeCashDepositAnswer(null, { from: "x", to: "2026-09-10", answer: "none" }),
    null,
  );
  assert.equal(
    encodeCashDepositAnswer(null, {
      from: "2026-09-10",
      to: "2026-11-17",
      answer: "yes" as any,
    }),
    null,
  );
});

test("印が無い・中身が壊れているときは null（経理の画面が落ちない）", () => {
  assert.equal(decodeCashDepositAnswer(null), null);
  assert.equal(decodeCashDepositAnswer("ただのひとこと"), null);
  assert.equal(
    decodeCashDepositAnswer("［銀行に入れたかの答え v1 ここから］\n{こわれ\n［銀行に入れたかの答え v1 ここまで］"),
    null,
  );
});

test("1押しに同乗させる計画：えらばなければ何も控えない", () => {
  const plan = planCashDepositPick({
    shelfMissing: true,
    pick: null,
    current: NO_CASH_DEPOSIT_ANSWER,
  });
  assert.equal(plan.save, false);
  assert.equal(plan.answer, null);
  assert.ok(plan.warn && plan.warn.includes("いまは言えません"));
});

test("1押しに同乗させる計画：同じ答えがもう効いていれば控え直さない", () => {
  const current = applyCashDepositAnswer({
    from: "2026-09-10",
    to: "2026-11-17",
    saved: { from: "2026-09-10", to: "2026-11-17", answer: "none", answered_at: "" },
  });
  const plan = planCashDepositPick({ shelfMissing: true, pick: "none", current });
  assert.equal(plan.save, false);
  assert.ok(plan.note && plan.note.includes("もう控えてあります"));
  // ちがう答えなら控える
  assert.equal(planCashDepositPick({ shelfMissing: true, pick: "some", current }).save, true);
  // えらばなくても、もう効いているなら何も言わない
  assert.equal(planCashDepositPick({ shelfMissing: true, pick: null, current }).warn, null);
});

test("置き場ができたら、この問いは出さない", () => {
  assert.equal(
    depositPickNeeded({ shelfMissing: false, current: NO_CASH_DEPOSIT_ANSWER }),
    false,
  );
  assert.equal(
    depositPickNeeded({ shelfMissing: true, current: NO_CASH_DEPOSIT_ANSWER }),
    true,
  );
  assert.equal(planCashDepositPick({ shelfMissing: false, pick: "none", current: NO_CASH_DEPOSIT_ANSWER }).save, false);
});

test("★これが本題：置き場が無いあいだは『探し物がある』と言い切らない", () => {
  // 差 30万円、名前が付いた分は 0〜5万円 しかない＝ふつうなら「探し物がある（false）」
  const pieces = [openingExpensesPiece({ count: 4, total: 50000 })];
  const plain = measureCashDiffCoverage({ diff: 300000, pieces, unknown: [] });
  assert.equal(plain.covered, false);
  // 銀行に入れた分が「分からない所」に入っていれば、言い切らない（null）
  const withDeposit = measureCashDiffCoverage({
    diff: 300000,
    pieces,
    unknown: measureCashDepositGap({ shelfMissing: true }).unknownLabels,
  });
  assert.equal(withDeposit.covered, null);
  assert.ok(withDeposit.lines.join("").includes("いまは言えません"));
  // 「1円も入れていない」と答えてもらえれば、今までどおり言い切れる
  const answered = measureCashDiffCoverage({
    diff: 300000,
    pieces,
    unknown: measureCashDepositGap({
      shelfMissing: true,
      answer: applyCashDepositAnswer({
        from: "2026-09-10",
        to: "2026-11-17",
        saved: { from: "2026-09-10", to: "2026-11-17", answer: "none", answered_at: "" },
      }),
    }).unknownLabels,
  });
  assert.equal(answered.covered, false);
});
