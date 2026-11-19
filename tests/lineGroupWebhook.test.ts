/**
 * スタッフ向け LINE Bot の、グループ処理のテスト。
 *
 * ■ ここで固定すること
 *   ・push 系（pushMessage / multicast / broadcast）は絶対に呼ばれない
 *     （今月の無料枠 200 通を使い切るおそれがあるため）
 *   ・返信はすべて replyToken を使う（LINE 仕様で reply は通数に数えない）
 *   ・未知グループは line_groups に自動登録して会話を保存する
 *   ・line_message_id が同じイベントは2回目以降は保存しない（LINE の再送対策）
 *   ・テキストがキーワードと**完全一致**したときだけ返信する（部分一致・前後空白は反応しない）
 *   ・「リンク」は特別扱い（登録済みキーワードの一覧を自動生成）
 *   ・「登録確認」はじゅんの動作確認用の固定文面を返す
 *   ・join は line_groups に登録し、replyToken で案内を返す
 *   ・leave は is_active を false にする
 *   ・1対1などグループ以外のイベントは、ここでは触らない
 *   ・表示名の取得に失敗しても会話の保存は続ける
 *
 * 通信は一切しない。倉庫も返信も差し替えた関数で受け止める。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  handleGroupEvents,
  summarizeGroupMessage,
  formatLinkListReply,
  type GroupWebhookDeps,
  type LineGroupMessageRow,
  type LineGroupReplyRow,
  type LineGroupRow,
} from "../lib/line/groupWebhook";

const GROUP = "Cgroup123";
const USER = "U1234567890abcdef1234567890abcd99";

type Harness = {
  deps: GroupWebhookDeps;
  groups: Map<string, LineGroupRow>;
  messages: LineGroupMessageRow[];
  replies: LineGroupReplyRow[];
  replied: Array<{ replyToken: string; text: string }>;
  pushCalls: number;
};

function makeHarness(opts: {
  initialGroup?: LineGroupRow | null;
  replies?: LineGroupReplyRow[];
  displayName?: string | null;
  throwDisplayName?: boolean;
} = {}): Harness {
  const groups = new Map<string, LineGroupRow>();
  if (opts.initialGroup) groups.set(opts.initialGroup.group_id, opts.initialGroup);
  const messages: LineGroupMessageRow[] = [];
  const replies: LineGroupReplyRow[] = opts.replies ?? [];
  const replied: Array<{ replyToken: string; text: string }> = [];
  let pushCalls = 0;
  const seenMessageIds = new Set<string>();

  const deps: GroupWebhookDeps = {
    getGroup: async (groupId) => groups.get(groupId) ?? null,
    insertGroup: async (groupId) => {
      if (!groups.has(groupId)) {
        groups.set(groupId, { group_id: groupId, label: null, is_active: true });
      } else {
        const cur = groups.get(groupId)!;
        groups.set(groupId, { ...cur, is_active: true });
      }
    },
    deactivateGroup: async (groupId) => {
      const cur = groups.get(groupId);
      if (cur) groups.set(groupId, { ...cur, is_active: false });
    },
    saveMessage: async (row) => {
      const id = row.line_message_id;
      if (id && seenMessageIds.has(id)) return { saved: false };
      if (id) seenMessageIds.add(id);
      messages.push(row);
      return { saved: true };
    },
    listActiveReplies: async () => replies,
    getDisplayName: async () => {
      if (opts.throwDisplayName) throw new Error("profile API failed");
      return opts.displayName ?? null;
    },
    replyText: async (replyToken, text) => {
      replied.push({ replyToken, text });
      return true;
    },
    log: () => {},
    logError: () => {},
  };
  // push 系を絶対に呼ばないことを数える仕掛け。
  // 現実の実装では push は MessagingApiClient 経由だが、
  // ここでは「deps に push 系のキーを渡していないこと」で担保する。
  // 万一コードが deps を拡張して push を足した場合に気づけるよう、未知の呼び出しを数える。
  const proxied = new Proxy(deps as any, {
    get(target, prop: string) {
      if (prop.startsWith("push") || prop === "multicast" || prop === "broadcast") {
        pushCalls++;
      }
      return target[prop];
    },
  });

  return {
    deps: proxied as GroupWebhookDeps,
    groups,
    messages,
    replies,
    replied,
    get pushCalls() {
      return pushCalls;
    },
  } as Harness;
}

// --- 小さい部品のテスト ---

test("summarizeGroupMessage: テキスト以外は text=null", () => {
  assert.deepEqual(summarizeGroupMessage({ type: "text", text: "abc" }), {
    type: "text",
    text: "abc",
  });
  assert.deepEqual(summarizeGroupMessage({ type: "image", id: "1" }), {
    type: "image",
    text: null,
  });
  assert.deepEqual(summarizeGroupMessage({ type: "sticker" }), {
    type: "sticker",
    text: null,
  });
  assert.deepEqual(summarizeGroupMessage({}), { type: "unknown", text: null });
});

test("formatLinkListReply: 「リンク」自身は除いて sort_order 順で並べる", () => {
  const list: LineGroupReplyRow[] = [
    { group_id: null, keyword: "リンク", reply_text: "self", sort_order: 20 },
    { group_id: null, keyword: "マニュアル", reply_text: "a", sort_order: 10 },
    { group_id: null, keyword: "シフト", reply_text: "b", sort_order: 5 },
  ];
  const out = formatLinkListReply(list);
  assert.ok(out.startsWith("送れる言葉の一覧："));
  assert.ok(out.includes("・シフト"));
  assert.ok(out.includes("・マニュアル"));
  assert.ok(!out.includes("・リンク"));
  // 順番：sort_order 昇順（5→10）
  assert.ok(out.indexOf("シフト") < out.indexOf("マニュアル"));
});

test("formatLinkListReply: 空なら「まだ登録されていません」", () => {
  assert.match(formatLinkListReply([]), /まだ登録されていません/);
});

// --- join / leave ---

test("join: line_groups に登録し、replyToken で案内を返す（pushは呼ばない）", async () => {
  const h = makeHarness();
  await handleGroupEvents(
    [{ type: "join", replyToken: "tok-join", source: { type: "group", groupId: GROUP } }],
    h.deps,
  );
  assert.equal(h.groups.get(GROUP)?.is_active, true);
  assert.equal(h.replied.length, 1);
  assert.equal(h.replied[0].replyToken, "tok-join");
  assert.match(h.replied[0].text, /記録Bot/);
  assert.match(h.replied[0].text, /マニュアル/);
  assert.match(h.replied[0].text, /リンク/);
  assert.equal(h.pushCalls, 0);
});

test("leave: is_active を false にする", async () => {
  const h = makeHarness({
    initialGroup: { group_id: GROUP, label: "牟田町店", is_active: true },
  });
  await handleGroupEvents(
    [{ type: "leave", source: { type: "group", groupId: GROUP } }],
    h.deps,
  );
  assert.equal(h.groups.get(GROUP)?.is_active, false);
  assert.equal(h.replied.length, 0);
});

// --- message: 保存とキーワード判定 ---

test("message: 未知グループなら自動登録して保存する", async () => {
  const h = makeHarness();
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "tok-msg",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-1", type: "text", text: "おつかれさま" },
      },
    ],
    h.deps,
  );
  assert.equal(h.groups.get(GROUP)?.is_active, true);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].group_id, GROUP);
  assert.equal(h.messages[0].user_id, USER);
  assert.equal(h.messages[0].message_type, "text");
  assert.equal(h.messages[0].text, "おつかれさま");
  assert.equal(h.messages[0].line_message_id, "m-1");
  // キーワードに該当しないので返信はしない
  assert.equal(h.replied.length, 0);
  assert.equal(h.pushCalls, 0);
});

test("message: is_active=false のグループでは保存も返信もしない", async () => {
  const h = makeHarness({
    initialGroup: { group_id: GROUP, label: null, is_active: false },
    replies: [{ group_id: null, keyword: "マニュアル", reply_text: "ok", sort_order: 10 }],
  });
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "tok",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-2", type: "text", text: "マニュアル" },
      },
    ],
    h.deps,
  );
  assert.equal(h.messages.length, 0);
  assert.equal(h.replied.length, 0);
});

test("キーワード完全一致で返信する（部分一致・前後空白は反応しない）", async () => {
  const replies: LineGroupReplyRow[] = [
    { group_id: null, keyword: "マニュアル", reply_text: "調理マニュアルはこちら：（準備中）", sort_order: 10 },
  ];
  const h = makeHarness({
    initialGroup: { group_id: GROUP, label: null, is_active: true },
    replies,
  });
  // 完全一致
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "tok-ok",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-ok", type: "text", text: "マニュアル" },
      },
    ],
    h.deps,
  );
  assert.equal(h.replied.length, 1);
  assert.equal(h.replied[0].text, "調理マニュアルはこちら：（準備中）");

  // 前後空白・部分一致は反応しない
  h.replied.length = 0;
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "tok-ng1",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-ng1", type: "text", text: " マニュアル" },
      },
      {
        type: "message",
        replyToken: "tok-ng2",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-ng2", type: "text", text: "マニュアルお願いします" },
      },
      {
        type: "message",
        replyToken: "tok-ng3",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-ng3", type: "text", text: "まにゅある" },
      },
    ],
    h.deps,
  );
  assert.equal(h.replied.length, 0);
  // しかし保存はする
  assert.equal(h.messages.length, 4);
  assert.equal(h.pushCalls, 0);
});

test("「リンク」は特別扱い：登録済みキーワードから一覧を組み立てて返す", async () => {
  const replies: LineGroupReplyRow[] = [
    { group_id: null, keyword: "マニュアル", reply_text: "a", sort_order: 10 },
    { group_id: null, keyword: "リンク", reply_text: "ignored", sort_order: 20 },
    { group_id: null, keyword: "シフト", reply_text: "b", sort_order: 5 },
  ];
  const h = makeHarness({
    initialGroup: { group_id: GROUP, label: null, is_active: true },
    replies,
  });
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "tok-link",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-link", type: "text", text: "リンク" },
      },
    ],
    h.deps,
  );
  assert.equal(h.replied.length, 1);
  assert.match(h.replied[0].text, /送れる言葉の一覧/);
  assert.match(h.replied[0].text, /・シフト/);
  assert.match(h.replied[0].text, /・マニュアル/);
  // 「リンク」自身は一覧に入れない
  assert.ok(!h.replied[0].text.includes("・リンク"));
});

test("「登録確認」はじゅんの動作確認用の固定文面を返す", async () => {
  const h = makeHarness({
    initialGroup: { group_id: GROUP, label: "牟田町店", is_active: true },
    replies: [],
  });
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "tok-check",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-check", type: "text", text: "登録確認" },
      },
    ],
    h.deps,
  );
  assert.equal(h.replied.length, 1);
  assert.match(h.replied[0].text, /このグループは記録中です/);
  assert.ok(h.replied[0].text.includes(GROUP));
});

test("同じ line_message_id の再送は2回目以降は保存しない（LINE の再配送対策）", async () => {
  const h = makeHarness({
    initialGroup: { group_id: GROUP, label: null, is_active: true },
  });
  const event = {
    type: "message",
    replyToken: "tok-dup",
    source: { type: "group", groupId: GROUP, userId: USER },
    message: { id: "m-dup", type: "text", text: "ただいま" },
  };
  await handleGroupEvents([event], h.deps);
  await handleGroupEvents([event], h.deps);
  assert.equal(h.messages.length, 1);
});

test("画像・スタンプは text=null で保存する（本文の判定もしない）", async () => {
  const replies: LineGroupReplyRow[] = [
    { group_id: null, keyword: "マニュアル", reply_text: "a", sort_order: 10 },
  ];
  const h = makeHarness({
    initialGroup: { group_id: GROUP, label: null, is_active: true },
    replies,
  });
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "tok-img",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-img", type: "image" },
      },
      {
        type: "message",
        replyToken: "tok-stk",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-stk", type: "sticker", packageId: "1", stickerId: "2" },
      },
    ],
    h.deps,
  );
  assert.equal(h.messages.length, 2);
  assert.equal(h.messages[0].message_type, "image");
  assert.equal(h.messages[0].text, null);
  assert.equal(h.messages[1].message_type, "sticker");
  assert.equal(h.replied.length, 0);
});

test("表示名の取得に失敗しても保存は続ける", async () => {
  const h = makeHarness({
    initialGroup: { group_id: GROUP, label: null, is_active: true },
    throwDisplayName: true,
  });
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "tok",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "m-nn", type: "text", text: "こんにちは" },
      },
    ],
    h.deps,
  );
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].display_name, null);
});

test("1対1（source.type!=='group'）はここでは触らない", async () => {
  const h = makeHarness();
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "tok",
        source: { type: "user", userId: USER },
        message: { id: "m-u", type: "text", text: "マニュアル" },
      },
    ],
    h.deps,
  );
  assert.equal(h.messages.length, 0);
  assert.equal(h.replied.length, 0);
  assert.equal(h.groups.size, 0);
});

test("1件目が失敗しても、残りのイベントは処理される", async () => {
  const h = makeHarness({
    initialGroup: { group_id: GROUP, label: null, is_active: true },
  });
  // 1件目は saveMessage を無理やり失敗させる
  const originalSave = h.deps.saveMessage;
  let calls = 0;
  (h.deps as any).saveMessage = async (row: LineGroupMessageRow) => {
    calls++;
    if (calls === 1) throw new Error("DB down");
    return originalSave(row);
  };
  await handleGroupEvents(
    [
      {
        type: "message",
        replyToken: "t1",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "a", type: "text", text: "A" },
      },
      {
        type: "message",
        replyToken: "t2",
        source: { type: "group", groupId: GROUP, userId: USER },
        message: { id: "b", type: "text", text: "B" },
      },
    ],
    h.deps,
  );
  // 2件目は保存される
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].text, "B");
});
