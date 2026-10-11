/**
 * 立替を「どの期間ぶん読むか」の検算（2026-10-11・kp249・f3-4／f1-2）。
 *
 * ★なぜ要るか：10/11 に手羽屋の経理をサーバー側の窓口に寄せたとき、
 *   同じ月なのに **立替の件数が17件ちがいました**（/api/keiri/readpaths で実測）。
 *   読む期間の決め方が、画面側とサーバー側に**別々に書いてあった**ためです。
 *   期間を1か所にまとめたので、同じずれが戻らないようにここで固定します。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { advanceReadRange } from "../lib/keiri/advanceRange";

test("ふだんの経理の画面は、数え始めの日から・上は区切らない", () => {
  const r = advanceReadRange({ ym: "2026-09", openingDate: "2026-09-01" });
  assert.equal(r.from, "2026-09-01");
  assert.equal(r.to, null);
});

test("見ている月が数え始めの日より前なら、月初から読む", () => {
  const r = advanceReadRange({ ym: "2026-07", openingDate: "2026-09-01" });
  assert.equal(r.from, "2026-07-01");
  assert.equal(r.to, null);
});

test("数え始めの日が月初より前なら、数え始めの日から読む", () => {
  const r = advanceReadRange({ ym: "2026-09", openingDate: "2026-04-01" });
  assert.equal(r.from, "2026-04-01");
  assert.equal(r.to, null);
});

/**
 * ★これが17件のずれの正体。
 *   前後40日の余白を付けると、数え始めの日より前の立替まで入ってしまう。
 *   ふだんの画面では**付けない**（付けると金庫の計算と「同じ支払いの疑い」が動く）。
 */
test("ふだんの画面では、数え始めの日より前には さかのぼらない", () => {
  const r = advanceReadRange({ ym: "2026-09", openingDate: "2026-09-01" });
  assert.ok(r.from >= "2026-09-01", "数え始めの日より前から読んでいる");
  assert.notEqual(r.from, "2026-07-23"); // 前後40日を付けたときの日
});

test("その月だけ見る使い方（事例ページ）は、前後40日の余白つきで今までどおり", () => {
  const r = advanceReadRange({ ym: "2026-09", openingDate: "2026-09-01", monthOnly: true });
  assert.equal(r.from, "2026-07-23"); // 9/1 の40日前
  assert.equal(r.to, "2026-11-09"); // 9/30 の40日後
});

test("数え始めの日が空でも落ちない（月初として扱う）", () => {
  const r = advanceReadRange({ ym: "2026-09", openingDate: "" });
  assert.equal(r.from, "2026-09-01");
  assert.equal(r.to, null);
});

test("月末の出し方は、月の長さが違っても合っている", () => {
  assert.equal(
    advanceReadRange({ ym: "2026-02", openingDate: "2026-02-01", monthOnly: true }).to,
    "2026-04-09", // 2/28 の40日後
  );
  assert.equal(
    advanceReadRange({ ym: "2026-12", openingDate: "2026-12-01", monthOnly: true }).to,
    "2027-02-09", // 12/31 の40日後
  );
});
