/**
 * レジの「つながり」チェックのテスト。
 *
 * ここが狂うと、
 *   ・本当はズレているのに「合っている」と出る（違算を見逃す）
 *   ・合っているのに警告が出る（現場が警告を無視するようになる）
 * のどちらも起きる。実データで起きたパターンをそのまま固定しておく。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRegisterChain,
  normalizeUnit,
  withinDayDiff,
  type OpenRecord,
  type CloseRecord,
} from "../lib/registerChain";

const open = (date: string, unit: string, amount: number, location = "どこか"): OpenRecord => ({
  date,
  unit,
  location,
  amount,
});
const close = (date: string, unit: string, amount: number, location = "どこか"): CloseRecord => ({
  date,
  unit,
  location,
  amount,
  sales: 0,
  expenses: 0,
  reportedDiff: 0,
});

/* ---------- 号車の書き方 ---------- */

test("normalizeUnit: 数字・文字列・「2号車」を同じものとして扱う", () => {
  assert.equal(normalizeUnit("2"), "2");
  assert.equal(normalizeUnit(2), "2");
  assert.equal(normalizeUnit("2号車"), "2");
  assert.equal(normalizeUnit(" 1 "), "1");
});

test("normalizeUnit: 空・null は空文字（＝突き合わせ対象から外す）", () => {
  assert.equal(normalizeUnit(null), "");
  assert.equal(normalizeUnit(undefined), "");
  assert.equal(normalizeUnit("  "), "");
});

/* ---------- 基本の突き合わせ ---------- */

test("前日の閉店後と当日の開店前が同じなら「合っている」", () => {
  const r = buildRegisterChain(
    [open("2026-08-02", "2", 30000)],
    [close("2026-08-01", "2", 30000)],
  );
  assert.equal(r.checked, 1);
  assert.equal(r.matched, 1);
  assert.equal(r.mismatched, 0);
  assert.equal(r.rows[0].diff, 0);
});

test("金額が違えば「ズレあり」。差額はプラス・マイナスの向きも合わせる", () => {
  const r = buildRegisterChain(
    [open("2026-08-02", "2", 22731)],
    [close("2026-08-01", "2", 30000)],
  );
  assert.equal(r.mismatched, 1);
  assert.equal(r.rows[0].diff, -7269); // 減っている
  assert.equal(r.netDiff, -7269);

  const r2 = buildRegisterChain(
    [open("2026-08-02", "2", 31000)],
    [close("2026-08-01", "2", 30000)],
  );
  assert.equal(r2.rows[0].diff, 1000); // 増えている
});

/* ---------- 号車を混ぜない（一番の事故ポイント） ---------- */

test("号車が違うレジは突き合わせない", () => {
  const r = buildRegisterChain(
    [open("2026-08-02", "1", 25000)],
    [close("2026-08-01", "2", 30000)],
  );
  assert.equal(r.checked, 0);
  assert.equal(r.unknown, 1);
  assert.equal(r.rows[0].diff, null);
});

test("1号車と2号車が同じ日に営業していても、それぞれ正しくつながる", () => {
  const r = buildRegisterChain(
    [open("2026-08-02", "1", 25000), open("2026-08-02", "2", 30000)],
    [close("2026-08-01", "1", 25000), close("2026-08-01", "2", 20000)],
  );
  const u1 = r.rows.find((x) => x.unit === "1")!;
  const u2 = r.rows.find((x) => x.unit === "2")!;
  assert.equal(u1.diff, 0);
  assert.equal(u2.diff, 10000);
  assert.equal(r.matched, 1);
  assert.equal(r.mismatched, 1);
});

/* ---------- 休みをまたぐ ---------- */

test("何日か休んでも、前の営業日までさかのぼって比べる", () => {
  const r = buildRegisterChain(
    [open("2026-07-10", "1", 30000)],
    [close("2026-05-20", "1", 49660), close("2026-05-02", "1", 26050)],
  );
  assert.equal(r.rows[0].prevDate, "2026-05-20"); // 直近の営業日
  assert.equal(r.rows[0].diff, 30000 - 49660);
});

test("一番最初の記録は「確かめられない」（前の記録が無いため）", () => {
  const r = buildRegisterChain([open("2026-04-01", "2", 30000)], []);
  assert.equal(r.checked, 0);
  assert.equal(r.unknown, 1);
  assert.equal(r.rows[0].checkable, false);
});

test("同じ日より前の記録だけを見る（同じ日の閉店後は使わない）", () => {
  // 同じ日の閉店後は「その日の営業のあと」なので、開店前の比較相手ではない
  const r = buildRegisterChain(
    [open("2026-08-02", "2", 30000)],
    [close("2026-08-02", "2", 12345), close("2026-08-01", "2", 30000)],
  );
  assert.equal(r.rows[0].prevDate, "2026-08-01");
  assert.equal(r.rows[0].diff, 0);
});

/* ---------- 並び順と集計 ---------- */

test("新しい順に並ぶ", () => {
  const r = buildRegisterChain(
    [open("2026-08-01", "2", 30000), open("2026-08-03", "2", 30000), open("2026-08-02", "2", 30000)],
    [close("2026-07-31", "2", 30000)],
  );
  assert.deepEqual(
    r.rows.map((x) => x.date),
    ["2026-08-03", "2026-08-02", "2026-08-01"],
  );
});

test("ズレの合計は、増えた分と減った分が打ち消し合う", () => {
  // 実データにあったパターン：ある日 −9,120、翌日 +9,120（戻した）
  const r = buildRegisterChain(
    [open("2026-08-22", "2", 20880), open("2026-08-23", "2", 30000)],
    [close("2026-08-21", "2", 30000), close("2026-08-22", "2", 20880)],
  );
  assert.equal(r.rows.find((x) => x.date === "2026-08-22")!.diff, -9120);
  assert.equal(r.rows.find((x) => x.date === "2026-08-23")!.diff, 9120);
  assert.equal(r.netDiff, 0);
  assert.equal(r.mismatched, 2);
});

/* ---------- 壊れたデータ ---------- */

test("号車が未入力の記録は、黙って飛ばす（画面を落とさない）", () => {
  const r = buildRegisterChain(
    [open("2026-08-02", "", 30000), open("2026-08-02", "2", 30000)],
    [close("2026-08-01", "2", 30000), close("2026-08-01", "", 999)],
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].unit, "2");
});

test("データが空でも落ちない", () => {
  const r = buildRegisterChain([], []);
  assert.equal(r.rows.length, 0);
  assert.equal(r.checked, 0);
  assert.equal(r.netDiff, 0);
});

/* ---------- 1日のなかのつじつま ---------- */

test("withinDayDiff: 開店前と閉店後の差", () => {
  assert.equal(withinDayDiff(30000, 30000), 0);
  assert.equal(withinDayDiff(30000, 29000), -1000);
  assert.equal(withinDayDiff(30000, 31000), 1000);
});
