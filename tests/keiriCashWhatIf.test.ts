/**
 * 「じゅんが金庫を1分 数えたら、ほんとうに はい／いいえ が出るか」を 数える前に答える所
 * （lib/keiri/cashWhatIf.ts・2026-11-17・f1-4）。
 *
 * ■ ここで守ること
 *   ① ぜんぶ答えた形なら、差がどこにあっても 合否が出る（null が1つも無い）
 *   ② ［銀行に入れました］をえらぶと、置き場が無いので 大きい差では「言えません」になる
 *   ③ 何も答えないと、分からない所が残る（いまの形を そのまま写す）
 *   ④ 内わけを1つも読めていない日は「0件」と言わず、measurable を false にする
 *   ⑤ 金額を1文字も返さない（差の置きどころは言葉だけ・幅も返さない）
 *   ※ 金額は作り物です。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { measureCashWhatIf, type CashWhatIfSource } from "../lib/keiri/cashWhatIf";

/** 手羽屋の いまの形に近い材料（金額は作り物） */
function src(over: Partial<CashWhatIfSource> = {}): CashWhatIfSource {
  return {
    registerDiff: { readable: true, rows: 0, total: 0 },
    openingExpenses: { count: 4, total: 12000 },
    openingExpensesReadable: true,
    fieldRepay: { readable: true, rows: 0, total: 0 },
    unpaidPayroll: { readable: true, rows: 21, unpaid: 210000 },
    sameReport: { readable: true, pendingGroups: 0, pendingNet: 0 },
    booksGapWide: true,
    booksGapHolidaysOnly: false,
    depositShelfExists: false,
    ...over,
  };
}

function outcome(r: ReturnType<typeof measureCashWhatIf>, key: string) {
  const o = r.outcomes.find((x) => x.key === key);
  assert.ok(o, `${key} が出ていません`);
  return o!;
}

test("①ぜんぶ答えた形なら、日当の答えが どちらでも 合否が出る", () => {
  const r = measureCashWhatIf(src());
  assert.equal(r.measurable, true);
  for (const key of ["ぜんぶ答えた（日当はまだ）", "ぜんぶ答えた（日当はお渡しした）"]) {
    const all = outcome(r, key);
    assert.deepEqual(all.unknownLabels, [], `${key} に分からない所が残っています`);
    assert.equal(all.verdictAlways, true, `${key} で合否が出ません`);
    // はみ出した差は「合っていません」とはっきり言う（言えません にしない）
    const over = all.cases.find((c) => c.where.startsWith("その幅より1万円 多い"))!;
    assert.equal(over.covered, false);
    assert.equal(over.ok, false);
  }
  assert.equal(r.worthThePress, true);
  // ★日当の答えで「説明のつく幅」は変わる＝答えが効いていること
  const notYet = outcome(r, "ぜんぶ答えた（日当はまだ）");
  const handed = outcome(r, "ぜんぶ答えた（日当はお渡しした）");
  assert.equal(notYet.named, 1);
  assert.equal(handed.named, 2);
  assert.ok(handed.namedLabels.includes("払った記録が無い日当"));
});

test("②［銀行に入れました］をえらぶと、大きい差では『言えません』になる", () => {
  const r = measureCashWhatIf(src());
  const some = outcome(r, "銀行に入れたと答えた");
  assert.equal(some.unknownLabels.length, 1);
  assert.equal(some.verdictAlways, false);
  const over = some.cases.find((c) => c.where.startsWith("その幅より1万円 多い"))!;
  assert.equal(over.covered, null);
  assert.equal(over.ok, null);
  // ぴったりの日は、答えに関係なく「合っている」側
  const zero = some.cases.find((c) => c.where.startsWith("ぴったり"))!;
  assert.equal(zero.ok, true);
});

test("③何も答えないと、分からない所が2つ残る（いまの形）", () => {
  const r = measureCashWhatIf(src());
  const none = outcome(r, "何も答えない");
  assert.equal(none.unknownLabels.length, 2);
  assert.equal(none.verdictAlways, false);
});

test("③-2 空きが お休みだけと読めている月は、答えなしでも その分は残らない", () => {
  const r = measureCashWhatIf(src({ booksGapHolidaysOnly: true }));
  const none = outcome(r, "何も答えない");
  assert.deepEqual(none.unknownLabels, [
    "売上の現金を銀行に入れた分（記録する置き場がまだ無い）",
  ]);
});

test("③-3 銀行の置き場が倉庫にできたら、ぜんぶ答えなくても その分は残らない", () => {
  const r = measureCashWhatIf(src({ depositShelfExists: true, booksGapHolidaysOnly: true }));
  const none = outcome(r, "何も答えない");
  assert.deepEqual(none.unknownLabels, []);
  assert.equal(none.verdictAlways, true);
});

test("④内わけを1つも読めていない日は『0件』と言わない", () => {
  const r = measureCashWhatIf(
    src({
      registerDiff: { readable: false, rows: 0, total: 0 },
      openingExpensesReadable: false,
      fieldRepay: { readable: false, rows: 0, total: 0 },
      unpaidPayroll: { readable: false, rows: 0, unpaid: 0 },
      sameReport: { readable: false, pendingGroups: 0, pendingNet: 0 },
    }),
  );
  assert.equal(r.measurable, false);
  assert.deepEqual(r.outcomes, []);
  assert.equal(r.worthThePress, false);
  assert.match(r.summary, /1分が実らないという意味ではありません/);
});

test("⑤金額を1文字も返さない（幅も差の金額も出さない）", () => {
  const r = measureCashWhatIf(src());
  const text = JSON.stringify(r);
  // 材料に入れた金額が、どこにも出ていないこと
  for (const n of ["12000", "12,000", "210000", "210,000", "222000", "222,000"]) {
    assert.equal(text.includes(n), false, `${n} が外に出ています`);
  }
});
