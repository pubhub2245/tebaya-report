/**
 * 「じゅんだけの手続きが のこっています」の知らせ（2026-10-12・f1-4／f3-4／f5-4）の見張り。
 *
 * ここで固定すること（崩したらテストが落ちます）：
 *  ① スタッフの端末（印なし）には出さない
 *  ② 窓口が読めなかったときは出さない（「0件」と「分からない」を取り違えない）
 *  ③ のこりが0件なら出さない
 *  ④ やってほしい順に並べ、合計の分数を正しく足す
 *  ⑤ 画面に出す物に、鍵・金額・お店の名前を持ち込まない
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  SETUP_NOTICE_NOTE,
  readSetupTodoSummary,
  remainingItems,
  remainingMinutes,
  setupNoticeHeadline,
  shouldShowSetupNotice,
} from "../lib/keiri/setupNotice";

/** 本番の窓口（/api/keiri/setuptodo）が 2026-10-12 に返していた中身と同じ形 */
const LIVE = {
  items: [
    {
      id: "shelves",
      order: 1,
      title: "倉庫に貼り紙を1回 貼る",
      minutes: "2分",
      benefit: "5つが一度に前に進みます",
      href: "/keiri/sql",
      checks: ["f1-4", "f1-5", "f1-6", "f3-4", "f5-4"],
      state: "のこり",
      detail: "0／6 が流れています（のこり 6 本）",
    },
    {
      id: "cash",
      order: 2,
      title: "金庫を数えて、金額を1回 入れる",
      minutes: "1分",
      benefit: "合っているかが その場で分かります",
      href: "/keiri",
      checks: ["f1-4"],
      state: "のこり",
      detail: "記録の棚は上の貼り紙でできます",
    },
    {
      id: "key",
      order: 3,
      title: "サーバー側の鍵を貼り直す",
      minutes: "1分",
      benefit: "毎日の自動の控えが戻ります",
      href: "/keiri/key",
      checks: [],
      state: "のこり",
      detail: "鍵の欄に、鍵ではないものが入っています",
    },
  ],
  remaining: 3,
  unknown: 0,
  allDone: false,
  summary: "のこりの手続きは 3 件です（合わせて 4分ほど）",
};

test("本番の返事を読める（のこり3件・4分）", () => {
  const s = readSetupTodoSummary(LIVE);
  assert.ok(s);
  assert.equal(s!.readable, true);
  assert.equal(s!.remaining, 3);
  assert.equal(remainingMinutes(s), 4);
  assert.equal(setupNoticeHeadline(s), "のこりの手続きは 3 件です（合わせて 4分ほど）");
});

test("やってほしい順に並ぶ（貼り紙がいちばん先）", () => {
  const shuffled = { ...LIVE, items: [...LIVE.items].reverse() };
  const items = remainingItems(readSetupTodoSummary(shuffled));
  assert.deepEqual(
    items.map((i) => i.id),
    ["shelves", "cash", "key"],
  );
});

test("①スタッフの端末（印なし）には出さない", () => {
  const s = readSetupTodoSummary(LIVE);
  assert.equal(shouldShowSetupNotice({ ownerDevice: false, summary: s }), false);
  assert.equal(shouldShowSetupNotice({ ownerDevice: true, summary: s }), true);
});

test("②窓口が読めなかったときは出さない", () => {
  assert.equal(readSetupTodoSummary(null), null);
  assert.equal(readSetupTodoSummary("のこり3件"), null);
  assert.equal(readSetupTodoSummary({}), null);
  assert.equal(readSetupTodoSummary({ items: [] }), null);
  assert.equal(readSetupTodoSummary({ items: [{ id: "shelves" }] }), null);
  assert.equal(shouldShowSetupNotice({ ownerDevice: true, summary: null }), false);
});

test("③のこりが0件なら出さない", () => {
  const done = {
    ...LIVE,
    items: LIVE.items.map((i) => ({ ...i, state: "済み" })),
    remaining: 0,
    allDone: true,
    summary: "のこりの手続きはありません",
  };
  const s = readSetupTodoSummary(done);
  assert.ok(s);
  assert.equal(s!.remaining, 0);
  assert.equal(shouldShowSetupNotice({ ownerDevice: true, summary: s }), false);
});

test("「分からない」はのこりに数えない（窓口の数え方に合わせる）", () => {
  const mixed = {
    items: [
      { ...LIVE.items[0], state: "分からない" },
      { ...LIVE.items[1], state: "のこり" },
      { ...LIVE.items[2], state: "済み" },
    ],
    remaining: 1,
    unknown: 1,
    allDone: false,
  };
  const s = readSetupTodoSummary(mixed);
  assert.equal(s!.remaining, 1);
  assert.deepEqual(
    remainingItems(s).map((i) => i.id),
    ["cash"],
  );
  // 窓口が1行のまとめを返さないときは、こちらで作る
  assert.equal(setupNoticeHeadline(s), "のこりの手続きは 1 件です（合わせて 1分ほど）");
});

test("⑤画面に出す1行に、鍵・金額・お店の名前を書かない", () => {
  for (const word of ["eyJ", "SUPABASE", "15,000", "15000", "手羽屋", "もも屋", "円"]) {
    assert.equal(
      SETUP_NOTICE_NOTE.includes(word),
      false,
      `添える1行に「${word}」を書かないこと：${SETUP_NOTICE_NOTE}`,
    );
  }
});

test("ホームと管理者ページに置いてある（置き忘れたら落ちる）", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  for (const file of ["app/page.tsx", "app/admin/page.tsx"]) {
    const src = fs.readFileSync(file, "utf8");
    assert.ok(
      src.includes("<OwnerSetupTodoNotice />"),
      `${file} に <OwnerSetupTodoNotice /> が無い（じゅんが毎日ひらく画面に出さないと、手続きは止まったまま）`,
    );
  }
});

test("印の付いていない端末では、窓口に聞きにも行かない", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const src = fs.readFileSync("app/components/OwnerSetupTodoNotice.tsx", "utf8");
  assert.ok(src.includes("readOwnerDevice()"), "端末の印を見ていない");
  assert.ok(
    src.includes("if (!isOwner) return;"),
    "印が無いときに窓口へ聞きに行かない形（早く返す）が消えている",
  );
  // 手羽屋の棚を直接のぞく道を作っていないこと
  for (const word of ["supabase", "daily_reports", "keiri_tenants"]) {
    assert.equal(src.includes(word), false, `この知らせから「${word}」に触らないこと`);
  }
});
