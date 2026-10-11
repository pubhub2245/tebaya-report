/**
 * 金庫の突き合わせの「筋書き」の月（lib/keiri/cashCheckScenario.ts）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCashCheck,
  cashCheckCountedOn,
  cashCheckStaleOn,
  cashCheckYm,
} from "../lib/keiri/cashCheckScenario";

/**
 * 筋書きの月は「終わった月（前の月）」であること（2026-10-11・検査役 B2 の気づき）。
 *
 * ■ 何を守っているか
 *   月を 2026-09 と書き固めていたため、お試し版（今月）と表示が食い違い、
 *   検査役が「数字はお試し版と同じなのに月が9月」と迷いました。
 *   今月にすると末日が未来になり6通りのうち2つが作れないので、**前の月**にそろえます。
 */
test("筋書きの月は、今日から出した『前の月』になる", () => {
  assert.equal(cashCheckYm(new Date("2026-10-11T09:00:00Z")), "2026-09");
  assert.equal(cashCheckYm(new Date("2026-01-05T09:00:00Z")), "2025-12");
  // 数えた日はその月の末日（31日の月・30日の月・2月のどれでも落ちない）
  assert.equal(cashCheckCountedOn(new Date("2026-11-02T09:00:00Z")), "2026-10-31");
  assert.equal(cashCheckCountedOn(new Date("2026-10-11T09:00:00Z")), "2026-09-30");
  assert.equal(cashCheckCountedOn(new Date("2026-03-03T09:00:00Z")), "2026-02-28");
  // 「久しく数えていない」を試す日は、数え始め（月の頭）より後
  assert.ok(cashCheckStaleOn(new Date("2026-10-11T09:00:00Z")) > "2026-09-01");
});

test("月がちがう理由を、返事の中で説明している", () => {
  const r = buildCashCheck({ today: "2026-10-11" });
  assert.equal(r.ym, cashCheckYm(new Date("2026-10-11T09:00:00Z")));
  assert.match(r.ymNote, /前の月/);
  assert.match(r.ymNote, /今月/);
});
