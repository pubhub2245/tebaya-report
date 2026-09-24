/**
 * 現場の立替（/keiri/advances）を、お店ごとに分けて使えるようにする道具の検算。
 *
 * ここで固定しておきたいのは3つです：
 *   ① 「その欄がまだ無い」という断りだけを、正しく見分けられること
 *   ② 「種類」の選択肢を、新しい科目を作らずに用意していること
 *   ③ 税区分（消費税の扱い）を、こちらで勝手に決めていないこと
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADVANCE_TENANT_MIGRATION,
  FALLBACK_ADVANCE_TYPES,
  describeAdvanceTenantColumn,
  isMissingTenantColumn,
} from "../lib/keiri/advanceScope";
import { ACCOUNTS, EXPENSE_ACCOUNTS } from "../lib/keiri/accounts";

/* ---------------- ① 断り方の見分け ---------------- */

test("「印の欄がまだ無い」という断りを見分けられる", () => {
  assert.equal(isMissingTenantColumn({ code: "42703" }), true);
  assert.equal(
    isMissingTenantColumn({
      message: 'column keiri_advance_expenses.tenant_id does not exist',
    }),
    true,
  );
  assert.equal(
    isMissingTenantColumn({
      message: "Could not find the 'tenant_id' column of 'keiri_advance_expenses' in the schema cache",
    }),
    true,
  );
});

test("それ以外の失敗を「欄が無い」と取り違えない（守りを緩めないため）", () => {
  // 何も起きていない
  assert.equal(isMissingTenantColumn(null), false);
  assert.equal(isMissingTenantColumn(undefined), false);
  // 通信できない・権限が無い・別の列の話
  assert.equal(isMissingTenantColumn({ message: "Failed to fetch" }), false);
  assert.equal(
    isMissingTenantColumn({ code: "42501", message: "permission denied for table keiri_advance_expenses" }),
    false,
  );
  assert.equal(
    isMissingTenantColumn({ message: 'column "payer" does not exist' }),
    false,
  );
  // 棚そのものが無い（42P01）も「欄が無い」ではない
  assert.equal(
    isMissingTenantColumn({ code: "42P01", message: 'relation "keiri_advance_expenses" does not exist' }),
    false,
  );
  // 「まだ1件も無い」は断りではない
  assert.equal(isMissingTenantColumn({ code: "PGRST116", message: "no rows" }), false);
});

/* ---------------- ② 選択肢は、科目を増やしていない ---------------- */

test("立替の「種類」は、このアプリが元から持っている科目だけでできている", () => {
  const known = new Set(ACCOUNTS.map((a) => a.label));
  for (const o of FALLBACK_ADVANCE_TYPES) {
    assert.ok(
      known.has(o.label),
      `「${o.label}」は lib/keiri/accounts.ts に無い科目です（勝手に足さないこと）`,
    );
  }
});

test("その場で立て替えない科目（家賃・人件費のまとめ・外注費）は出さない", () => {
  const labels = FALLBACK_ADVANCE_TYPES.map((o) => o.label);
  for (const ng of ["家賃（事務所）", "人件費", "外注費（Alpha）", "売上高"]) {
    assert.ok(!labels.includes(ng), `「${ng}」が立替の種類に出ています`);
  }
  // 手羽屋だけで使う呼び名（Alpha＝じゅんさんの会社）が、よそのお店に出ないこと
  assert.ok(
    !labels.some((l) => l.includes("Alpha")),
    "よそのお店の画面に「Alpha」が出ています（kp120 と同じ間違い）",
  );
});

test("ふだんの買い物の科目は、ひとつ残らず選べる", () => {
  const expected = EXPENSE_ACCOUNTS.filter((a) => a.fromExpenseText).map((a) => a.label);
  assert.deepEqual(
    FALLBACK_ADVANCE_TYPES.map((o) => o.label),
    expected,
  );
  assert.ok(FALLBACK_ADVANCE_TYPES.length > 0, "選択肢が0個だと1件も登録できません");
});

/* ---------------- ③ 税務の判断はしない ---------------- */

test("税区分は、こちらで決めない（決まっていないものは空のまま）", () => {
  for (const o of FALLBACK_ADVANCE_TYPES) {
    assert.equal(
      o.tax_category,
      null,
      `「${o.label}」に税区分が書き込まれています。このアプリは税務の判断をしません`,
    );
    assert.equal(o.needs_tax_advisor_review, true);
  }
});

test("確かめが返って来ないときも、画面は固まらず「開かない」に倒れる", () => {
  /**
   * 電波の悪い所では、倉庫への問い合わせが何十秒も返らないことがある。
   * そのあいだ「読み込み中…」のままだと、画面が固まったように見える。
   * 数秒で見切りをつけて、これまでどおりの案内を出す。
   */
  const src = readFileSync("app/keiri/advances/page.tsx", "utf8");
  assert.ok(
    /PROBE_TIMEOUT_MS\s*=\s*\d+/.test(src),
    "確かめに待つ上限が決められていません（画面が固まります）",
  );
  assert.ok(
    /setTimeout\(\(\) => resolve\(false\), PROBE_TIMEOUT_MS\)/.test(src),
    "待ちきれなかったときに「開かない」側へ倒れていません",
  );
  assert.ok(
    /Promise\.race\(\[answer, timeout\]\)/.test(src),
    "確かめと待ち時間を競わせる形になっていません",
  );
});

test("画面も、決まっていない税区分を数字や記号でごまかさない", () => {
  const src = readFileSync("app/keiri/advances/page.tsx", "utf8");
  assert.ok(
    src.includes("まだ決まっていません"),
    "税区分が決まっていないときの言い方が、画面にありません",
  );
  assert.ok(
    src.includes("このアプリは税務の判断をしません"),
    "税務の判断をしないという断りが、画面から消えています",
  );
});

/* ---------------- 倉庫に流す SQL の中身 ---------------- */

test("印の欄を足す SQL は、足すだけで何も消さない", () => {
  const sql = readFileSync(
    "supabase/migrations/keiri_advance_expenses_tenant_id.sql",
    "utf8",
  );
  assert.ok(
    /add column if not exists tenant_id uuid/.test(sql),
    "SQL が「欄を1つ足す」形になっていません",
  );
  assert.ok(
    /create index if not exists/.test(sql),
    "何度実行しても安全な形（if not exists）になっていません",
  );
  for (const ng of ["drop ", "delete from", "truncate", "update public."]) {
    assert.ok(
      !sql.toLowerCase().includes(ng),
      `SQL に「${ng}」が入っています。この SQL は足すだけのはずです`,
    );
  }
});

/* ---------------- ④ 「欄ができているか」の診断の言葉 ---------------- */

test("欄があれば「使えます」と答える", () => {
  const r = describeAdvanceTenantColumn({ ok: true });
  assert.equal(r.usable, true);
  assert.equal(r.known, true);
  // 手羽屋のデータが変わらないことを、読む人に必ず伝える
  assert.ok(r.note.includes("今までどおり"));
});

test("欄がまだ無ければ「まだ使えません」と答え、流す SQL の名前を出す", () => {
  const r = describeAdvanceTenantColumn({
    ok: false,
    error: { code: "42703", message: 'column "tenant_id" does not exist' },
  });
  assert.equal(r.usable, false);
  assert.equal(r.known, true);
  assert.ok(r.note.includes(ADVANCE_TENANT_MIGRATION));
});

test("欄が無いのか読めなかったのか分からないときは、分からないと答える（使えると言わない）", () => {
  const r = describeAdvanceTenantColumn({
    ok: false,
    error: { code: "PGRST301", message: "JWT expired" },
  });
  assert.equal(r.usable, false);
  // ★ここが肝心。分からないものを「欄が無いだけ」と言い切らない
  assert.equal(r.known, false);
  assert.ok(!r.note.includes(ADVANCE_TENANT_MIGRATION));
});

test("通信そのものに失敗しても「使えます」とは決して答えない（戻り止め）", () => {
  for (const probe of [
    { ok: false, error: null },
    { ok: false, error: undefined },
    { ok: false, error: { message: null, code: null } },
  ]) {
    assert.equal(describeAdvanceTenantColumn(probe).usable, false);
  }
});
