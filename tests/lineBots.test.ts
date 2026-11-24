import { test } from "node:test";
import assert from "node:assert/strict";
import { LINE_BOTS, groupMembershipChanges, remainingMessages, toLineBot } from "../lib/line/lineBots";

const G = "C" + "a".repeat(32);
const H = "C" + "b".repeat(32);

test("Botの選び方：分からない値は今までどおり手羽屋業務連絡", () => {
  assert.equal(toLineBot("shop"), "shop");
  assert.equal(toLineBot("staff"), "staff");
  assert.equal(toLineBot(undefined), "staff");
  assert.equal(toLineBot("x"), "staff");
});

test("2つのBotは合鍵も棚も別々（日報のBotの合鍵の名前は変えていない）", () => {
  assert.equal(LINE_BOTS.staff.tokenEnv, "LINE_CHANNEL_ACCESS_TOKEN");
  assert.equal(LINE_BOTS.staff.table, "line_groups");
  assert.notEqual(LINE_BOTS.shop.tokenEnv, LINE_BOTS.staff.tokenEnv);
  assert.notEqual(LINE_BOTS.shop.table, LINE_BOTS.staff.table);
});

test("残りの通数：上限ありなら引き算、上限なし・読めないなら null", () => {
  assert.equal(remainingMessages({ type: "limited", value: 200 }, 12), 188);
  assert.equal(remainingMessages({ type: "limited", value: 200 }, 250), 0);
  assert.equal(remainingMessages({ type: "none" }, 3), null);
  assert.equal(remainingMessages(null, 3), null);
});

test("グループに入った・抜けたを拾う（個人のトークや変な番号は無視）", () => {
  const r = groupMembershipChanges([
    { type: "join", source: { type: "group", groupId: G } },
    { type: "message", source: { type: "group", groupId: G } },
    { type: "join", source: { type: "user", userId: "U1" } },
    { type: "leave", source: { type: "group", groupId: H } },
    { type: "join", source: { type: "group", groupId: "Cxyz" } },
  ]);
  assert.deepEqual(r, { joined: [G], left: [H] });
});
