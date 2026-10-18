import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boneHours,
  buildLineText,
  dateLabel,
  defaultDates,
  emptyPlan,
  estimateChicken,
  needsGasRefill,
  recommendFryer,
  roundUpToBags,
  shiftDate,
} from "../lib/eventPlan";

test("11/8 まるまる朝市（売上の想定35,000円）は180本＝2kg×6袋", () => {
  // 35000 ÷ 270 × 1.2 ≒ 155.6本 → 30本単位に切り上げて180本
  assert.deepEqual(estimateChicken(35000), { pieces: 180, bags: 6, kg: 12 });
});

test("前回8/9の実績（33,000円・122本）なら、余裕2割で袋に切り上げる", () => {
  assert.deepEqual(estimateChicken(33000), { pieces: 150, bags: 5, kg: 10 });
});

test("売上の想定が空・0・マイナスなら0本（勝手に数字を作らない）", () => {
  assert.deepEqual(estimateChicken(null), { pieces: 0, bags: 0, kg: 0 });
  assert.deepEqual(estimateChicken(0), { pieces: 0, bags: 0, kg: 0 });
  assert.deepEqual(estimateChicken(-100), { pieces: 0, bags: 0, kg: 0 });
});

test("袋への切り上げ：30本ちょうどは1袋、31本は2袋", () => {
  assert.deepEqual(roundUpToBags(30), { pieces: 30, bags: 1, kg: 2 });
  assert.deepEqual(roundUpToBags(31), { pieces: 60, bags: 2, kg: 4 });
});

test("骨抜きは100本で1時間・30分きざみで切り上げ", () => {
  assert.equal(boneHours(180), 2);
  assert.equal(boneHours(100), 1);
  assert.equal(boneHours(120), 1.5);
  assert.equal(boneHours(null), 0);
});

test("フライヤー：電源が無ければガス", () => {
  assert.equal(recommendFryer(20000, "no").fryer, "gas");
});

test("フライヤー：売上の想定が60,000円以上ならガス（ちょうどもガス）", () => {
  assert.equal(recommendFryer(60000, "yes").fryer, "gas");
  assert.equal(recommendFryer(59999, "yes").fryer, "electric");
});

test("フライヤー：電源未確認なら電気をすすめつつ、確認を促す", () => {
  const r = recommendFryer(35000, "unknown");
  assert.equal(r.fryer, "electric");
  assert.match(r.reason, /要確認/);
});

test("ガスフライヤーのときだけガスの補充が要る", () => {
  assert.equal(needsGasRefill("gas"), true);
  assert.equal(needsGasRefill("electric"), false);
  assert.equal(needsGasRefill("undecided"), false);
});

test("発注は4日前・仕込みは前日。月をまたいでも正しい", () => {
  assert.deepEqual(defaultDates("2026-11-08"), {
    orderDate: "2026-11-04",
    prepDate: "2026-11-07",
  });
  assert.equal(shiftDate("2026-11-02", -4), "2026-10-29");
});

test("日付の表示は '11/8(日)'", () => {
  assert.equal(dateLabel("2026-11-08"), "11/8(日)");
  assert.equal(dateLabel(null), "未定");
});

test("新しい段取りの発注先は恵比寿商事", () => {
  assert.equal(emptyPlan("2026-11-08").supplier, "恵比寿商事");
});

test("LINE用の文：本数・袋・発注先・担当未定・注意点が入る", () => {
  const p = {
    ...emptyPlan("2026-11-08"),
    event_name: "まるまる朝市",
    venue: "まちなか広場",
    open_time: "09:00",
    close_time: "13:00",
    load_in: "8:00〜9:00",
    expected_sales: 35000,
    chicken_count: 180,
    fryer: "electric" as const,
    power: "yes" as const,
    power_note: "1店舗1,500Wまで・500円",
    booth_fee: 2000,
    cautions: "8時より前の搬入は禁止\n・営業中の撤収は禁止",
  };
  const t = buildLineText(p);
  assert.match(t, /11\/8\(日\) まるまる朝市/);
  assert.match(t, /手羽先180本（2kg×6袋＝12kg）/);
  assert.match(t, /発注先：恵比寿商事／発注日：11\/4\(水\)/);
  assert.match(t, /骨抜き・仕込み：11\/7\(土\)（約2時間）／担当：未定/);
  assert.match(t, /当日の担当：未定/);
  assert.match(t, /電気フライヤー/);
  assert.match(t, /1店舗1,500Wまで・500円/);
  assert.match(t, /・8時より前の搬入は禁止/);
  assert.match(t, /・営業中の撤収は禁止/);
  assert.doesNotMatch(t, /ガスの補充/);
});
