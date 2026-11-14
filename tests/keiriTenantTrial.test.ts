/**
 * 2軒目のお店を入れる手順を、こちら側だけで1回 通すところ（f5-4・f3-4）のテスト。
 *
 * ここが狂うと、
 * ・分かれていないのに「分かれている」と外に言ってしまう
 * ・テストの店の入れ値（B2 の材料と同じ値）がずれて、出るはずの答えと比べられなくなる
 * のどちらかが起きる。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  TEST_SHOP,
  TRIAL_LIMIT_MS,
  elapsedLabel,
  separationOk,
  trialSummary,
  TRIAL_CREATE_PATH,
  type TrialRead,
} from "../lib/keiri/tenantTrial";

const TEBAYA_OK: TrialRead = { reportCount: 15, advancesRead: true, readable: true };
const TEST_OK: TrialRead = { reportCount: 0, advancesRead: false, readable: true };

test("テストの店の入れ値は B2 の材料と同じ（名前の頭に【テスト】が付く）", () => {
  assert.equal(TEST_SHOP.name, "【テスト】B2検査食堂");
  assert.ok(TEST_SHOP.name.startsWith("【テスト】"), "本物の軒数と見分けが付く名前であること");
  assert.equal(TEST_SHOP.openingDate, "2026-10-06");
  assert.equal(TEST_SHOP.openingBalance, 30000);
});

test("30分の上限は30分（f5-4 の決まり）", () => {
  assert.equal(TRIAL_LIMIT_MS, 1_800_000);
});

test("かかった時間は人の言葉になる", () => {
  assert.equal(elapsedLabel(3400), "3.4秒");
  assert.equal(elapsedLabel(72_000), "1分12秒");
  assert.equal(elapsedLabel(-1), "分かりません");
});

test("分かれている＝手羽屋は読めて行があり、テストの店は0件で立替を読まない", () => {
  assert.equal(separationOk({ tebaya: TEBAYA_OK, testShop: TEST_OK }), true);
});

test("テストの店に手羽屋の日報が1件でも出たら、分かれていないと言う", () => {
  assert.equal(
    separationOk({ tebaya: TEBAYA_OK, testShop: { ...TEST_OK, reportCount: 1 } }),
    false,
  );
});

test("テストの店に立替を読んでしまったら、分かれていないと言う（立替には店の印がまだ無い）", () => {
  assert.equal(
    separationOk({ tebaya: TEBAYA_OK, testShop: { ...TEST_OK, advancesRead: true } }),
    false,
  );
});

/* ---------- 読み比べる月（2026-11-01・f5-4・f3-4） ---------- */
//  手順5の日報は「数え始めの日」に固定なので、読み比べる月もその月でなければ
//  意味がない。前は「先月」を読んでいて、2026年11月のあいだだけ たまたま
//  そろっていた（12月に入ると、行が1行も無い月で『混ざりません』と言ってしまう）。

test("読み比べる月は、手順5の日報の月（数え始めの日の月）", () => {
  const { trialReadMonth, testReportDate } =
    require("../lib/keiri/tenantTrialSteps") as typeof import("../lib/keiri/tenantTrialSteps");
  const m = trialReadMonth();
  assert.equal(m.ym, testReportDate().slice(0, 7));
  assert.equal(m.ym, "2026-10");
  assert.equal(m.label, "2026年10月");
});

test("読み比べる月は、今日の日付では動かない（何度 呼んでも同じ）", () => {
  const { trialReadMonth } =
    require("../lib/keiri/tenantTrialSteps") as typeof import("../lib/keiri/tenantTrialSteps");
  assert.deepEqual(trialReadMonth(), trialReadMonth());
});

test("「先月」を読むと、12月には日報の月とずれる（だから先月を使わない）", () => {
  const { previousMonthRange } =
    require("../lib/keiri/caseStats") as typeof import("../lib/keiri/caseStats");
  const { trialReadMonth } =
    require("../lib/keiri/tenantTrialSteps") as typeof import("../lib/keiri/tenantTrialSteps");
  // 2026年11月のあいだは、たまたまそろっていた
  assert.equal(previousMonthRange(new Date(2026, 10, 1)).start.slice(0, 7), trialReadMonth().ym);
  // 12月に入るとずれる＝テストの店の行が1行も無い月を読むことになる
  assert.notEqual(previousMonthRange(new Date(2026, 11, 1)).start.slice(0, 7), trialReadMonth().ym);
});

test("そのお店として読めていないときは「分かれている」と言わない（読んでいない0件を合格にしない）", () => {
  assert.equal(
    separationOk({ tebaya: TEBAYA_OK, testShop: { ...TEST_OK, readable: false } }),
    false,
  );
});

test("手羽屋が0件・読めないときは「分かれている」と言わない（棚が落ちているだけかもしれない）", () => {
  assert.equal(
    separationOk({ tebaya: { ...TEBAYA_OK, reportCount: 0 }, testShop: TEST_OK }),
    false,
  );
  assert.equal(
    separationOk({ tebaya: { ...TEBAYA_OK, readable: false }, testShop: TEST_OK }),
    false,
  );
});

test("まとめの1行：店が無いときは作り方を言う", () => {
  const s = trialSummary({
    state: { exists: false, createdNow: false, active: false, settingsReady: false },
    separated: false,
    elapsedMs: null,
    creatable: "yes",
  });
  assert.match(s, /まだありません/);
  // ★送る住所は「作る窓口」でなければならない（読む住所に送ると 405 で終わる）
  assert.ok(s.includes(TRIAL_CREATE_PATH));
});

/**
 * できないことを「できます」と言わない（2026-10-10・本番で実測した取り違え）。
 * 鍵が壊れているあいだは、送っても作れない。
 */
test("まとめの1行：鍵が使えないときは「送っても作れません」と言う", () => {
  const s = trialSummary({
    state: { exists: false, createdNow: false, active: false, settingsReady: false },
    separated: false,
    elapsedMs: null,
    creatable: "no",
  });
  assert.match(s, /作れません/);
  assert.match(s, /貼り紙/);
  // 「送れば作れます」と読める言い方を残さない
  assert.ok(!/送ると、こちら側だけで1軒 作れます/.test(s));
});

test("まとめの1行：作れるか確かめていないときは、言い切らない", () => {
  const s = trialSummary({
    state: { exists: false, createdNow: false, active: false, settingsReady: false },
    separated: false,
    elapsedMs: null,
  });
  assert.match(s, /確かめられませんでした/);
  assert.ok(!/作れます/.test(s));
});

test("まとめの1行：初回設定まで終わっていれば、かかった時間と30分以内かを言う", () => {
  const s = trialSummary({
    state: { exists: true, createdNow: true, active: true, settingsReady: true },
    separated: true,
    elapsedMs: 4200,
  });
  assert.match(s, /初回設定/);
  assert.match(s, /4\.2秒/);
  assert.match(s, /30分以内：はい/);
  assert.match(s, /混ざりません/);
});

/**
 * 測っていないことを、不合格の形で出さない（2026-11-14 夕・f5-4／f3-4）。
 * テストの店が1軒も無い日は読み比べを1回もしていないので、
 * separated は **null（まだ確かめていません）**。false（＝分かれていません）だと
 * 「混ざっている」と読まれ、測ってもいないことが不合格になる。
 */
test("まとめの1行：分かれているかを確かめていない日は、言い切らない", () => {
  const s = trialSummary({
    state: { exists: true, createdNow: false, active: true, settingsReady: true },
    separated: null,
    elapsedMs: 1000,
  });
  assert.match(s, /まだ確かめていません/);
  assert.ok(!/混ざりません/.test(s));
  // 「分かれていません」と読める言い方も出さない
  assert.ok(!/確かめられませんでした/.test(s));
});

test("まとめの1行：30分を超えたら「いいえ」と言う（ごまかさない）", () => {
  const s = trialSummary({
    state: { exists: true, createdNow: false, active: true, settingsReady: true },
    separated: true,
    elapsedMs: TRIAL_LIMIT_MS + 1,
  });
  assert.match(s, /30分以内：いいえ/);
});
