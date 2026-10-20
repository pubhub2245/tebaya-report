import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CASH_MEMO_BEGIN,
  CASH_MEMO_END,
  decodeCashCountMemo,
  encodeCashCountMemo,
  mergeCashEvents,
  planCashCountNoteKeep,
  stripCashCountMemo,
} from "../lib/keiri/cashCountMemo";
import { buildCashCountPress } from "../lib/keiri/cashCountPress";
import { latestCount, type CashEvent } from "../lib/keiri/cashCheck";
import { buildSetupTodo } from "../lib/keiri/setupTodo";

/**
 * 金庫を数えた「控え」（2026-10-13・kp245・f1-4）の決まりを固定する。
 *
 * ■ ここで守りたいこと
 *   ① いま書いてあるひとことを消さない（控えの印の中だけに書く）
 *   ② 控えるのは いちばん新しい1回だけ（おまけ欄を長くしない）
 *   ③ 読めない中身では落ちない・勝手な金額を作らない
 *   ④ 棚ができたあと、同じ記録を二重に数えない
 *   ⑤ 棚が無くても「数えた記録がある」なら、じゅんの手続きは「済み」になる
 */

const ORIGINAL = "7月分給与の支払い後にちょうど0円になった日を起点にする";

test("① いま書いてあるひとことを消さない。印ごと外せば元に戻る", () => {
  const next = encodeCashCountMemo(ORIGINAL, {
    happened_on: "2026-10-13",
    amount: 1004399,
    note: "差の理由に心当たりなし",
    saved_at: "2026-10-13T09:40:00.000Z",
  });
  assert.ok(next);
  assert.ok(next!.startsWith(ORIGINAL));
  assert.ok(next!.includes(CASH_MEMO_BEGIN));
  assert.ok(next!.includes(CASH_MEMO_END));
  // 元に戻せる＝控えを外すと、もとの文だけが残る
  assert.equal(stripCashCountMemo(next), ORIGINAL);
});

test("① ひとことが空でも使える（印だけが入る）", () => {
  const next = encodeCashCountMemo(null, { happened_on: "2026-10-13", amount: 0 });
  assert.ok(next);
  assert.equal(stripCashCountMemo(next), "");
  assert.deepEqual(decodeCashCountMemo(next), [
    { kind: "count", happened_on: "2026-10-13", amount: 0, actor: null, note: null },
  ]);
});

test("② 2回 入れても控えは1件だけ（いちばん新しいほうが残る）", () => {
  const first = encodeCashCountMemo(ORIGINAL, { happened_on: "2026-10-13", amount: 100 });
  const second = encodeCashCountMemo(first, { happened_on: "2026-10-14", amount: 200 });
  assert.ok(second);
  const events = decodeCashCountMemo(second);
  assert.equal(events.length, 1);
  assert.equal(events[0].happened_on, "2026-10-14");
  assert.equal(events[0].amount, 200);
  // 印は1組だけ
  assert.equal(second!.split(CASH_MEMO_BEGIN).length - 1, 1);
  assert.equal(stripCashCountMemo(second), ORIGINAL);
});

test("③ 日付・金額がおかしいときは控えない（黙って直さない）", () => {
  assert.equal(encodeCashCountMemo(ORIGINAL, { happened_on: "2026-13", amount: 100 }), null);
  assert.equal(encodeCashCountMemo(ORIGINAL, { happened_on: "2026-10-13", amount: -1 }), null);
  assert.equal(
    encodeCashCountMemo(ORIGINAL, { happened_on: "2026-10-13", amount: Number.NaN }),
    null,
  );
});

test("③ 読めない中身・印が無い文では、何も無い扱い（落ちない）", () => {
  assert.deepEqual(decodeCashCountMemo(null), []);
  assert.deepEqual(decodeCashCountMemo(ORIGINAL), []);
  assert.deepEqual(decodeCashCountMemo(`${CASH_MEMO_BEGIN}\nこわれた\n${CASH_MEMO_END}`), []);
  assert.deepEqual(
    decodeCashCountMemo(`${CASH_MEMO_BEGIN}\n{"happened_on":"x","amount":1}\n${CASH_MEMO_END}`),
    [],
  );
});

test("③ ひとことは長すぎたら切る（おまけ欄を長くしない）", () => {
  const next = encodeCashCountMemo(null, {
    happened_on: "2026-10-13",
    amount: 1,
    note: "あ".repeat(500),
  });
  const events = decodeCashCountMemo(next);
  assert.equal(events.length, 1);
  assert.equal((events[0].note ?? "").length, 100);
});

test("④ 棚の記録と控えが同じなら、1件として数える", () => {
  const shelf: CashEvent[] = [
    { kind: "count", happened_on: "2026-10-13", amount: 1004399, actor: null, note: null },
  ];
  const memo = decodeCashCountMemo(
    encodeCashCountMemo(null, { happened_on: "2026-10-13", amount: 1004399 }),
  );
  const merged = mergeCashEvents(shelf, memo);
  assert.equal(merged.length, 1);
});

test("④ 棚に無い控えは足す。いちばん新しい1回として突き合わせに使える", () => {
  const shelf: CashEvent[] = [
    { kind: "deposit", happened_on: "2026-10-01", amount: 50000, actor: null, note: null },
  ];
  const memo = decodeCashCountMemo(
    encodeCashCountMemo(null, { happened_on: "2026-10-13", amount: 777 }),
  );
  const merged = mergeCashEvents(shelf, memo);
  assert.equal(merged.length, 2);
  const last = latestCount(merged);
  assert.equal(last?.amount, 777);
});

test("⑤ 棚が無くても控えが1件あれば、じゅんの手続きは「済み」になる", () => {
  const todo = buildSetupTodo({
    shelves: { done: 0, total: 7 },
    key: { configured: true, usable: false },
    cash: { shelfMissing: true, counted: true, countedInMemo: true },
  });
  const cash = todo.items.find((i) => i.id === "cash");
  assert.equal(cash?.state, "済み");
  assert.ok((cash?.detail ?? "").includes("控え"));
});

test("⑤ 棚も控えも無ければ「のこり」。ただし『残りません』とは言わない", () => {
  const todo = buildSetupTodo({
    shelves: { done: 0, total: 7 },
    key: { configured: true, usable: false },
    cash: { shelfMissing: true, counted: false, countedInMemo: false },
  });
  const cash = todo.items.find((i) => i.id === "cash");
  assert.equal(cash?.state, "のこり");
  assert.ok((cash?.detail ?? "").includes("控えに残ります"));
});

/**
 * ⑥ 「いま書いてある ひとこと は、控えを足しても残るか」を外から言える形にする
 *    （2026-10-20・kp245・f1-4）。
 *
 *    控えを置く場所は『経理の設定』の ひとこと欄 1つだけで、そこには
 *    じゅんが 2026-09-10 に書いた「数え始めの説明」が入っています。
 *    押したときにその文が上書きで消えないことを、**文を見せずに**言えるようにする。
 */

test("⑥ ひとことが入っているとき：文字数だけを返し、1文字も消えないと言う", () => {
  const plan = planCashCountNoteKeep(ORIGINAL);
  assert.equal(plan.has, true);
  assert.equal(plan.chars, ORIGINAL.length);
  assert.equal(plan.keptExactly, true);
  assert.equal(plan.tidied, false);
  // ★文そのものは返さない（だれでも読める窓口に出すため）
  assert.ok(!plan.line.includes(ORIGINAL));
  assert.ok(plan.line.includes("1文字も消えません"));
});

test("⑥ ひとことが空のとき：消える文は無いと言う", () => {
  for (const empty of [null, undefined, "", "   \n  "]) {
    const plan = planCashCountNoteKeep(empty);
    assert.equal(plan.has, false);
    assert.equal(plan.chars, 0);
    assert.equal(plan.keptExactly, true);
  }
});

test("⑥ すでに控えが入っている欄でも、ひとことはそのまま残ると言う", () => {
  const withBlock = encodeCashCountMemo(ORIGINAL, {
    happened_on: "2026-10-20",
    amount: 1004399,
  });
  const plan = planCashCountNoteKeep(withBlock);
  assert.equal(plan.has, true);
  assert.equal(plan.chars, ORIGINAL.length);
  assert.equal(plan.keptExactly, true);
  // もう1回 押しても ひとことは残り、控えは1組だけ
  const next = encodeCashCountMemo(withBlock, { happened_on: "2026-10-21", amount: 5 });
  assert.equal(stripCashCountMemo(next), ORIGINAL);
  assert.equal(decodeCashCountMemo(next).length, 1);
});

test("⑥ 前後の空白・空行だけそろえるときは、そう正直に言う（文は消さない）", () => {
  const messy = `  ${ORIGINAL}\n\n\n\n`;
  const plan = planCashCountNoteKeep(messy);
  assert.equal(plan.has, true);
  assert.equal(plan.keptExactly, true);
  assert.equal(plan.tidied, true);
  assert.ok(plan.line.includes("空行だけ"));
});

test("⑥ 外から読む窓口に、ひとことの中身は乗らない（文字数と可否だけ）", () => {
  const press = buildCashCountPress({
    shelfMissing: true,
    rowReadable: true,
    readError: null,
    existingNote: planCashCountNoteKeep(ORIGINAL),
  });
  assert.equal(press.willKeep, true);
  assert.equal(press.presses, 1);
  assert.equal(press.existingNote?.keptExactly, true);
  assert.equal(press.existingNote?.chars, ORIGINAL.length);
  assert.ok(!JSON.stringify(press).includes(ORIGINAL));
});

test("⑥ 控えを置く場所が読めないときは、ひとことの話をしない（null）", () => {
  const press = buildCashCountPress({
    shelfMissing: true,
    rowReadable: false,
    readError: null,
  });
  assert.equal(press.willKeep, false);
  assert.equal(press.existingNote, null);
});
