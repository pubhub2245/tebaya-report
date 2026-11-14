/**
 * 「空いた日の答え」を、金庫を数える1押しに同乗させる決まりを固定する
 * （2026-11-14 夕・f1-4）。**計算だけ**（倉庫は1行も読み書きしません）。
 *
 * ■ ここで守るもの
 *   ① えらばなかったら、こちらで答えを作らない（お休みだったことにしない）
 *   ② えらばないまま押したら「合否は いまは言えません のまま」と正直に言う
 *   ③ 同じ答えがもう効いているなら、控え直さない（控えも行も増やさない）
 *   ④ 空きが無い日・答えが効いている日は、何も聞かない
 *   ⑤ 控えられなかったときに「控えました」と言わない
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBooksGapAnswer,
  NO_BOOKS_GAP_ANSWER,
} from "../lib/keiri/booksGapAnswer";
import {
  gapPickNeeded,
  planCashCountGapPick,
  gapPickFailLine,
} from "../lib/keiri/cashCountGapPick";

const GAP = ["2026-11-06", "2026-11-07", "2026-11-08"];

const answered = (answer: "holiday" | "operated", from = GAP[0], to = GAP[2]) =>
  applyBooksGapAnswer({ gapDates: GAP, saved: { from, to, answer } });

test("空きが無ければ、何も聞かないし何も控えない", () => {
  assert.equal(gapPickNeeded({ gapDays: 0, current: NO_BOOKS_GAP_ANSWER }), false);
  const plan = planCashCountGapPick({
    gapDays: 0,
    pick: "holiday",
    current: NO_BOOKS_GAP_ANSWER,
  });
  assert.equal(plan.save, false);
  assert.equal(plan.note, null);
  assert.equal(plan.warn, null);
});

test("答えがまだなら聞く／答えが覆っていれば もう聞かない", () => {
  assert.equal(gapPickNeeded({ gapDays: 3, current: NO_BOOKS_GAP_ANSWER }), true);
  assert.equal(gapPickNeeded({ gapDays: 3, current: answered("holiday") }), false);
  assert.equal(gapPickNeeded({ gapDays: 3, current: answered("operated") }), false);
  // 覆っていない古い答えは「まだ答えていない」と同じ扱い
  assert.equal(
    gapPickNeeded({
      gapDays: 3,
      current: answered("holiday", "2026-10-01", "2026-10-05"),
    }),
    true,
  );
});

test("えらばないまま押しても、答えを作らない（お休みにしない）", () => {
  const plan = planCashCountGapPick({
    gapDays: 3,
    pick: null,
    current: NO_BOOKS_GAP_ANSWER,
  });
  assert.equal(plan.save, false);
  assert.equal(plan.answer, null);
  assert.ok(plan.warn && plan.warn.includes("いまは言えません"));
  assert.ok(plan.warn && plan.warn.includes("3日"));
  // 「お休み」と決めつける言葉を混ぜない
  assert.equal(plan.note, null);
});

test("えらんだら、その1押しで控える（お休み／営業した の両方）", () => {
  const h = planCashCountGapPick({
    gapDays: 3,
    pick: "holiday",
    current: NO_BOOKS_GAP_ANSWER,
  });
  assert.equal(h.save, true);
  assert.equal(h.answer, "holiday");
  assert.ok(h.note && h.note.includes("お休みでした"));
  assert.equal(h.warn, null);

  const o = planCashCountGapPick({
    gapDays: 3,
    pick: "operated",
    current: NO_BOOKS_GAP_ANSWER,
  });
  assert.equal(o.save, true);
  assert.equal(o.answer, "operated");
  assert.ok(o.note && o.note.includes("営業した日があります"));
});

test("同じ答えがもう効いていれば、控え直さない", () => {
  const plan = planCashCountGapPick({
    gapDays: 3,
    pick: "holiday",
    current: answered("holiday"),
  });
  assert.equal(plan.save, false);
  assert.ok(plan.note && plan.note.includes("もう控えてあります"));
});

test("答えを変えたときは、控え直す", () => {
  const plan = planCashCountGapPick({
    gapDays: 3,
    pick: "operated",
    current: answered("holiday"),
  });
  assert.equal(plan.save, true);
  assert.equal(plan.answer, "operated");
});

test("答えが効いていて えらんでいないときは、注意も出さない（合否は出る）", () => {
  const plan = planCashCountGapPick({
    gapDays: 3,
    pick: null,
    current: answered("holiday"),
  });
  assert.equal(plan.save, false);
  assert.equal(plan.warn, null);
  assert.equal(plan.note, null);
});

test("控えられなかったときは「控えました」と言わない", () => {
  const line = gapPickFailLine("行が1行も変わりませんでした");
  assert.ok(line.includes("控えられませんでした"));
  assert.ok(!line.includes("控えました（"));
});
