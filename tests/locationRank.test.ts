/**
 * 出店先ランクの自動判定のテスト。
 *
 * ここが狂うと、
 *   ・実力より高いランクが付いて、届くはずのない目標が立つ
 *   ・逆に良いお店が下に落ちて、出店回数の上限で行けなくなる
 * ので、判定の境目（目標額の9割ちょうど）を実際の数字で固定しておく。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACHIEVE_RATIO,
  MIN_VISITS_FOR_JUDGE,
  RANK_TARGET,
  RECENT_VISITS,
  buildRankPlans,
  judgeRank,
  nextRankInfo,
  rankFromAverage,
  recentAverage,
  reportsForLocation,
  toDailySales,
  type RankLocationRow,
} from "../lib/locationRank";

const rep = (date: string, sales: number, location = "ニシムタ") => ({
  date,
  sales_amount: sales,
  location,
});

/** 「集計から外す」がONの日報 */
const excluded = (date: string, sales: number, location = "ニシムタ") => ({
  ...rep(date, sales, location),
  exclude_from_stats: true,
});

// -----------------------------------------------------------------------------
// 目標額そのもの
// -----------------------------------------------------------------------------

test("目標額は1か所だけで持つ（S=8万 / A=6万 / B=5万 / C=4万 / D=3万）", () => {
  assert.deepEqual(RANK_TARGET, {
    S: 80000,
    A: 60000,
    B: 50000,
    C: 40000,
    D: 30000,
  });
  assert.equal(RECENT_VISITS, 8);
  assert.equal(MIN_VISITS_FOR_JUDGE, 3);
  assert.equal(ACHIEVE_RATIO, 0.9);
});

// -----------------------------------------------------------------------------
// 平均からランクを決める（境目をきっちり固定する）
// -----------------------------------------------------------------------------

test("目標額の9割ちょうどならそのランクに入る", () => {
  assert.equal(rankFromAverage(72000), "S"); // 80000 * 0.9
  assert.equal(rankFromAverage(54000), "A"); // 60000 * 0.9
  assert.equal(rankFromAverage(45000), "B"); // 50000 * 0.9
  assert.equal(rankFromAverage(36000), "C"); // 40000 * 0.9
  assert.equal(rankFromAverage(27000), "D"); // 30000 * 0.9
});

test("9割に1円でも足りなければ下のランクになる", () => {
  assert.equal(rankFromAverage(71999), "A");
  assert.equal(rankFromAverage(53999), "B");
  assert.equal(rankFromAverage(44999), "C");
  assert.equal(rankFromAverage(35999), "D");
});

test("どのランクにも届かなければ D（一番下）", () => {
  assert.equal(rankFromAverage(0), "D");
  assert.equal(rankFromAverage(26999), "D");
});

// -----------------------------------------------------------------------------
// 直近8回の取り方
// -----------------------------------------------------------------------------

test("同じ日の日報は合算して1回ぶんとして数える（手羽屋＋もも屋）", () => {
  const daily = toDailySales([
    rep("2026-09-01", 20000),
    rep("2026-09-01", 10000), // もも屋の別日報
    rep("2026-09-02", 30000),
  ]);
  assert.deepEqual(daily, [
    { date: "2026-09-02", sales: 30000 },
    { date: "2026-09-01", sales: 30000 },
  ]);
});

test("古い回は9回目から外れる（直近8回だけ見る）", () => {
  const reports = [
    ...Array.from({ length: 8 }, (_, i) =>
      rep(`2026-09-0${i + 1}`, 60000),
    ),
    rep("2026-08-01", 0), // 9回目に押し出される古い回
  ];
  const { average, count } = recentAverage(toDailySales(reports));
  assert.equal(count, 8);
  assert.equal(average, 60000);
});

test("直近8回が3回未満なら判定しない（今のランクのまま）", () => {
  assert.equal(judgeRank([rep("2026-09-01", 60000)]), null);
  assert.equal(
    judgeRank([rep("2026-09-01", 60000), rep("2026-09-02", 60000)]),
    null,
  );
  const judged = judgeRank([
    rep("2026-09-01", 60000),
    rep("2026-09-02", 60000),
    rep("2026-09-03", 60000),
  ]);
  assert.deepEqual(judged, { rank: "A", average: 60000, sampleCount: 3 });
});

// -----------------------------------------------------------------------------
// 次のランクまで あと ¥◯◯
// -----------------------------------------------------------------------------

test("次のランクまでの差は「次の目標額の9割 − 今の平均」", () => {
  assert.deepEqual(nextRankInfo("C", 30000), { nextRank: "B", needed: 15000 });
  assert.deepEqual(nextRankInfo("B", 45000), { nextRank: "A", needed: 9000 });
  // 一番上（S）は次が無い
  assert.equal(nextRankInfo("S", 100000), null);
});

// -----------------------------------------------------------------------------
// マスタの書き換え予定
// -----------------------------------------------------------------------------

const loc = (over: Partial<RankLocationRow> = {}): RankLocationRow => ({
  id: 1,
  name: "ニシムタ",
  rank: "D",
  target: 30000,
  is_active: true,
  rank_locked: false,
  ...over,
});

test("日報の書き方が違っても名寄せしてその場所ぶんだけ拾う", () => {
  const reports = [
    rep("2026-09-01", 10000, "ニシムタ 都城店"),
    rep("2026-09-02", 20000, "ながやま 三股店"),
  ];
  const mine = reportsForLocation(reports, "ニシムタ");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].sales_amount, 10000);
});

test("実績が上がっていればランクと目標額を上げる予定になる", () => {
  const reports = [
    rep("2026-09-01", 46000),
    rep("2026-09-02", 45000),
    rep("2026-09-03", 44000),
  ];
  const [plan] = buildRankPlans([loc()], reports);
  assert.equal(plan.newRank, "B");
  assert.equal(plan.newTarget, 50000);
  assert.equal(plan.average, 45000);
  assert.equal(plan.sampleCount, 3);
  assert.equal(plan.changed, true);
});

test("固定（rank_locked）の出店先は触らない", () => {
  const reports = [
    rep("2026-09-01", 90000, "都城イベント"),
    rep("2026-09-02", 90000, "都城イベント"),
    rep("2026-09-03", 90000, "都城イベント"),
  ];
  const [plan] = buildRankPlans(
    [loc({ name: "都城イベント", rank: "A", target: 60000, rank_locked: true })],
    reports,
  );
  assert.equal(plan.changed, false);
  assert.equal(plan.skipReason, "locked");
  assert.equal(plan.newRank, null);
});

test("回数が足りない出店先は今のランクのまま（変更予定にしない）", () => {
  const [plan] = buildRankPlans([loc()], [rep("2026-09-01", 90000)]);
  assert.equal(plan.changed, false);
  assert.equal(plan.skipReason, "notEnoughData");
});

test("ランクも目標額も同じなら書き換えない", () => {
  const reports = [
    rep("2026-09-01", 28000),
    rep("2026-09-02", 28000),
    rep("2026-09-03", 28000),
  ];
  const [plan] = buildRankPlans([loc()], reports);
  assert.equal(plan.newRank, "D");
  assert.equal(plan.changed, false);
  assert.equal(plan.skipReason, "noChange");
});

test("無効化した出店先は判定の対象にしない", () => {
  const plans = buildRankPlans([loc({ is_active: false })], [
    rep("2026-09-01", 60000),
    rep("2026-09-02", 60000),
    rep("2026-09-03", 60000),
  ]);
  assert.equal(plans.length, 0);
});

// -----------------------------------------------------------------------------
// 「集計から外す」スイッチ
// -----------------------------------------------------------------------------

test("集計から外した日報は、平均にも回数にも数えない", () => {
  const { average, count } = recentAverage(
    toDailySales([
      rep("2026-09-01", 20000),
      excluded("2026-09-02", 90000), // ふだんと条件が違う日
      rep("2026-09-03", 20000),
    ]),
  );
  assert.equal(count, 2);
  assert.equal(average, 20000);
});

test("集計から外した日が混ざっていても、判定に使う回数は残りだけで数える", () => {
  // 3件あるが1件は集計外 → 残り2件なので判定しない
  assert.equal(
    judgeRank([
      rep("2026-09-01", 60000),
      rep("2026-09-02", 60000),
      excluded("2026-09-03", 60000),
    ]),
    null,
  );
});

test("集計から外した日を除いてランクが決まる（1日だけの大当たりに引っぱられない）", () => {
  const reports = [
    excluded("2026-09-01", 90000), // 2人体制の特別な日
    rep("2026-09-02", 28000),
    rep("2026-09-03", 28000),
    rep("2026-09-04", 28000),
  ];
  const [plan] = buildRankPlans([loc()], reports);
  assert.equal(plan.newRank, "D");
  assert.equal(plan.average, 28000);
  assert.equal(plan.sampleCount, 3);
});
