/**
 * 「テストの店ができたか」を鍵なしで確かめる窓口のテスト（2026-11-02・f5-4・f3-4）。
 *
 * ■ ここが狂うと何が起きるか
 *   貼り紙⑥はテストの店を作りますが、同じ1枚の⑫が
 *   「よその店の経理の設定は公開の鍵では読めない」決まりを足します。
 *   ＝ それまで使っていた確かめ方（設定の行を公開の鍵で読む）は、
 *     **貼り紙を流した瞬間に閉まります**（2026-11-02 に下見で実測：
 *     倉庫の中には1件あるのに、公開の鍵では0件）。
 *   窓口（keiri_tenant_test_peek）か、確かめる順番のどちらかが崩れると、
 *   じゅんが2分で貼ったのに「テストの店がまだありません」と答えたままになり、
 *   手順4〜6（f5-4）がそこで止まります。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { TEST_PEEK_WINDOW } from "../lib/keiri/tenantTrialServer";
import { TEST_SHOP } from "../lib/keiri/tenantTrial";

const SHEET = readFileSync("supabase/migrations/keiri_shelves_20261005.sql", "utf8");
const SERVER = readFileSync("lib/keiri/tenantTrialServer.ts", "utf8");

test("窓口の名前は、アプリと貼り紙で同じ", () => {
  assert.equal(TEST_PEEK_WINDOW, "keiri_tenant_test_peek");
  assert.ok(
    SHEET.includes(`create or replace function public.${TEST_PEEK_WINDOW}(`),
    "貼り紙に窓口が無いと、流しても確かめられない",
  );
});

test("窓口は公開の鍵（anon）から呼べる", () => {
  const grant = new RegExp(
    `grant execute on function public\\.${TEST_PEEK_WINDOW}\\(text\\)\\s*\\n?\\s*to anon`,
  );
  assert.match(SHEET, grant);
});

test("窓口は合言葉を1文字も返さない", () => {
  const start = SHEET.indexOf(`create or replace function public.${TEST_PEEK_WINDOW}(`);
  assert.ok(start > 0);
  const body = SHEET.slice(start, SHEET.indexOf("end $$;", start));
  assert.ok(!body.includes("setup_token"), "初回設定の合言葉を返してはいけない");
  assert.ok(!body.includes("admin_password_hash"), "管理の合言葉を返してはいけない");
  // 返すのは番号・状態・時刻の4つだけ
  for (const col of ["t.id", "t.status", "t.created_at", "t.activated_at"]) {
    assert.ok(body.includes(col), `${col} を返すこと`);
  }
});

test("窓口はテストの1軒だけに答える（印が test- で始まり、店名が【テスト】）", () => {
  const start = SHEET.indexOf(`create or replace function public.${TEST_PEEK_WINDOW}(`);
  const body = SHEET.slice(start, SHEET.indexOf("end $$;", start));
  assert.ok(body.includes("'^test-'"), "テストの印でなければ答えないこと");
  assert.ok(body.includes("'【テスト】%'"), "店名が【テスト】でなければ答えないこと");
  assert.ok(body.includes("v_n <> 1"), "1軒に決まらないときは答えないこと");
});

test("確かめる順番は 鍵 → 窓口 → 設定の行（入れ替えると貼り紙の後に止まる）", () => {
  const peek = SERVER.slice(SERVER.indexOf("export async function peekTestShop"));
  const byKey = peek.indexOf("serviceClientOrNull");
  const byWindow = peek.indexOf("findTestShopViaWindow");
  const bySheet = peek.indexOf("findTestShopViaSettings");
  assert.ok(byKey >= 0 && byWindow >= 0 && bySheet >= 0);
  assert.ok(byKey < byWindow, "鍵があるときは鍵で引くこと");
  assert.ok(
    byWindow < bySheet,
    "窓口を先に聞くこと（貼り紙の後、設定の行は公開の鍵では読めない）",
  );
});

test("窓口に渡す印は、テストの店の固定値", () => {
  assert.equal(TEST_SHOP.mark, "test-b2-kensa-1006");
  assert.ok(TEST_SHOP.mark.startsWith("test-"), "窓口はこの形でしか開かない");
});
