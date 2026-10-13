import { test } from "node:test";
import assert from "node:assert/strict";

import { reconcileCash, type CashEvent } from "../lib/keiri/cashCheck";
import { buildCashCountWindow } from "../lib/keiri/cashCountWindow";
import { buildCashVariants, pickCashVariant } from "../lib/keiri/cashVariant";

/**
 * 「金庫を数えた結果が合っていたか」を外に出す窓口（2026-10-13・f1-4）の決まりを固定する。
 *
 * ■ ここで守りたいこと
 *   ① 金額を1円も出さない（差は「帯」だけ）
 *   ② まだ数えていないときは、そう言う（0件を「合っていない」にしない）
 *   ③ 差が大きくても、数え方のちがいで説明がつくなら そう言う（探し物をさせない）
 *   ④ 説明がつかない差は「合っていない」。こちらで金額は直さない
 */

const COUNT = (amount: number, on = "2026-10-13"): CashEvent[] => [
  { kind: "count", happened_on: on, amount, actor: null, note: null },
];

const windowOf = (params: {
  counted: number | null;
  computed: number | null;
  withRepaid?: number | null;
  float?: number;
}) => {
  const events = params.counted === null ? [] : COUNT(params.counted);
  const reconcile = reconcileCash({
    events,
    computedAtCount: params.computed,
    today: "2026-10-13",
  });
  let pick: ReturnType<typeof pickCashVariant> | null = null;
  if (params.counted !== null) {
    const variants = buildCashVariants({
      screenBalance: params.computed,
      withRepaidBalance: params.withRepaid ?? null,
      registerFloat: params.float ?? 0,
    });
    const p = pickCashVariant({ variants, counted: params.counted });
    pick = p.hasChoice ? p : null;
  }
  return buildCashCountWindow({
    reconcile,
    pick,
    place: params.counted === null ? null : "控え",
  });
};

test("① 金額は1文字も出さない（返ってくる値のどこにも金額が無い）", () => {
  const w = windowOf({ counted: 510_699, computed: 1_004_399, withRepaid: 510_699 });
  const text = JSON.stringify(w);
  assert.ok(!text.includes("510699"));
  assert.ok(!text.includes("1004399"));
  assert.ok(!text.includes("510,699"));
  assert.ok(!text.includes("1,004,399"));
});

test("② まだ数えていないときは「まだ数えていません」。合否は付けない", () => {
  const w = windowOf({ counted: null, computed: null });
  assert.equal(w.counted, false);
  assert.equal(w.verdict, "まだ数えていません");
  assert.equal(w.band, null);
  assert.ok(w.next.includes("1回 入れてください"));
});

test("② ぴったり合えば「ぴったり合っている」・帯は0円", () => {
  const w = windowOf({ counted: 145_000, computed: 145_000 });
  assert.equal(w.verdict, "ぴったり合っている");
  assert.equal(w.band, "0円");
  assert.equal(w.place, "控え");
  assert.equal(w.countedOn, "2026-10-13");
  assert.ok(w.next.includes("合格"));
});

test("② おつりの誤差（1,000円より小さい）は「ほぼ合っている」", () => {
  const w = windowOf({ counted: 144_500, computed: 145_000 });
  assert.equal(w.verdict, "ほぼ合っている");
  assert.equal(w.band, "1,000円より小さい");
});

test("③ 差が大きくても、返した立替を引く数え方に合えば そう言う", () => {
  const w = windowOf({ counted: 510_699, computed: 1_004_399, withRepaid: 510_699 });
  assert.equal(w.verdict, "数え方のちがいで説明がつく");
  assert.equal(w.band, "1,000円以上");
  assert.ok((w.matchedVariant ?? "").includes("返した分も引く"));
  assert.ok(w.next.includes("合格"));
});

test("④ どちらの数え方にも合わなければ「合っていない」。金額は直さない", () => {
  const w = windowOf({ counted: 300_000, computed: 1_004_399, withRepaid: 510_699 });
  assert.equal(w.verdict, "合っていない");
  assert.equal(w.band, "1,000円以上");
  assert.equal(w.matchedVariant, null);
  assert.ok(w.next.includes("人が決めます"));
});

test("④ 計算上の現金が出せないときは、合っていると言わない", () => {
  const w = windowOf({ counted: 145_000, computed: null });
  assert.equal(w.counted, true);
  assert.equal(w.verdict, "合っていない");
  assert.equal(w.band, null);
});
