import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGroupPost, GROUP_POST_MAX } from "../lib/line/groupPost";

const G = "C" + "a".repeat(32);

test("Botが入っているグループに、中身のある文章なら送れる", () => {
  assert.equal(checkGroupPost({ groupId: G, text: "マニュアルができました", knownGroupIds: [G] }), null);
});

test("知らないグループ・変な番号には送らない", () => {
  assert.ok(checkGroupPost({ groupId: "C" + "b".repeat(32), text: "x", knownGroupIds: [G] }));
  assert.ok(checkGroupPost({ groupId: "U123", text: "x", knownGroupIds: [G] }));
  assert.ok(checkGroupPost({ groupId: undefined, text: "x", knownGroupIds: [G] }));
});

test("空の文章・長すぎる文章は送らない", () => {
  assert.ok(checkGroupPost({ groupId: G, text: "  ", knownGroupIds: [G] }));
  assert.ok(checkGroupPost({ groupId: G, text: "あ".repeat(GROUP_POST_MAX + 1), knownGroupIds: [G] }));
});
