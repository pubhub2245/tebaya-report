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

/* ------------------------------------------------------------------ *
 *  「足したら現金が◯円 ずれる」を、金庫の食い違いと読ませない
 *  （2026-11-11・f1-4）
 * ------------------------------------------------------------------ */

/**
 * ■ なぜ要るか（11/11 に本番で起きた形）
 *   窓口は「広い期間だけにある立替 8行」と「足したら現金が 449,350円 動く」を
 *   出していましたが、**その8行を足してよいのか**をどこにも書いていませんでした。
 *   読んだ側は差の金額だけを見て「金庫を数える日の食い違いの元になりえる」と
 *   報告し、最優先の仕事が1つ立ちました。
 *   実際には8行ぜんぶが**数え始めの日より前**に立て替えた行で、足すと二重に引きます。
 *   返した日が数え始めの日以後の行は、金庫の窓口が別の数え方としてもう並べています。
 */
test("数え始めの日より前の行を数え、足してはいけないと言う（f1-4）", () => {
  const screen = [adv({ id: 1, date: "2026-09-20" })];
  const wide = [
    adv({ id: 1, date: "2026-09-20" }),
    // 数え始め（9/10）より前に立て替えて、そのあと返した＝金庫の窓口が受け持つ行
    adv({ id: 7, date: "2026-08-20", settledDate: "2026-09-25" }),
    adv({ id: 8, date: "2026-08-22", settledDate: "2026-10-02" }),
    // 数え始めより前に立て替えて、まだ返していない＝金庫からお金は出ていない
    adv({ id: 9, date: "2026-08-25", settledDate: null }),
  ];
  const r = describeAdvanceWindow({
    ym: "2026-10",
    screen,
    wide,
    openingDate: "2026-09-10",
  });
  assert.equal(r.onlyInWide.count, 3);
  assert.equal(r.onlyInWide.beforeOpening, 3);
  assert.equal(r.onlyInWide.repaidAfterOpening, 2);
  // 「足してもいけない」と「金庫の食い違いの元にならない」が、必ず文に出ること
  assert.match(r.wideOnlyMeans, /足してもいけません/);
  assert.match(r.wideOnlyMeans, /食い違いの元になりません/);
});

test("数え始めの日が分からなければ、足してよいかを言わない（f1-4）", () => {
  const wide = [adv({ id: 7, date: "2026-08-20" })];
  const r = describeAdvanceWindow({ ym: "2026-10", screen: [], wide });
  assert.equal(r.onlyInWide.beforeOpening, null);
  assert.equal(r.onlyInWide.repaidAfterOpening, null);
  assert.match(r.wideOnlyMeans, /言えません/);
});

test("数え始めの日より後の行は、足すかどうかを kp250 で決めると言う（f1-4）", () => {
  const wide = [
    adv({ id: 7, date: "2026-08-20", settledDate: null }),
    adv({ id: 8, date: "2026-10-05", settledDate: null }),
  ];
  const r = describeAdvanceWindow({
    ym: "2026-10",
    screen: [],
    wide,
    openingDate: "2026-09-10",
  });
  assert.equal(r.onlyInWide.count, 2);
  assert.equal(r.onlyInWide.beforeOpening, 1);
  assert.match(r.wideOnlyMeans, /kp250/);
});
