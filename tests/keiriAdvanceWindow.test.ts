/**
 * 立替を読む期間のちがいで、何行ふえて何が動くかの数え方（lib/keiri/advanceWindow.ts）。
 *
 * ■ 何を守っているか
 *   読み方を1本に寄せたとき、会計ソフト向けの表が 133→124 行に減りました（kp250）。
 *   その9行が「前の月に立て替えて、この月に返した分」かどうかを、
 *   **外から読むだけで確かめられる**ようにしています。数え方を間違えると、
 *   関係ない行を「返した分」と言ってしまい、月の経費の決めごとを誤って変えてしまいます。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { advanceKey, describeAdvanceWindow } from "../lib/keiri/advanceWindow";
import type { KeiriAdvance } from "../lib/keiri/types";

function adv(over: Partial<KeiriAdvance> = {}): KeiriAdvance {
  return {
    id: over.id ?? 1,
    date: "2026-09-05",
    amount: 10000,
    description: "材料",
    payer: "オーナー",
    source: "owner",
    ...over,
  } as KeiriAdvance;
}

test("同じ行しか無ければ『同じ』", () => {
  const rows = [adv({ id: 1 }), adv({ id: 2 })];
  const r = describeAdvanceWindow({ ym: "2026-09", screen: rows, wide: rows.slice() });
  assert.equal(r.same, true);
  assert.equal(r.onlyInWide.count, 0);
  assert.equal(r.onlyInScreen.count, 0);
});

test("広い期間だけにある行を、立て替えた月ごとに数える", () => {
  const screen = [adv({ id: 1, date: "2026-09-05" })];
  const wide = [
    adv({ id: 1, date: "2026-09-05" }),
    adv({ id: 7, date: "2026-08-20", settledDate: "2026-09-02" }),
    adv({ id: 8, date: "2026-08-22", settledDate: "2026-09-03" }),
    adv({ id: 9, date: "2026-08-25", settledDate: null }),
  ];
  const r = describeAdvanceWindow({ ym: "2026-09", screen, wide });
  assert.equal(r.same, false);
  assert.equal(r.onlyInWide.count, 3);
  assert.deepEqual(r.onlyInWide.byMonth, [{ ym: "2026-08", count: 3 }]);
  // 「前の月に立て替えて、この月に返した」のは2行だけ
  assert.equal(r.onlyInWide.repaidInMonth, 2);
  assert.equal(r.onlyInWide.settled, 2);
  assert.equal(r.onlyInWide.unsettled, 1);
  assert.equal(r.onlyInScreen.count, 0);
});

test("ふだんの画面の期間だけにある行も数える（数え始めが40日より前のとき）", () => {
  const old = adv({ id: 100, date: "2026-04-01" });
  const r = describeAdvanceWindow({ ym: "2026-09", screen: [old], wide: [] });
  assert.equal(r.onlyInScreen.count, 1);
  assert.deepEqual(r.onlyInScreen.byMonth, [{ ym: "2026-04", count: 1 }]);
  assert.equal(r.same, false);
});

test("返した日が月の外なら『この月に返した分』に数えない", () => {
  const wide = [adv({ id: 7, date: "2026-08-20", settledDate: "2026-10-02" })];
  const r = describeAdvanceWindow({ ym: "2026-09", screen: [], wide });
  assert.equal(r.onlyInWide.settled, 1);
  assert.equal(r.onlyInWide.repaidInMonth, 0);
});

test("番号が無い行は、入り口・日付・金額・説明で見分ける", () => {
  const a = adv({ id: null, date: "2026-09-05", amount: 10000, description: "材料" });
  const b = adv({ id: null, date: "2026-09-05", amount: 10000, description: "材料" });
  const c = adv({ id: null, date: "2026-09-05", amount: 10001, description: "材料" });
  assert.equal(advanceKey(a), advanceKey(b));
  assert.notEqual(advanceKey(a), advanceKey(c));
  const r = describeAdvanceWindow({ ym: "2026-09", screen: [a], wide: [b, c] });
  assert.equal(r.onlyInWide.count, 1);
  assert.equal(r.onlyInScreen.count, 0);
});

test("入り口がちがえば同じ番号でも別の行", () => {
  const owner = adv({ id: 5, source: "owner" });
  const field = adv({ id: 5, source: "field" });
  assert.notEqual(advanceKey(owner), advanceKey(field));
});
