import assert from "node:assert/strict";
import test from "node:test";

import {
  countApplicationsViaWindow,
  describePendingApplications,
  readApplicationCount,
  type ApplicationCountClient,
} from "../lib/keiri/applicationStore";
import { isMissingFunction } from "../lib/keiri/tenantAccess";

/**
 * ここでいちばん守りたいこと（2026-09-24・kp124）
 *
 * ① 「0件」と「数えられない」を**必ず言い分ける**こと。
 *    ひとまとめにすると「申し込みが来ていない」のか
 *    「来ているのに見えていない」のか分からなくなり、判断をまちがえる。
 * ② 待っている申し込みがあるときは、note の先頭に★を出して目に付かせること。
 * ③ 数える処理が **1行も書き込まない**こと（rpc だけを呼ぶ）。
 * ④ 連絡先を受け取らないこと（返すのは数と時刻だけ）。
 */

test("待っている申し込みがあると、件数と★が出る", () => {
  const r = describePendingApplications({
    outcome: "counted",
    readable: false,
    count: { pending: 2, total: 5, latestAt: "2026-09-24T09:00:00+09:00" },
  });
  assert.equal(r.countable, true);
  assert.equal(r.pending, 2);
  assert.equal(r.total, 5);
  assert.ok(r.note.startsWith("★"));
  assert.ok(r.note.includes("2 件"));
});

test("0件のときは「0件」と言い切り、「数えられない」とは言わない", () => {
  const r = describePendingApplications({
    outcome: "counted",
    readable: true,
    count: { pending: 0, total: 0, latestAt: null },
  });
  assert.equal(r.countable, true);
  assert.equal(r.pending, 0);
  assert.ok(r.note.includes("0 件"));
  assert.ok(!r.note.includes("数えられません"));
});

test("窓口がまだ無いときは「0件」と言わず、流す SQL の名前を出す", () => {
  const r = describePendingApplications({ outcome: "no_window" });
  assert.equal(r.countable, false);
  assert.equal(r.pending, null);
  assert.ok(r.note.includes("数えられません"));
  assert.ok(r.note.includes("keiri_applications_summary_fn.sql"));
  // 数えられなくても、申し込み自体は届くことを添える（送ってよいかの判断をまちがえないため）
  assert.ok(r.note.includes("LINE"));
});

test("窓口はあるが呼べなかったときは、SQL を流せとは言わない（直し方が違う）", () => {
  const r = describePendingApplications({ outcome: "failed", detail: "通信に失敗しました" });
  assert.equal(r.countable, false);
  assert.ok(r.note.includes("通信に失敗しました"));
  assert.ok(!r.note.includes("keiri_applications_summary_fn.sql"));
});

test("窓口の返事は、数が文字で返ってきても読める（Postgres の bigint 対策）", () => {
  const c = readApplicationCount([{ pending: "3", total: "7", latest_at: "2026-09-24T00:00:00Z" }]);
  assert.deepEqual(c, { pending: 3, total: 7, latestAt: "2026-09-24T00:00:00Z" });
  // 数が入っていない返事は読めなかった扱いにする（0件と取り違えない）
  assert.equal(readApplicationCount([{}]), null);
  assert.equal(readApplicationCount(null), null);
});

test("数えるときは rpc だけを呼び、1行も書き込まない", async () => {
  const calls: string[] = [];
  const db: ApplicationCountClient = {
    rpc: async (name: string) => {
      calls.push(name);
      return { data: [{ pending: 1, total: 1, latest_at: null }], error: null };
    },
  };
  const r = await countApplicationsViaWindow(db, isMissingFunction);
  assert.deepEqual(calls, ["keiri_applications_summary"]);
  assert.equal(r.outcome, "counted");
});

test("窓口が無いときのエラーは「無い」と見分けられる", async () => {
  const db: ApplicationCountClient = {
    rpc: async () => ({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    }),
  };
  const r = await countApplicationsViaWindow(db, isMissingFunction);
  assert.equal(r.outcome, "no_window");
});
