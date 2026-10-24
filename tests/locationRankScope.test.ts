/**
 * 「ランクの自動判定は、どのお店の数字で行うか」のテスト（2026-10-21・f3-4）。
 *
 * ここが狂うと、
 *   ・申し込んだお店のランクと目標額が、**手羽屋の売上**から決まる
 *   ・よその店のランクの動きが、手羽屋と同じ履歴の棚に混ざる
 * ので、手羽屋のときは1つも変わらないことと合わせて固定しておく。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildRankPlans, type RankLocationRow } from "../lib/locationRank";
import {
  decideRankAutoJudge,
  decideRankHistoryWrite,
  rankRowsInScope,
} from "../lib/locationRankScope";

const SHOP = "11111111-1111-4111-8111-111111111111";

/** 日報1行（判定に使う列だけ） */
const rep = (
  date: string,
  sales: number,
  tenant_id: string | null,
  location = "ニシムタ",
) => ({ date, sales_amount: sales, location, tenant_id });

const loc = (id: number, name: string, rank: string): RankLocationRow => ({
  id,
  name,
  rank,
  target: null,
  is_active: true,
  rank_locked: false,
});

/** 手羽屋の売上が高い日報8枚＋申し込んだお店の日報1枚（同じ場所の名前） */
const MIXED = [
  ...Array.from({ length: 8 }, (_, i) =>
    rep(`2026-09-0${i + 1}`, 80000, null),
  ),
  rep("2026-09-20", 10000, SHOP),
];

test("手羽屋として読むと、今までどおり手羽屋の日報だけが入る", () => {
  const rows = rankRowsInScope(MIXED, null);
  assert.equal(rows.length, 8);
  assert.ok(rows.every((r) => r.tenant_id === null));
});

test("申し込んだお店として読むと、そのお店の日報だけが入る", () => {
  const rows = rankRowsInScope(MIXED, SHOP);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenant_id, SHOP);
});

test("申し込んだお店のランクは、手羽屋の売上では上がらない", () => {
  // 絞らないまま（＝これまでの形）だと、手羽屋の8回ぶんで判定されて上がってしまう
  const wrong = buildRankPlans([loc(2, "ニシムタ", "D")], MIXED);
  assert.equal(wrong[0].changed, true);

  // 開いているお店のぶんだけに絞ると、回数が足りないので何も変えない
  const right = buildRankPlans(
    [loc(2, "ニシムタ", "D")],
    rankRowsInScope(MIXED, SHOP),
  );
  assert.equal(right[0].changed, false);
});

test("手羽屋の判定結果は、絞り込みを入れても1つも変わらない", () => {
  const before = buildRankPlans(
    [loc(1, "ニシムタ", "D")],
    MIXED.filter((r) => r.tenant_id === null),
  );
  const after = buildRankPlans(
    [loc(1, "ニシムタ", "D")],
    rankRowsInScope(MIXED, null),
  );
  assert.deepEqual(after, before);
});

test("ランクが変わった記録は、手羽屋だけが残す", () => {
  assert.equal(decideRankHistoryWrite(null).write, true);
  const shop = decideRankHistoryWrite(SHOP);
  assert.equal(shop.write, false);
  assert.match(shop.why, /自動判定を行いません/);
});

test("自動判定そのものは、手羽屋だけが行う（2026-10-23・f3-4）", () => {
  // 目標額（S=80,000〜D=30,000 円）は手羽屋の決めごとなので、
  // よそのお店の出店場所マスタには書き込まない
  assert.equal(decideRankAutoJudge(null).judge, true);
  assert.equal(decideRankAutoJudge("").judge, true);
  const shop = decideRankAutoJudge(SHOP);
  assert.equal(shop.judge, false);
  assert.match(shop.why, /手羽屋の/);
});
