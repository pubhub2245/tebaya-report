import assert from "node:assert/strict";
import test from "node:test";

import {
  PROBE_DEADLINE_MS,
  SWEEP_MIN_MS,
  f34Verdict,
  sweepCandidates,
  type LiveShelfReport,
} from "../lib/keiri/copyProbe";
import type { TenantReadGuardReport } from "../lib/keiri/tenantReadGuard";

/**
 * 「よその店のデータが見えないか」を外から確かめる窓口（/api/keiri/copies）の
 * **合否の付け方**と**時間切れの振る舞い**を固定する（f3-4）。
 *
 * ■ なぜ試験で縛るのか
 *   2026-10-15 18:0x に、この窓口が本番で2回 続けて「サーバー側の誤り」になりました。
 *   原因は、名前を 819 本 聞く重い所を**本題より先に**やっていて、
 *   倉庫が遅い日に持ち時間を超えていたこと。
 *   ＝ いちばん要る答え（合否）が、いちばん落ちやすい作りでした。
 *   ここでは「合否は必ず返る」「片方だけ見て合格にしない」を固定します。
 */

const readable: LiveShelfReport = {
  table: "daily_reports",
  readable: true,
  note: "手羽屋の行は読めます",
};
const notReadable: LiveShelfReport = { ...readable, readable: false };
const unknownShelf: LiveShelfReport = { ...readable, readable: null };

function guard(separated: boolean | null): TenantReadGuardReport {
  return {
    anonVisible: separated === false ? 1 : 0,
    windowReady: separated === true ? true : null,
    viaWindow: separated === true ? 1 : null,
    separated,
    note: "試験用",
    policy: "keiri_only_tebaya_rows_readable",
    window: "keiri_tenant_reports",
  };
}

test("よその店の行が隠れ、手羽屋の行は読め、写しも閉まっていれば合格", () => {
  const v = f34Verdict(true, readable, guard(true));
  assert.equal(v.pass, true);
  assert.equal(v.foreignHidden, true);
  assert.equal(v.tebayaStillReadable, true);
});

test("よその店の行がまだ読めれば不合格", () => {
  const v = f34Verdict(true, readable, guard(false));
  assert.equal(v.pass, false);
  assert.match(v.line, /まだ読めます/);
});

test("手羽屋の行まで読めなくなったら『やりすぎ』で不合格（元に戻す）", () => {
  // ★ここが false のまま合格になると、毎日の画面が止まったことに気づけない
  const v = f34Verdict(true, notReadable, guard(true));
  assert.equal(v.pass, false);
  assert.match(v.line, /やりすぎ/);
});

test("よその店の行で試せていないときは、合格にしない（分からない）", () => {
  assert.equal(f34Verdict(true, readable, guard(null)).pass, null);
  assert.equal(f34Verdict(true, unknownShelf, guard(true)).pass, null);
});

test("写しがまだ開いているときは『あと1つ』で、合格にはしない", () => {
  const v = f34Verdict(false, readable, guard(true));
  assert.equal(v.pass, false);
  assert.match(v.line, /あと1つ/);
});

test("持ち時間を使い切っていたら、1本も聞かずに『続きがあります』で返す", async () => {
  // 時計を進めた状態から始める＝倉庫には一度も聞かない（通信しない試験）
  let t = 0;
  const result = await sweepCandidates({
    names: ["a_backup", "b_backup", "c_backup"],
    now: () => (t += 10_000),
    budgetMs: 1,
  });
  assert.equal(result.asked, 0);
  assert.equal(result.nextFrom, 0);
  assert.equal(result.total, 3);
});

test("窓口ぜんたいの持ち時間は、写しを聞く最低時間より長い", () => {
  // ここが逆になると、本題を答える前に時間切れになる
  assert.ok(PROBE_DEADLINE_MS > SWEEP_MIN_MS);
});
