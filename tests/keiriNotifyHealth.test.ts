import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeApplicationDelivery,
  describeMailFallback,
  describeNotify,
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
