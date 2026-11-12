/**
 * 「数えるその日に出店があって、まだ日報が入っていないか」の見立て
 * （lib/keiri/cashCountDay.ts・2026-11-12・kp245・f1-4）。
 *
 * ■ なぜ要るか
 *   日報の空きの見張りは、数える日そのものを わざと外しています（その日の日報は
 *   営業が終わってから入るため）。そのせいで「出店のあった日の夜、日報を出す前に
 *   数える」と、その日の売上のぶんだけ必ず食い違い、差の内わけにも出ません。
 *   ここは**押す前の一言**だけを固定します（合否の決め方は1文字も変えません）。
 *
 * ■ ここで守ること
 *   ① 読めなかったときに「出店はありません」と言わない（0件を「無い」と取り違えない）
 *   ② その日の日報がもう入っていれば、よけいな足止めをしない
 *   ※ 日付は作り物です。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  measureCashCountDay,
  UNKNOWN_CASH_COUNT_DAY,
} from "../lib/keiri/cashCountDay";

test("出店があって日報がまだ＝先に日報を出してから数える", () => {
  const r = measureCashCountDay({ date: "2026-11-12", shiftToday: true, reportIn: false });
  assert.equal(r.readable, true);
  assert.equal(r.openOnCountDay, true);
  assert.equal(r.waitForReport, true);
  assert.match(r.line, /11月12日/);
  assert.match(r.line, /日報がまだ入っていません/);
});

test("出店があっても日報が入っていれば、そのまま数えてよい", () => {
  const r = measureCashCountDay({ date: "2026-11-12", shiftToday: true, reportIn: true });
  assert.equal(r.waitForReport, false);
  assert.match(r.line, /そのまま数えて大丈夫です/);
});

test("出店の予定が無い日は、そのまま数えてよい", () => {
  const r = measureCashCountDay({ date: "2026-11-12", shiftToday: false, reportIn: false });
  assert.equal(r.openOnCountDay, false);
  assert.equal(r.waitForReport, false);
  assert.match(r.line, /そのまま数えて大丈夫です/);
});

test("読めなかった日は「出店はありません」と言わない", () => {
  const r = measureCashCountDay({ date: "2026-11-12", shiftToday: null, reportIn: false });
  assert.equal(r.readable, false);
  assert.equal(r.openOnCountDay, false);
  assert.equal(r.waitForReport, false);
  assert.match(r.line, /読めませんでした/);
  assert.ok(!r.line.includes("出店の予定がありません"));
});

test("まだ見ていないときの既定も「出店はありません」と言わない", () => {
  assert.equal(UNKNOWN_CASH_COUNT_DAY.readable, false);
  assert.equal(UNKNOWN_CASH_COUNT_DAY.waitForReport, false);
  assert.ok(!UNKNOWN_CASH_COUNT_DAY.line.includes("出店の予定がありません"));
});
