/**
 * 「そのお申し込みに、人が気づけるか」の判定を固定するテスト（2026-09-24・B）。
 *
 * ■ 守りたいこと（やさしい説明）
 *   お申し込みの受け口は「LINE の知らせ」と「倉庫の控え」の2本立てです。
 *   ところが本番では、LINE の残り通数が尽きて知らせが飛ばず、
 *   控えは残るのに鍵が壊れていて読み返せない、という重なりが起こりえます。
 *   そのとき画面に「ありがとうございます」と出しながら、
 *   **こちら側の誰も気づかない**ことになります。最初の1件でこれが起きるといちばん痛い。
 *   ここでは「残ったか」ではなく「**気づけるか**」で判定していることを固定します。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applicationIsReachable,
  describeApplicationDelivery,
} from "../lib/keiri/notifyHealth";

test("LINE が飛べば、控えが読めなくても気づける", () => {
  assert.equal(
    applicationIsReachable({ notified: true, saved: false, recordReadable: false }),
    true,
  );
  assert.equal(
    applicationIsReachable({ notified: true, saved: true, recordReadable: false }),
    true,
  );
});

test("LINE が飛ばなくても、控えが残って読み返せれば気づける", () => {
  assert.equal(
    applicationIsReachable({ notified: false, saved: true, recordReadable: true }),
    true,
  );
});

test("★LINE が飛ばず、控えが残っても読み返せないときは『気づけない』", () => {
  assert.equal(
    applicationIsReachable({ notified: false, saved: true, recordReadable: false }),
    false,
  );
});

test("どちらも通らなければ、当然『気づけない』", () => {
  assert.equal(
    applicationIsReachable({ notified: false, saved: false, recordReadable: true }),
    false,
  );
  assert.equal(
    applicationIsReachable({ notified: false, saved: false, recordReadable: false }),
    false,
  );
});

test("診断：LINE が止まり控えも読み返せないときは『届きます』と言わない", () => {
  const r = describeApplicationDelivery({
    notifyOk: false,
    recordOk: true,
    recordReadable: false,
    mailRecipients: ["a@example.com", "b@example.com"],
  });
  assert.equal(r.ok, false);
  assert.match(r.note, /誰も気づけません/);
  // 下書きの宛先は今までどおり返る
  assert.equal(r.mail_fallback.count, 2);
});

test("recordReadable を渡さなければ、これまでとまったく同じ答え", () => {
  const before = describeApplicationDelivery({
    notifyOk: false,
    recordOk: true,
    mailRecipients: ["a@example.com"],
  });
  assert.equal(before.ok, true);

  // 読み返せると分かっているときも、これまでどおり
  const readable = describeApplicationDelivery({
    notifyOk: false,
    recordOk: true,
    recordReadable: true,
    mailRecipients: ["a@example.com"],
  });
  assert.equal(readable.ok, true);
  assert.equal(readable.note, before.note);
});

test("両方通っているときは、今までどおり『届きます』", () => {
  const r = describeApplicationDelivery({
    notifyOk: true,
    recordOk: true,
    recordReadable: true,
    mailRecipients: ["a@example.com", "b@example.com"],
  });
  assert.equal(r.ok, true);
  assert.match(r.note, /届きます/);
});
