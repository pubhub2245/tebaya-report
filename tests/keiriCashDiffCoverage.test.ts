import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCashDiffCoverageWindow,
  fieldRepayPiece,
  measureCashDiffCoverage,
  openingExpensesPiece,
  registerDiffPiece,
  unpaidPayrollPiece,
} from "../lib/keiri/cashDiffCoverage";

/**
 * 「金庫を数えて出た差は、ぜんぶ名前が付いているか」の決まりを固定する
 * （2026-11-08・f1-4）。
 *
 * ■ ここで守りたいこと
 *   ① 差が名前の付いた分の幅に収まったら「探し物はありません」と言い切る
 *   ② はみ出た分があり、読めていない所が無いときだけ「探し物です」と言い切る
 *   ③ 読めていない所が1つでもあって はみ出しているなら、**どちらとも言わない**（null）
 *   ④ 読めていない欄を「0円」として幅に足さない
 *   ⑤ レジの過不足は記録の額なので1点、ほかは「0円〜上限」の幅
 *   ⑥ 金庫のほうが多い側（マイナスの差）でも向きを言い分ける
 *   ⑦ 窓口は金額を1円も返さない
 */

/** 「差 60,000円・名前が付いた分の上限 60,000円」＝ぴったり収まる形 */
test("差が名前の付いた分の幅に収まったら、探し物は無いと言い切る", () => {
  const c = measureCashDiffCoverage({
    diff: 60000,
    pieces: [
      fieldRepayPiece({ readable: true, rows: 3, total: 40000 }),
      unpaidPayrollPiece({ readable: true, rows: 2, unpaid: 20000 }),
    ],
  });
  assert.equal(c.measurable, true);
  assert.equal(c.min, 0);
  assert.equal(c.max, 60000);
  assert.equal(c.covered, true);
  assert.equal(c.rest, 0);
  assert.equal(c.named, 2);
  assert.match(c.lines.join("\n"), /ほかに探し物はありません/);
  assert.match(c.summary, /収まっています/);
});

test("はみ出た分があり、読めていない所が無ければ『ここが探し物』と言い切る", () => {
  const c = measureCashDiffCoverage({
    diff: 100000,
    pieces: [
      registerDiffPiece({ readable: true, rows: 2, total: -5000 }),
      fieldRepayPiece({ readable: true, rows: 1, total: 10000 }),
      unpaidPayrollPiece({ readable: true, rows: 1, unpaid: 10000 }),
      openingExpensesPiece({ count: 1, total: 5000 }),
    ],
  });
  // 幅は 5,000（レジの不足ぶん・確定）〜 5,000＋10,000＋10,000＋5,000 = 30,000
  assert.equal(c.min, 5000);
  assert.equal(c.max, 30000);
  assert.equal(c.covered, false);
  assert.equal(c.rest, 70000);
  assert.match(c.lines.join("\n"), /残り 70,000円/);
  assert.match(c.lines.join("\n"), /本当の探し物/);
});

test("読めていない所があって はみ出しているときは、どちらとも言わない", () => {
  const c = measureCashDiffCoverage({
    diff: 100000,
    pieces: [
      fieldRepayPiece({ readable: false, rows: 0, total: 0 }),
      unpaidPayrollPiece({ readable: true, rows: 1, unpaid: 10000 }),
    ],
  });
  assert.equal(c.covered, null);
  assert.equal(c.rest, 0, "言えないときは、はみ出た額を『探し物』として置かない");
  assert.deepEqual(c.unknownLabels, ["現場スタッフの立替をお返しした分"]);
  assert.match(c.lines.join("\n"), /いまは言えません/);
  assert.match(c.summary, /いま言えません/);
});

test("金額も向きも分からない所（日報がまだ入っていない日）も、言い切らない理由になる", () => {
  const c = measureCashDiffCoverage({
    diff: 80000,
    pieces: [unpaidPayrollPiece({ readable: true, rows: 1, unpaid: 10000 })],
    unknown: ["日報がまだ入っていない日"],
  });
  assert.equal(c.covered, null);
  assert.match(c.lines.join("\n"), /日報がまだ入っていない日/);
});

test("読めていない欄を『0円』として幅に足さない", () => {
  const c = measureCashDiffCoverage({
    diff: 3000,
    pieces: [fieldRepayPiece({ readable: false, rows: 5, total: 500000 })],
  });
  assert.equal(c.named, 0, "読めていない欄は幅に足さない");
  assert.equal(c.max, 0);
  assert.equal(c.covered, null, "読めていないので、探し物があるとも無いとも言わない");
});

test("行が0件の分は幅に足さない（意味の無い名前を並べない）", () => {
  const c = measureCashDiffCoverage({
    diff: 2000,
    pieces: [fieldRepayPiece({ readable: true, rows: 0, total: 0 })],
  });
  assert.equal(c.named, 0);
  assert.deepEqual(c.unknownLabels, []);
  assert.equal(c.covered, false, "読めていて0件なら、はみ出た分は探し物と言い切れる");
  assert.equal(c.rest, 2000);
});

test("レジの過不足は記録の額なので幅ではなく1点（不足はプラス側）", () => {
  const p = registerDiffPiece({ readable: true, rows: 1, total: -4000 });
  assert.equal(p.lo, 4000);
  assert.equal(p.hi, 4000);
  const over = registerDiffPiece({ readable: true, rows: 1, total: 4000 });
  assert.equal(over.lo, -4000);
  assert.equal(over.hi, -4000);
});

test("金庫のほうが多い側（マイナスの差）も、レジの過剰で説明できる", () => {
  const c = measureCashDiffCoverage({
    diff: -4000,
    pieces: [registerDiffPiece({ readable: true, rows: 1, total: 4000 })],
  });
  assert.equal(c.min, -4000);
  assert.equal(c.max, -4000);
  assert.equal(c.covered, true);
  assert.match(c.lines.join("\n"), /金庫のほうが多い/);
});

test("差がおつりの誤差の範囲なら、探し物の話をしない", () => {
  const c = measureCashDiffCoverage({
    diff: 400,
    pieces: [fieldRepayPiece({ readable: true, rows: 1, total: 10000 })],
  });
  assert.equal(c.covered, true);
  assert.deepEqual(c.lines, []);
  assert.match(c.summary, /おつりの誤差/);
});

test("まだ数えていなければ測らない（行も出ない）", () => {
  const c = measureCashDiffCoverage({
    diff: null,
    pieces: [fieldRepayPiece({ readable: true, rows: 1, total: 10000 })],
  });
  assert.equal(c.measurable, false);
  assert.equal(c.covered, null);
  assert.deepEqual(c.lines, []);
  const w = buildCashDiffCoverageWindow(c);
  assert.equal(w.shown, false);
  assert.match(w.note, /まだ金庫を数えていない/);
});

test("窓口は金額を1円も返さない", () => {
  const c = measureCashDiffCoverage({
    diff: 123456,
    pieces: [fieldRepayPiece({ readable: true, rows: 1, total: 1000 })],
  });
  const w = buildCashDiffCoverageWindow(c);
  const text = JSON.stringify(w);
  assert.equal(/123,?456/.test(text), false, "差の金額は窓口に出さない");
  assert.equal(/1,?000円/.test(text), false, "上限の金額も窓口に出さない");
  assert.equal(w.covered, false);
  assert.equal(w.shown, true);
});
