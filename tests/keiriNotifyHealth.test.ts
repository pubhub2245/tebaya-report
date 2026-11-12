import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeApplicationDelivery,
  describeMailFallback,
  describeNotify,
  notifyQuotaParts,
  remainingMessages,
  type NotifyFacts,
} from "../lib/keiri/notifyHealth";

const OK: NotifyFacts = {
  tokenSet: true,
  tokenValid: true,
  groupFound: true,
  quota: { limited: true, limit: 200, used: 10 },
};

test("残りの数：上限が無いときは null", () => {
  assert.equal(remainingMessages({ limited: false, limit: null, used: 5 }), null);
  assert.equal(remainingMessages(null), null);
});

test("残りの数：使った分を引く。マイナスにはしない", () => {
  assert.equal(remainingMessages({ limited: true, limit: 200, used: 10 }), 190);
  assert.equal(remainingMessages({ limited: true, limit: 200, used: 250 }), 0);
});

test("ふつうに届く", () => {
  const r = describeNotify(OK);
  assert.equal(r.ok, true);
  assert.equal(r.remaining, 190);
});

test("今月ぶんを使い切っていたら「届く」と言わない（kp60 で実際に起きた形）", () => {
  const r = describeNotify({ ...OK, quota: { limited: true, limit: 200, used: 200 } });
  assert.equal(r.ok, false);
  assert.equal(r.remaining, 0);
  assert.match(r.note, /使い切っています/);
});

test("残りが少ないときは、届くけれど数を添える", () => {
  const r = describeNotify({ ...OK, quota: { limited: true, limit: 200, used: 195 } });
  assert.equal(r.ok, true);
  assert.equal(r.remaining, 5);
  assert.match(r.note, /あと 5 通/);
});

test("合言葉・送り先が欠けていたら届かない", () => {
  assert.equal(describeNotify({ ...OK, tokenSet: false }).ok, false);
  assert.equal(describeNotify({ ...OK, tokenValid: false }).ok, false);
  assert.equal(describeNotify({ ...OK, groupFound: false }).ok, false);
});

test("残りの数が分からなくても、届く判定は出せる", () => {
  const r = describeNotify({ ...OK, quota: null });
  assert.equal(r.ok, true);
  assert.equal(r.remaining, null);
});

test("知らせと控えの両方が死んでいるときだけ「届かない」", () => {
  assert.equal(describeApplicationDelivery({ notifyOk: true, recordOk: true }).ok, true);
  assert.equal(describeApplicationDelivery({ notifyOk: true, recordOk: false }).ok, true);
  assert.equal(describeApplicationDelivery({ notifyOk: false, recordOk: true }).ok, true);
  const dead = describeApplicationDelivery({ notifyOk: false, recordOk: false });
  assert.equal(dead.ok, false);
  assert.match(dead.note, /誰にも届きません/);
});

// ── kp63（2026-09-19）メールの下書きの宛先 ──────────────────
// 受け口が「メールの下書き」1本しかない月に、その宛先が1か所だけだと
// 申し込みが静かに消える。外から1回で分かるようにする。

test("下書きの宛先が1か所だけなら、そのことを警告として出す", () => {
  const r = describeMailFallback(["jun@example.co.jp"]);
  assert.equal(r.count, 1);
  assert.match(r.note, /1か所だけ/);
});

test("下書きの宛先が2か所あれば、何か所に届くかを出す", () => {
  const r = describeMailFallback(["jun@example.co.jp", "hikae@example.com"]);
  assert.equal(r.count, 2);
  assert.match(r.note, /2 か所/);
});

test("同じ宛先を二重に数えない・空は数えない", () => {
  const r = describeMailFallback(["a@b.co", "a@b.co", "", "  "]);
  assert.deepEqual(r.recipients, ["a@b.co"]);
  assert.equal(r.count, 1);
});

test("届くかの見立てに、下書きの宛先の数がいつでも付いてくる", () => {
  const r = describeApplicationDelivery({
    notifyOk: false,
    recordOk: false,
    mailRecipients: ["jun@example.co.jp", "hikae@example.com"],
  });
  assert.equal(r.ok, false);
  assert.equal(r.mail_fallback.count, 2);
});

/* ------------------------------------------------------------------ *
 *  「今月あと何通」が2つの窓口で分かれたとき、どちらがちがうか分かる形
 *  （2026-11-11・f2-2）
 * ------------------------------------------------------------------ */

/**
 * ■ なぜ要るか（11/11 に本番で起きた形）
 *   残りの通数を答える窓口は2つ（/api/keiri/notifycheck と /api/keiri/diagnose）あり、
 *   どちらも同じ関数で数えているのに、同じ版・同じ時刻で
 *   **「あと68通」と「あと2通」**に分かれました。
 *   remaining は引き算の答えなので、それだけを見ても原因が分かりません。
 *   引き算の前の2つの数（上限・使った数）を、どちらの窓口にも出します。
 *   ★どれも通数です（金額・鍵・お店の名前ではありません）。
 */
test("引き算の前の2つの数を、そのまま出す（f2-2）", async () => {
  const { notifyQuotaParts, remainingMessages } = await import("../lib/keiri/notifyHealth");
  const quota = { limited: true, limit: 200, used: 132 };
  const parts = notifyQuotaParts(quota);
  assert.equal(parts.quotaLimit, 200);
  assert.equal(parts.quotaUsed, 132);
  // remaining ＝ 上限 − 使った数（読む人が自分で検算できること）
  assert.equal(remainingMessages(quota), 68);
  assert.equal((parts.quotaLimit ?? 0) - (parts.quotaUsed ?? 0), remainingMessages(quota));
  // どの窓口の数を f2-2 に使うかが、必ず書いてあること
  assert.match(parts.quotaWindow, /notifycheck/);
  // ★数が分かれたときは「きつい側（少ない残り）」で判断する、と必ず書いてあること
  assert.match(parts.quotaSplitNote, /少ないほうの残り/);
});

test("上限が無い契約・分からないときは、数を作らない（f2-2）", async () => {
  const { notifyQuotaParts } = await import("../lib/keiri/notifyHealth");
  assert.deepEqual(
    { l: notifyQuotaParts(null).quotaLimit, u: notifyQuotaParts(null).quotaUsed },
    { l: null, u: null },
  );
  const unlimited = notifyQuotaParts({ limited: false, limit: null, used: 10 });
  assert.equal(unlimited.quotaLimit, null);
  assert.equal(unlimited.quotaUsed, 10);
});

// ── 「きつい側で読む」を、言葉ではなく窓口の数そのものでやる（2026-11-12・f2-2）──
// 2026-11-11 に「少ないほうの残り（きつい側）で判断する」と決めたのに、窓口は
// その時 LINE が返した1つの数をそのまま出していた（＝きつい側を採ったか外から分からない）。

test("使った数が2回で分かれたら、多いほう（きつい側）で残りを出す", () => {
  const remaining = remainingMessages({
    limited: true,
    limit: 200,
    used: 198,
    usedReadings: [132, 198],
  });
  // 68通（甘い側）ではなく 2通（きつい側）
  assert.equal(remaining, 2);
});

test("usedReadings があれば、used の値よりそちらのきつい側を優先する", () => {
  const remaining = remainingMessages({
    limited: true,
    limit: 200,
    used: 132,
    usedReadings: [132, 198],
  });
  assert.equal(remaining, 2);
});

test("聞いた数は窓口にそのまま並べ、分かれたかどうかも出す", () => {
  const parts = notifyQuotaParts({
    limited: true,
    limit: 200,
    used: 198,
    usedReadings: [132, 198],
  });
  assert.deepEqual(parts.quotaUsedReadings, [132, 198]);
  assert.equal(parts.quotaUsed, 198);
  assert.equal(parts.quotaUsedSplit, true);
  assert.match(parts.quotaStrictRule, /多いほう/);
});

test("1回しか聞けなかった月は「分かれた」と言わない（null）", () => {
  const parts = notifyQuotaParts({ limited: true, limit: 200, used: 132, usedReadings: [132] });
  assert.equal(parts.quotaUsedSplit, null);
  assert.equal(parts.quotaUsed, 132);
  assert.equal(remainingMessages({ limited: true, limit: 200, used: 132, usedReadings: [132] }), 68);
});

test("2回とも同じ数なら、分かれていないと言う", () => {
  const parts = notifyQuotaParts({ limited: true, limit: 200, used: 150, usedReadings: [150, 150] });
  assert.equal(parts.quotaUsedSplit, false);
  assert.equal(parts.quotaUsed, 150);
});

test("一度も聞けなかった月は、残りを作らない（null のまま）", () => {
  assert.equal(remainingMessages({ limited: true, limit: 200, used: null, usedReadings: [] }), null);
  const parts = notifyQuotaParts({ limited: true, limit: 200, used: null, usedReadings: [] });
  assert.equal(parts.quotaUsed, null);
  assert.deepEqual(parts.quotaUsedReadings, []);
});
