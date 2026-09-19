import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  activateTenantViaRpc,
  isMissingFunction,
  loginTenantViaRpc,
  probeTenantRpc,
  type RpcClient,
} from "../lib/keiri/tenantAccess";
import { buildSignupReadiness } from "../lib/keiri/signupReadiness";

/**
 * 経理パッケージ：払ったお店が「人の手を借りずに使い始められる」道の検算（kp93）。
 *
 * ここで固定したいのは1つだけ——
 * **サーバー側の合鍵が壊れていても（kp55）、初回設定と合言葉での入室が通ること。**
 */

/** 窓口の作り物。呼ばれた中身も控えておく */
function fakeRpc(
  answer: (fn: string, args: Record<string, unknown>) => { data: unknown; error: any },
): RpcClient & { calls: Array<{ fn: string; args: Record<string, unknown> }> } {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return answer(fn, args);
    },
  };
}

const HASH = "a".repeat(64);
const INPUT = {
  token: "abcdefghjkmnpqrstuvwxyz234567ab",
  session: "",
  shopName: "デモ食堂",
  openingDate: "2026-10-01",
  openingBalance: 30000,
  adminPasswordHash: HASH,
};

// ------------------------------------------------------------
// 初回設定
// ------------------------------------------------------------

test("初回設定：窓口が ok を返せば、お店の番号を受け取れる", async () => {
  const db = fakeRpc(() => ({
    data: [{ outcome: "ok", tenant_id: "11111111-2222-3333-4444-555555555555", settings_ok: true }],
    error: null,
  }));
  const r = await activateTenantViaRpc(db, INPUT);
  assert.equal(r.outcome, "ok");
  if (r.outcome !== "ok") return;
  assert.equal(r.tenantId, "11111111-2222-3333-4444-555555555555");
  assert.equal(r.settingsOk, true);

  // 生の合言葉は窓口に渡さない（戻せない形だけ）
  const args = db.calls[0].args;
  assert.equal(db.calls[0].fn, "keiri_tenant_activate");
  assert.equal(args.p_admin_password_hash, HASH);
  assert.equal(args.p_token, INPUT.token);
  assert.equal(args.p_session, null);
});

test("初回設定：数え始めの日が入らなくても、お店の行はできている扱いにする", async () => {
  const db = fakeRpc(() => ({
    data: [{ outcome: "ok", tenant_id: "abc", settings_ok: false }],
    error: null,
  }));
  const r = await activateTenantViaRpc(db, INPUT);
  assert.equal(r.outcome, "ok");
  if (r.outcome !== "ok") return;
  assert.equal(r.settingsOk, false);
});

test("初回設定：リンクが違えば not_found、もう終わっていれば already", async () => {
  const notFound = await activateTenantViaRpc(
    fakeRpc(() => ({ data: [{ outcome: "not_found" }], error: null })),
    INPUT,
  );
  assert.equal(notFound.outcome, "not_found");

  const empty = await activateTenantViaRpc(fakeRpc(() => ({ data: [], error: null })), INPUT);
  assert.equal(empty.outcome, "not_found");

  const already = await activateTenantViaRpc(
    fakeRpc(() => ({ data: [{ outcome: "already" }], error: null })),
    INPUT,
  );
  assert.equal(already.outcome, "already");
});

test("初回設定：窓口がまだ無ければ unavailable（＝棚を直接さわる道へ落ちる）", async () => {
  const db = fakeRpc(() => ({
    data: null,
    error: { code: "PGRST202", message: "Could not find the function" },
  }));
  const r = await activateTenantViaRpc(db, INPUT);
  assert.equal(r.outcome, "unavailable");
});

test("初回設定：合言葉が無いときは支払いの番号で引く", async () => {
  const db = fakeRpc(() => ({ data: [{ outcome: "not_found" }], error: null }));
  await activateTenantViaRpc(db, { ...INPUT, token: "", session: "cs_test_123456" });
  assert.equal(db.calls[0].args.p_token, null);
  assert.equal(db.calls[0].args.p_session, "cs_test_123456");
});

// ------------------------------------------------------------
// 合言葉の確認
// ------------------------------------------------------------

test("合言葉：合えばお店の番号と店名だけ返る", async () => {
  const db = fakeRpc(() => ({
    data: [{ tenant_id: "shop-1", shop_name: "デモ食堂" }],
    error: null,
  }));
  const r = await loginTenantViaRpc(db, HASH);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.tenant, { tenantId: "shop-1", shopName: "デモ食堂" });
  assert.equal(db.calls[0].fn, "keiri_tenant_login");
  assert.equal(db.calls[0].args.p_password_hash, HASH);
});

test("合言葉：合わなければ 0行（窓口は動いている）", async () => {
  const r = await loginTenantViaRpc(fakeRpc(() => ({ data: [], error: null })), HASH);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.tenant, null);
});

test("合言葉：窓口が無ければ ok:false（＝棚を直接さわる道へ落ちる）", async () => {
  const r = await loginTenantViaRpc(
    fakeRpc(() => ({ data: null, error: { code: "42883", message: "function does not exist" } })),
    HASH,
  );
  assert.equal(r.ok, false);
});

test("診断：窓口を叩くときは、合うはずのない合言葉を使う（書き込まない・知らせない）", async () => {
  const db = fakeRpc(() => ({ data: [], error: null }));
  const p = await probeTenantRpc(db);
  assert.equal(p.usable, true);
  assert.equal(db.calls[0].fn, "keiri_tenant_login");
  assert.equal(db.calls[0].args.p_password_hash, "0".repeat(64));
});

test("窓口が無いことの見分け方", () => {
  assert.equal(isMissingFunction({ code: "PGRST202" }), true);
  assert.equal(isMissingFunction({ code: "42883" }), true);
  assert.equal(isMissingFunction({ message: "Could not find the function public.x" }), true);
  assert.equal(isMissingFunction({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingFunction(null), false);
});

// ------------------------------------------------------------
// 受け皿の診断
// ------------------------------------------------------------

test("受け皿：鍵が壊れていても、窓口があれば『お店は進める』と判定する", () => {
  const broken = { ok: false, reason: "読めませんでした" };
  const withRpc = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: true },
    tenants: broken,
    settings: broken,
    serverKeyUsable: false,
    tenantRpcUsable: true,
  });
  assert.equal(withRpc.checks.shop_table, true);
  assert.equal(withRpc.checks.settings_table, true);
  assert.equal(withRpc.ready, true);

  // 窓口も無ければ、今までどおり「進めない」
  const without = buildSignupReadiness({
    paymentLink: "https://buy.stripe.com/test_abc",
    secret: { ok: true },
    tenants: broken,
    settings: broken,
    serverKeyUsable: false,
  });
  assert.equal(without.checks.shop_table, false);
  assert.equal(without.ready, false);
});

// ------------------------------------------------------------
// 倉庫に流す SQL の約束（ここが崩れると棚の中身が外から見える）
// ------------------------------------------------------------

test("SQL：外から来る人に渡すのは2つの窓口だけ。手で作る道具は渡さない", () => {
  const sql = readFileSync("supabase/migrations/keiri_tenant_rpc.sql", "utf8");

  // 既定の「誰でも呼べる」を必ず取り上げてから渡している
  assert.match(sql, /revoke all on function public\.keiri_tenant_activate/);
  assert.match(sql, /revoke all on function public\.keiri_tenant_login/);
  assert.match(sql, /revoke all on function public\.keiri_tenant_create_manual/);

  const grants = sql.split("\n").filter((l) => /^grant execute/.test(l.trim()));
  assert.equal(grants.length, 2);
  assert.ok(grants.every((l) => /to anon, authenticated;/.test(l)));
  // ★手で作る道具（申し込みを1行作れてしまう）は、外から来る人に渡さない
  assert.ok(!grants.some((l) => l.includes("keiri_tenant_create_manual")));

  // ★★ここが 2026-09-19 17:05 に実際に空いていた穴です。
  //    Supabase は「これから作る関数は anon が呼んでよい」という既定の決まりを持っているので、
  //    新しく作った窓口には anon への権利が**自動で直接**付きます。
  //    上の `revoke ... from public` では、その直接の権利に届きません。
  //    名指しで取り上げていないと、流し直すたびに黙って開きます。
  assert.match(
    sql,
    /revoke all on function public\.keiri_tenant_create_manual\(text, text\) from anon, authenticated;/,
    "keiri_tenant_create_manual を anon, authenticated から名指しで取り上げていません",
  );

  // 窓口は棚を「代わりに触る」ので security definer。触る範囲も固定する
  assert.equal((sql.match(/security definer/g) ?? []).length, 2);
  assert.equal((sql.match(/set search_path = public, pg_temp/g) ?? []).length, 2);

  // 手羽屋の表には触らない（触るのは keiri_tenants と keiri_settings だけ）
  for (const table of ["daily_reports", "shifts", "setup_checks", "line_groups", "expenses"]) {
    assert.ok(!sql.includes(table), `SQL が ${table} に触れています`);
  }

  // 設定の行には必ずお店の印を付ける（付けないと手羽屋の行とぶつかる）
  assert.match(sql, /business_type_code/);
  assert.match(sql, /'t_' \|\| lower\(v_id::text\)/);
});
