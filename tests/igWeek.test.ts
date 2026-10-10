import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  defaultWeekStart,
  hoursLabel,
  mondayOf,
  weekDates,
  weekLabel,
} from "../lib/igWeek";
import { isSpecialEvent } from "../lib/locationDisplay";

test("週は月曜はじまり。日曜はその前の月曜の週に入る", () => {
  assert.equal(mondayOf("2026-10-12"), "2026-10-12"); // 月
  assert.equal(mondayOf("2026-10-14"), "2026-10-12"); // 水
  assert.equal(mondayOf("2026-10-18"), "2026-10-12"); // 日
  assert.equal(mondayOf("2026-10-19"), "2026-10-19"); // 次の月
});

test("土日に開いたら次の週、月〜金は今週を最初に出す", () => {
  assert.equal(defaultWeekStart("2026-10-09"), "2026-10-05"); // 金 → 今週
  assert.equal(defaultWeekStart("2026-10-10"), "2026-10-12"); // 土 → 来週
  assert.equal(defaultWeekStart("2026-10-11"), "2026-10-12"); // 日 → 来週
  assert.equal(defaultWeekStart("2026-10-12"), "2026-10-12"); // 月 → 今週
});

test("7日ぶんが月をまたいでも続く", () => {
  assert.deepEqual(weekDates("2026-10-26"), [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]);
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
});

test("見出しと時間の書き方", () => {
  assert.equal(weekLabel("2026-10-12"), "10/12（月）〜 10/18（日）");
  assert.equal(hoursLabel("09:30:00", "14:30:00"), "9:30〜14:30");
  assert.equal(hoursLabel("12:00:00", null), "12:00〜");
  assert.equal(hoursLabel(null, null), "");
});

test("お祭りは特別出店として色を付ける", () => {
  assert.equal(isSpecialEvent("妻ケ丘地区ふれあいまつり"), true);
  assert.equal(isSpecialEvent("盆地祭り"), true);
  assert.equal(isSpecialEvent("ニシムタ"), false);
  assert.equal(isSpecialEvent("PASIO鷹尾"), false);
});
