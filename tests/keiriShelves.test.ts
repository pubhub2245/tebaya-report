import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  describeShelf,
  isMissingShelf,
  shelfState,
  summarizeShelves,
  SHELF_STEPS,
} from "../lib/keiri/shelves";

/**
 * 倉庫に流す貼り紙（kp237）の決まりを固定する。
 *
 * ■ ここで守りたいこと
 *   ① 「棚がまだ無い」と「別の理由で読めない」を混ぜないこと。
 *      混ぜると「流したのに流していないと言う」／「流していないのに流したと言う」が起きる。
 *   ② 貼り紙に **消す命令が1つも入っていない**こと（足すだけ・何度流しても同じ）。
 *   ③ 流す前の本番が今までどおり動くこと＝棚が無いときは「まだ無い」と静かに言うだけ。
 */

const SQL_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "keiri_shelves_20261005.sql",
);

test("棚がまだ無いときは「まだ無い」と言う（番号でも文でも拾う）", () => {
  assert.equal(shelfState({ ok: false, code: "42P01", message: "relation does not exist" }), "まだ無い");
  assert.equal(shelfState({ ok: false, code: "42703", message: "column does not exist" }), "まだ無い");
  assert.equal(shelfState({ ok: false, code: "PGRST205", message: "" }), "まだ無い");
  assert.equal(
    shelfState({ ok: false, code: null, message: "Could not find the table in the schema cache" }),
    "まだ無い",
  );
});

test("別の理由で読めなかったときは「分からない」。流れたことにしない", () => {
  assert.equal(shelfState({ ok: false, code: "42501", message: "permission denied" }), "分からない");
  assert.equal(shelfState({ ok: false, code: null, message: "通信に失敗しました" }), "分からない");
  assert.equal(isMissingShelf({ ok: false, code: "42501", message: "permission denied" }), false);
});

test("1行 読めたら「ある」。読めたものだけを流れたことにする", () => {
  assert.equal(shelfState({ ok: true }), "ある");
  const r = describeShelf(
    { step: "①", name: "金庫", benefit: "突き合わせられる", check: "f1-4" },
    { ok: true },
  );
  assert.equal(r.state, "ある");
  assert.match(r.note, /流れています/);
});

test("まだ無いときの案内には、貼り紙の場所が書いてある", () => {
  const r = describeShelf(
    { step: "②", name: "数えない印", benefit: "片付けられる", check: "f1-5" },
    { ok: false, code: "42P01", message: "does not exist" },
  );
  assert.match(r.note, /\/keiri\/sql/);
});

test("まとめ文は、流れた本数を数える（確かめられなかった分は別に数える）", () => {
  const rows = [
    describeShelf({ step: "①", name: "a", benefit: "", check: "f1-4" }, { ok: true }),
    describeShelf({ step: "②", name: "b", benefit: "", check: "f1-5" }, { ok: false, code: "42P01" }),
    describeShelf({ step: "③", name: "c", benefit: "", check: "f1-6" }, { ok: false, code: "42501" }),
  ];
  const s = summarizeShelves(rows);
  assert.equal(s.done, 1);
  assert.equal(s.total, 3);
  assert.equal(s.allDone, false);
  assert.match(s.summary, /確かめられませんでした/);

  const allOk = SHELF_STEPS.map((x) =>
    describeShelf({ step: x.step, name: x.name, benefit: x.benefit, check: x.check }, { ok: true }),
  );
  const s2 = summarizeShelves(allOk);
  assert.equal(s2.allDone, true);
  assert.equal(s2.done, SHELF_STEPS.length);
});

test("貼り紙には、消す・作り変える命令が1つも入っていない", () => {
  const sql = readFileSync(SQL_PATH, "utf8");
  // コメント行（-- で始まる行）を外した、実際に動く部分だけを見る
  const body = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();
  for (const forbidden of [
    "drop table",
    "drop view",
    "drop column",
    "drop policy",
    "drop index",
    "delete from",
    "truncate",
    "alter column",
    "rename",
    "update public.",
  ]) {
    assert.ok(!body.includes(forbidden), `貼り紙に ${forbidden} が入っています`);
  }
});

test("貼り紙は何度流しても同じ（足すところは必ず if not exists / create or replace）", () => {
  const sql = readFileSync(SQL_PATH, "utf8").toLowerCase();
  assert.ok(sql.includes("create table if not exists public.keiri_cash_events"));
  assert.ok(sql.includes("create table if not exists public.keiri_expense_ignores"));
  assert.ok(sql.includes("create or replace view keiri_reports"));
  assert.ok(sql.includes("add column if not exists tenant_id"));
  // 索引も「あれば作らない」形
  const indexLines = sql.split("\n").filter((l) => l.includes("create index") || l.includes("create unique index"));
  assert.ok(indexLines.length > 0);
  for (const line of indexLines) {
    assert.ok(line.includes("if not exists"), `索引に if not exists がありません: ${line}`);
  }
});

test("軽い日報の見え方は、レシート写真の住所を抜いたまま（印だけ足す）", () => {
  const sql = readFileSync(SQL_PATH, "utf8");
  // 住所を抜く所（x - 'receipt_image_url'）が残っていること
  assert.ok(sql.includes("- 'receipt_image_url'"));
  // 住所そのものを出す列を足していないこと
  assert.ok(!/as\s+receipt_image_url/i.test(sql));
  // 印（ある／ない）と枚数だけを足していること
  assert.ok(sql.includes("'has_receipt'"));
  assert.ok(sql.includes("as receipt_count"));
});

test("貼り紙に入っている棚は4つで、それぞれ仕上げ表の項目につながっている", () => {
  assert.equal(SHELF_STEPS.length, 4);
  const checks = SHELF_STEPS.map((s) => s.check);
  assert.deepEqual(checks, ["f1-4", "f1-5", "f1-6", "f3-4"]);
  for (const s of SHELF_STEPS) {
    assert.ok(s.benefit.length > 10, `${s.key} に「流すと何ができるか」が書かれていません`);
  }
});
