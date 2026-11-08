import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  PHOTO_SHELF_BUDGET_MS,
  unmeasurablePhotoShelf,
} from "../lib/keiri/photoShelf";

/**
 * ここでいちばん守りたいこと（2026-11-08・B／f3-4）
 *
 * **この窓口は、いつ開いても必ず答えを返す。**
 *
 * 本番（版 6e93e7f・2026-11-08 13:5x）で実測して見つけたこと：
 *   GET /api/keiri/photos → **HTTP 504 FUNCTION_INVOCATION_TIMEOUT**（答えが返らない）
 * f3-4（よその店のデータが見えないか）の合否を外から測る窓口の1本なのに、
 * 倉庫が止まっている日＝いちばん知りたい日に開けない形でした。
 *
 * 時間が足りない理由：置き場を7か所 一覧で聞き、棚を7回 数え、公開かどうかを1回たたく。
 * 倉庫に届かないとき、つなぐ部品は同じ問い合わせを自分で4回 試すので1か所 約7秒
 * （→ lib/keiri/readBudget.ts）。足すと持ち時間 30秒 を超えます。
 */

test("諦める線は、窓口の持ち時間（30秒）より短い", () => {
  const route = readFileSync("app/api/keiri/photos/route.ts", "utf8");
  const max = route.match(/maxDuration\s*=\s*(\d+)/);
  assert.ok(max, "maxDuration が読めません");
  assert.ok(
    PHOTO_SHELF_BUDGET_MS < Number(max![1]) * 1000,
    `線（${PHOTO_SHELF_BUDGET_MS}ms）が持ち時間（${max![1]}秒）を超えています`,
  );
});

test("線に当たった日は、○× をぜんぶ「分かりません」にする", () => {
  const r = unmeasurablePhotoShelf({
    bucket: "receipts",
    viewWindow: "/api/receipt-photo",
    reason: "倉庫からの返事が時間内に来ませんでした",
  });
  assert.equal(r.verdict.listable, null);
  assert.equal(r.verdict.publicRead, null);
  assert.equal(r.publicCheck.open, null);
  assert.equal(r.knownPhotos, null);
  assert.equal(r.outcomes.length, 0);
  // 「閉まった」と読めてはいけない
  assert.ok(r.verdict.note.includes("いまは測れませんでした"), r.verdict.note);
  assert.ok(
    !/閉まっています|閉まりました/.test(r.verdict.note),
    r.verdict.note,
  );
  // 写真の住所・金額・鍵の値は入れない
  assert.ok(!/http/i.test(JSON.stringify(r.verdict)), "住所を入れないこと");
});

test("線つきの読み方は、線に当たったら『分かりません』を返す形になっている", () => {
  const probe = readFileSync("lib/keiri/photoProbe.ts", "utf8");
  // 線は raceWithDeadline（lib/keiri/readBudget.ts）1か所を通す
  assert.ok(probe.includes("raceWithDeadline"), "線を引いていません");
  assert.ok(
    probe.includes("unmeasurableReport(\"倉庫からの返事が時間内に来ませんでした\")"),
    "線に当たったときに「分かりません」を返していません",
  );
  // 投げられた日も答えを返す
  assert.ok(
    probe.includes("unmeasurableReport(\"置き場に聞けませんでした\")"),
    "聞けなかった日に答えを返していません",
  );
});

test("窓口は、線つきの読み方だけを使う（直読みに戻っていないか）", () => {
  const route = readFileSync("app/api/keiri/photos/route.ts", "utf8");
  assert.ok(route.includes("probePhotoShelfWithinBudget"), "線つきの読み方を使っていません");
  assert.ok(
    !/await\s+probePhotoShelf\s*\(/.test(route),
    "線の無い読み方に戻っています（504 が再発します）",
  );
  assert.ok(route.includes("measurable"), "測れたかどうかを返していません");
});
