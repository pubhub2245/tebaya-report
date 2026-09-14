/**
 * お客さん向け公式LINE の Webhook 受け口のテスト。
 *
 * ■ ここで固定すること
 *   ・署名が合わない／無いときは 401（LINE以外からの偽物を弾く）
 *   ・LINE の「検証」ボタン（events が空の POST）には 200 を返す
 *   ・テキストは保存＋スタッフグループへ転送。転送に失敗しても保存は成功のまま
 *   ・画像などは "[画像]" のように種別を入れて保存する
 *   ・follow / unfollow は customer_line_events に記録だけ
 *   ・お客さんへは何も送らない（第1段階）
 *
 * 通信は一切しない。保存・転送は差し替えた関数で受け止める。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { verifyCustomerSignature } from "../lib/line/customerClient";
import {
  handleCustomerWebhook,
  summarizeCustomerMessage,
  formatStaffForward,
  userIdTail,
  type CustomerLineMessageRow,
  type CustomerLineEventRow,
} from "../lib/line/customerWebhook";

const SECRET = "test-channel-secret";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

function makeDeps(opts: { forwardOk?: boolean } = {}) {
  const messages: CustomerLineMessageRow[] = [];
  const events: CustomerLineEventRow[] = [];
  const forwarded: string[] = [];
  const deps = {
    channelSecret: SECRET,
    saveMessage: async (row: CustomerLineMessageRow) => {
      messages.push(row);
    },
    saveEvent: async (row: CustomerLineEventRow) => {
      events.push(row);
    },
    forwardToStaff: async (text: string) => {
      forwarded.push(text);
      return opts.forwardOk ?? true;
    },
    log: () => {},
    logError: () => {},
  };
  return { deps, messages, events, forwarded };
}

const USER = "U1234567890abcdef1234567890abcd99";

test("署名検証: 正しい署名だけ通る", () => {
  const body = '{"events":[]}';
  assert.equal(verifyCustomerSignature(body, SECRET, sign(body)), true);
  assert.equal(verifyCustomerSignature(body, SECRET, sign(body, "other")), false);
  assert.equal(verifyCustomerSignature(body, SECRET, "abc"), false);
  assert.equal(verifyCustomerSignature(body, SECRET, null), false);
  assert.equal(verifyCustomerSignature(body, "", sign(body)), false);
});

test("署名が合わない POST は 401（保存も転送もしない）", async () => {
  const { deps, messages, forwarded } = makeDeps();
  const body = JSON.stringify({
    events: [{ type: "message", message: { type: "text", text: "x" }, source: { userId: USER } }],
  });
  const res = await handleCustomerWebhook({ bodyText: body, signature: "wrong" }, deps);
  assert.equal(res.status, 401);
  assert.equal(messages.length, 0);
  assert.equal(forwarded.length, 0);
});

test("合言葉が未設定なら 500", async () => {
  const { deps } = makeDeps();
  const body = '{"events":[]}';
  const res = await handleCustomerWebhook(
    { bodyText: body, signature: sign(body) },
    { ...deps, channelSecret: undefined },
  );
  assert.equal(res.status, 500);
});

test("LINE の「検証」ボタン（events が空）には 200", async () => {
  const { deps, messages, forwarded } = makeDeps();
  const body = '{"destination":"Uxxx","events":[]}';
  const res = await handleCustomerWebhook({ bodyText: body, signature: sign(body) }, deps);
  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
  assert.equal(messages.length, 0);
  assert.equal(forwarded.length, 0);
});

test("テキスト: 保存して、スタッフグループへ決まった文面で転送する", async () => {
  const { deps, messages, forwarded } = makeDeps();
  const body = JSON.stringify({
    events: [
      {
        type: "message",
        timestamp: 1757800000000,
        replyToken: "tok",
        source: { type: "user", userId: USER },
        message: { id: "m1", type: "text", text: "手羽先20本、18時に取りに行きます" },
      },
    ],
  });
  const res = await handleCustomerWebhook({ bodyText: body, signature: sign(body) }, deps);
  assert.equal(res.status, 200);
  assert.equal(res.body.processed, 1);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].line_user_id, USER);
  assert.equal(messages[0].message_type, "text");
  assert.equal(messages[0].message_text, "手羽先20本、18時に取りに行きます");
  assert.equal(messages[0].status, "new");
  assert.equal(messages[0].received_at, new Date(1757800000000).toISOString());

  assert.equal(forwarded.length, 1);
  assert.equal(
    forwarded[0],
    "【お客さんからLINE】\n手羽先20本、18時に取りに行きます\n（送信者ID末尾4桁：cd99）\n※返信は公式LINEアプリの「チャット」から",
  );
});

test("転送に失敗しても保存は成功のまま・200 を返す", async () => {
  const { deps, messages } = makeDeps({ forwardOk: false });
  const body = JSON.stringify({
    events: [{ type: "message", source: { userId: USER }, message: { type: "text", text: "こんにちは" } }],
  });
  const res = await handleCustomerWebhook({ bodyText: body, signature: sign(body) }, deps);
  assert.equal(res.status, 200);
  assert.equal(messages.length, 1);
});

test("保存で例外が出ても 200 を返す（LINE の再送ループを防ぐ）", async () => {
  const { deps } = makeDeps();
  const body = JSON.stringify({
    events: [{ type: "message", source: { userId: USER }, message: { type: "text", text: "x" } }],
  });
  const res = await handleCustomerWebhook(
    { bodyText: body, signature: sign(body) },
    { ...deps, saveMessage: async () => { throw new Error("DB down"); } },
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.processed, 0);
});

test("画像・スタンプは種別を本文に入れて保存＋転送", async () => {
  const { deps, messages, forwarded } = makeDeps();
  const body = JSON.stringify({
    events: [
      { type: "message", source: { userId: USER }, message: { id: "1", type: "image", contentProvider: { type: "line" } } },
      { type: "message", source: { userId: USER }, message: { id: "2", type: "sticker", packageId: "1", stickerId: "2" } },
    ],
  });
  const res = await handleCustomerWebhook({ bodyText: body, signature: sign(body) }, deps);
  assert.equal(res.status, 200);
  assert.deepEqual(
    messages.map((m) => [m.message_type, m.message_text]),
    [["image", "[画像]"], ["sticker", "[スタンプ]"]],
  );
  assert.equal(forwarded.length, 2);
  assert.match(forwarded[0], /\[画像\]/);
});

test("follow / unfollow は出来事の記録だけ（保存も転送もしない）", async () => {
  const { deps, messages, events, forwarded } = makeDeps();
  const body = JSON.stringify({
    events: [
      { type: "follow", timestamp: 1757800000000, source: { userId: USER } },
      { type: "unfollow", timestamp: 1757800001000, source: { userId: USER } },
    ],
  });
  const res = await handleCustomerWebhook({ bodyText: body, signature: sign(body) }, deps);
  assert.equal(res.status, 200);
  assert.equal(messages.length, 0);
  assert.equal(forwarded.length, 0);
  assert.deepEqual(events.map((e) => e.event_type), ["follow", "unfollow"]);
  assert.equal(events[0].line_user_id, USER);
});

test("知らないイベント（postback など）は無視して 200", async () => {
  const { deps, messages, events, forwarded } = makeDeps();
  const body = JSON.stringify({ events: [{ type: "postback", source: { userId: USER } }] });
  const res = await handleCustomerWebhook({ bodyText: body, signature: sign(body) }, deps);
  assert.equal(res.status, 200);
  assert.equal(messages.length + events.length + forwarded.length, 0);
});

test("summarizeCustomerMessage / userIdTail / formatStaffForward", () => {
  assert.equal(summarizeCustomerMessage({ type: "text", text: "abc" }), "abc");
  assert.equal(summarizeCustomerMessage({ type: "video" }), "[動画]");
  assert.equal(summarizeCustomerMessage({ type: "file", fileName: "a.pdf" }), "[ファイル：a.pdf]");
  assert.equal(summarizeCustomerMessage({ type: "location", address: "宮崎県都城市" }), "[位置情報：宮崎県都城市]");
  assert.equal(summarizeCustomerMessage({}), "[不明]");
  assert.equal(userIdTail(USER), "cd99");
  assert.equal(userIdTail(null), "????");
  assert.match(formatStaffForward("本文", USER), /^【お客さんからLINE】\n本文\n/);
});
