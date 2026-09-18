/**
 * 無料の計算ツールの計算を固定する。
 * ここが狂うと、外の人に間違った「赤字ライン」を見せてしまう。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  breakEvenShareText,
  buildShareQuery,
  calcBreakEven,
  calcFl,
  flShareText,
  ratePercent,
  readShareParams,
  toNumber,
  yen,
} from "../lib/keiri/tools";

test("入力の掃除：空・マイナス・カンマ・単位つきを直す", () => {
  assert.equal(toNumber("1,200円"), 1200);
  assert.equal(toNumber("30%"), 30);
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber("あ"), 0);
  assert.equal(toNumber(-5), 0);
});

test("割合：売上が0なら答えを出さない（0で割らない）", () => {
  assert.equal(ratePercent(30, 100), 30);
  assert.equal(ratePercent(1, 3), 33.3);
  assert.equal(ratePercent(30, 0), null);
});

test("原価率・人件費率・FL比率", () => {
  const r = calcFl(1_000_000, 300_000, 280_000);
  assert.equal(r.foodRate, 30);
  assert.equal(r.laborRate, 28);
  assert.equal(r.flRate, 58);
  assert.equal(r.remainYen, 420_000);
});

test("赤字ライン：固定費60万・変動費率40%なら月100万", () => {
  const r = calcBreakEven({
    fixedCostYen: 600_000,
    variableRatePercent: 40,
    openDays: 25,
    averageSpendYen: 2_000,
  });
  assert.equal(r.monthlySalesYen, 1_000_000);
  assert.equal(r.dailySalesYen, 40_000);
  assert.equal(r.dailyCustomers, 20);
  assert.equal(r.impossibleReason, null);
});

test("赤字ライン：端数は切り上げる（足りない額を出さない）", () => {
  const r = calcBreakEven({
    fixedCostYen: 500_000,
    variableRatePercent: 33,
    openDays: 20,
    averageSpendYen: 0,
  });
  // 500000 ÷ 0.67 = 746268.65… → 切り上げ
  assert.equal(r.monthlySalesYen, 746_269);
  assert.equal(r.dailySalesYen, 37_314);
  // 客単価が空のときは客数を出さない
  assert.equal(r.dailyCustomers, null);
});

test("変動費率が100%以上のときは答えを出さずに理由を返す", () => {
  const r = calcBreakEven({
    fixedCostYen: 300_000,
    variableRatePercent: 100,
    openDays: 25,
    averageSpendYen: 1_500,
  });
  assert.equal(r.monthlySalesYen, null);
  assert.ok(r.impossibleReason && r.impossibleReason.includes("100%"));
});

test("営業日数が空なら1日あたりは出さない", () => {
  const r = calcBreakEven({ fixedCostYen: 300_000, variableRatePercent: 30, openDays: 0, averageSpendYen: 1_000 });
  assert.equal(r.dailySalesYen, null);
  assert.equal(r.dailyCustomers, null);
});

test("円の表示", () => {
  assert.equal(yen(1234567), "1,234,567円");
});

// ------------------------------------------------------------------
// 出した答えを1本のリンクで渡せるようにする（kp37）
// ------------------------------------------------------------------

test("リンクの数字：入れた数字だけが載る（空と0は載せない）", () => {
  assert.equal(
    buildShareQuery({ rent: "200000", labor: "", other: "0", rate: "30", days: "25", spend: "" }),
    "?rent=200000&rate=30&days=25",
  );
  assert.equal(buildShareQuery({ rent: "", rate: "" }), "");
  // カンマや単位が付いていても数字だけにする
  assert.equal(buildShareQuery({ rent: "1,200円" }), "?rent=1200");
});

test("リンクの数字：読み取りは既定値を上書きし、おかしい値は捨てる", () => {
  const defaults = { rent: "", rate: "30", days: "25" };
  assert.deepEqual(readShareParams("?rent=200000&rate=28", defaults), {
    rent: "200000",
    rate: "28",
    days: "25",
  });
  // 他人が作ったURLで画面が壊れないよう、数字でない値・マイナスは既定値のまま
  assert.deepEqual(readShareParams("?rent=あ&rate=-5", defaults), defaults);
  // 知らない欄は無視する
  assert.deepEqual(readShareParams("?unknown=1", defaults), defaults);
  // 先頭の ? が無くても読める
  assert.equal(readShareParams("rent=1000", defaults).rent, "1000");
});

test("貼れる文章：赤字ラインの答えとリンクが入る", () => {
  const input = { fixedCostYen: 200000, variableRatePercent: 30, openDays: 25, averageSpendYen: 1000 };
  const text = breakEvenShareText(input, calcBreakEven(input), "https://example.test/keiri/tools/bunki-ten?rent=200000");
  assert.match(text, /月にこれだけ売ればトントン：285,715円/);
  assert.match(text, /1営業日あたり：11,429円/);
  assert.match(text, /1営業日あたりのお客さん：12人/);
  assert.match(text, /https:\/\/example\.test\/keiri\/tools\/bunki-ten\?rent=200000$/);
});

test("貼れる文章：原価率が100%以上のときは、答えの代わりに理由を書く", () => {
  const input = { fixedCostYen: 200000, variableRatePercent: 120, openDays: 25, averageSpendYen: 0 };
  const text = breakEvenShareText(input, calcBreakEven(input), "https://example.test/x");
  assert.match(text, /黒字になりません/);
  assert.doesNotMatch(text, /トントン：/);
});

test("貼れる文章：FL比率の答えとリンクが入る", () => {
  const r = calcFl(1000000, 300000, 250000);
  const text = flShareText(1000000, 300000, 250000, r, "https://example.test/keiri/tools/genka-ritsu");
  assert.match(text, /FL比率：55\.0％/);
  assert.match(text, /原価率 30\.0％/);
  assert.match(text, /人件費率 25\.0％/);
  assert.match(text, /残る額：450,000円/);
  assert.match(text, /https:\/\/example\.test\/keiri\/tools\/genka-ritsu$/);
});
