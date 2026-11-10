/**
 * 「月の指定を間違えたとき、黙って別の月で答えない」を固定する試験（2026-11-10・f1-2／f1-5）。
 *
 * 2026-11-10 13:0x に、`?month=2026-09` と書いても窓口がエラーを出さず
 * **10月の答え**を返していました。読んだ人は9月を見たつもりで別の月の答えを読むので、
 * そのまま仕上げチェック表に合否を付けると「見ていない月で合格」になります。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isYm, readMonthParam } from "../lib/keiri/monthParam";

const FALLBACK = "2026-10";
const q = (s: string) => new URLSearchParams(s);

test("月の形だけを月として受け取る", () => {
  assert.equal(isYm("2026-09"), true);
  assert.equal(isYm("2026-13"), false);
  assert.equal(isYm("2026-00"), false);
  assert.equal(isYm("2026-9"), false);
  assert.equal(isYm("9月"), false);
});

test("正しい鍵・正しい形なら そのまま受け取る（知らせは出さない）", () => {
  const p = readMonthParam(q("ym=2026-09"), FALLBACK);
  assert.equal(p.ym, "2026-09");
  assert.equal(p.accepted, true);
  assert.equal(p.warning, null);
});

test("指定が無ければ 既定の月（今までどおり・知らせは出さない）", () => {
  const p = readMonthParam(q(""), FALLBACK);
  assert.equal(p.ym, FALLBACK);
  assert.equal(p.accepted, true);
  assert.equal(p.warning, null);
  assert.equal(p.asked, null);
});

test("鍵の名前を間違えた月は、黙って受け取らず 名指しで知らせる（?month=）", () => {
  const p = readMonthParam(q("month=2026-09"), FALLBACK);
  // 答える月は今までどおり既定の月のまま（勝手に切り替えない）
  assert.equal(p.ym, FALLBACK);
  assert.equal(p.accepted, false);
  assert.ok(p.warning, "知らせが出ていない");
  assert.ok(p.warning!.includes("month=2026-09"), "間違えた書き方を名指ししていない");
  assert.ok(p.warning!.includes(FALLBACK), "実際に答えた月を書いていない");
  assert.ok(p.warning!.includes("ym"), "正しい鍵の名前を書いていない");
});

test("ほかの間違えやすい鍵でも同じように知らせる", () => {
  for (const key of ["m", "yearmonth", "year_month", "date", "ym_"]) {
    const p = readMonthParam(q(`${key}=2026-08`), FALLBACK);
    assert.equal(p.accepted, false, `${key} で知らせが出ていない`);
    assert.equal(p.ym, FALLBACK);
  }
});

test("月の形でない ym も、黙って既定の月で答えない", () => {
  const p = readMonthParam(q("ym=9月"), FALLBACK);
  assert.equal(p.ym, FALLBACK);
  assert.equal(p.accepted, false);
  assert.equal(p.asked, "9月");
  assert.ok(p.warning!.includes("9月"));
});

test("正しい ym があれば、間違えた鍵が一緒に入っていても知らせない", () => {
  const p = readMonthParam(q("ym=2026-09&month=2026-07"), FALLBACK);
  assert.equal(p.ym, "2026-09");
  assert.equal(p.accepted, true);
  assert.equal(p.warning, null);
});

test("間違えた鍵に月の形でない値が入っているだけなら、何も言わない", () => {
  const p = readMonthParam(q("date=きのう"), FALLBACK);
  assert.equal(p.ym, FALLBACK);
  assert.equal(p.accepted, true);
  assert.equal(p.warning, null);
});
