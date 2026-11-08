import assert from "node:assert/strict";
import test from "node:test";

import { describePendingApplications } from "../lib/keiri/applicationStore";
import {
  buildSignupReadiness,
  describeTableError,
  type TableCheck,
} from "../lib/keiri/signupReadiness";

/**
 * ここでいちばん守りたいこと（2026-11-08・B／f2-1・f2-2）
 *
 * **倉庫（データのしまい場所）まで届かなかったことを、「駄目だった」と数えない。**
 *
 * 本番で実際に起きていたこと（版 60f85ef・2026-11-08 13:3x に実測）：
 *   ・/api/keiri/applications/count … 「まだ数えられません（TypeError: fetch failed）。
 *     **SQL はもう流してあるので、原因は別にあります**」
 *     ＝ 倉庫に1回も届いていないのに、流してあること・原因が別にあることを言い切っていた
 *   ・/api/keiri/diagnose … 「つながっていません。**残り 2 か所**」
 *     ＋ shop_table:false・settings_table:false・「読めませんでした（）」
 *     ＝ 読めなかったのではなく、届いていない。置き場があるかどうかは分からない
 *
 * どちらも**実際より悪く**出すので、読んだ人は「申し込みの受け皿が壊れている」側へ向かう。
 * 倉庫が起きれば何も直さずに通るのに、要らない手続きを探すことになる
 * （lib/keiri/signupReadiness.ts の 2026-09-26 の注意書きと同じまちがい）。
 */

const okCheck: TableCheck = { ok: true, reason: null };
const unreachableCheck: TableCheck = {
  ok: false,
  reason: describeTableError(null, "TypeError: fetch failed"),
  unreachable: true,
};
const missingCheck: TableCheck = {
  ok: false,
  reason: describeTableError("42P01", 'relation "keiri_tenants" does not exist'),
};

const base = {
  paymentLink: null,
  secret: { ok: false, reason: "未設定" },
  serverKeyUsable: false,
  tenantRpcUsable: false,
  applicationDeliveryOk: true,
};

test("倉庫に届かなかった日は、ready も置き場の○× も null（測れていない）", () => {
  const r = buildSignupReadiness({
    ...base,
    tenants: unreachableCheck,
    settings: unreachableCheck,
  });
  assert.equal(r.measurable, false);
  assert.equal(r.ready, null);
  assert.equal(r.checks.shop_table, null);
  assert.equal(r.checks.settings_table, null);
  // 確かめていない数を「残り ◯か所」として出さない
  assert.ok(!/残り \d+ か所/.test(r.summary), r.summary);
  assert.ok(r.summary.includes("いまは測れませんでした"), r.summary);
  assert.ok(r.todo.some((t) => t.includes("合格にも不合格にもしていません")), r.todo.join("/"));
});

test("片方だけ届かなかった日も、測れていない側に倒す", () => {
  const r = buildSignupReadiness({
    ...base,
    tenants: okCheck,
    settings: unreachableCheck,
  });
  assert.equal(r.measurable, false);
  assert.equal(r.ready, null);
});

test("倉庫の窓口が実際に答えているなら、届いている証拠があるので今までどおり判定する", () => {
  const r = buildSignupReadiness({
    ...base,
    tenants: unreachableCheck,
    settings: unreachableCheck,
    tenantRpcUsable: true,
  });
  assert.equal(r.measurable, true);
  assert.equal(r.ready, true);
  assert.equal(r.checks.shop_table, true);
});

test("本当に置き場が無い日は、今までどおり不合格（残り ◯か所）のまま", () => {
  const r = buildSignupReadiness({
    ...base,
    tenants: missingCheck,
    settings: missingCheck,
  });
  assert.equal(r.measurable, true);
  assert.equal(r.ready, false);
  assert.equal(r.checks.shop_table, false);
  assert.ok(/残り 2 か所/.test(r.summary), r.summary);
});

test("ふだんどおり読めた日は、今までとまったく同じ答え（鍵が壊れている＝残りが出る）", () => {
  const r = buildSignupReadiness({ ...base, tenants: okCheck, settings: okCheck });
  assert.equal(r.measurable, true);
  // 鍵（SUPABASE_SERVICE_ROLE_KEY）が使えないので、読めていても受け付けられない。
  // ここは 2026-09-19（kp76）からの決まりで、この回では1文字も変えていない
  assert.equal(r.ready, false);
  assert.equal(r.route, "bank");
  assert.ok(/残り \d+ か所/.test(r.summary), r.summary);
});

test("読めて鍵も使える日は、今までどおり「受け付けられます」", () => {
  const r = buildSignupReadiness({
    ...base,
    serverKeyUsable: true,
    tenants: okCheck,
    settings: okCheck,
  });
  assert.equal(r.measurable, true);
  assert.equal(r.ready, true);
  assert.ok(r.summary.includes("銀行振込でお申し込みを受け付けられます"), r.summary);
});

test("届かなかったときの言葉に、英語のエラー文を出さない", () => {
  const said = describeTableError(null, "TypeError: fetch failed");
  assert.ok(said.includes("つながりませんでした"), said);
  assert.ok(!/fetch|TypeError/i.test(said), said);
  // 置き場があるかどうかを言い切らない
  assert.ok(!said.includes("置き場（表）が本番にありません"), said);
});

test("理由が空のときに「読めませんでした（）」と出さない", () => {
  assert.equal(describeTableError("", "なにかの失敗"), "読めませんでした（理由不明）");
  assert.equal(describeTableError(null, "なにかの失敗"), "読めませんでした（理由不明）");
});

test("申し込みの数：届かなかった日は「原因は別にあります」と言い切らない", () => {
  const r = describePendingApplications({
    outcome: "failed",
    detail: "TypeError: fetch failed",
  });
  assert.equal(r.countable, false);
  assert.equal(r.unreachable, true);
  assert.equal(r.pending, null);
  assert.ok(!r.note.includes("SQL はもう流してある"), r.note);
  assert.ok(!/fetch|TypeError/i.test(r.note), r.note);
  assert.ok(r.note.includes("倉庫"), r.note);
  // 取りこぼしの不安には今までどおり答える
  assert.ok(r.note.includes("控えとして残り"), r.note);
});

test("申し込みの数：本当に断られた日は、今までどおりの言い方のまま", () => {
  const r = describePendingApplications({
    outcome: "failed",
    detail: "窓口の返事を読めませんでした",
  });
  assert.equal(r.unreachable, false);
  assert.ok(r.note.includes("SQL はもう流してあるので、原因は別にあります"), r.note);
});

test("申し込みの数：数えられた日と窓口が無い日は unreachable を立てない", () => {
  const counted = describePendingApplications({
    outcome: "counted",
    readable: true,
    count: { pending: 0, total: 3, latestAt: null },
  });
  assert.equal(counted.unreachable, false);
  assert.equal(counted.countable, true);
  const noWindow = describePendingApplications({ outcome: "no_window" });
  assert.equal(noWindow.unreachable, false);
});
