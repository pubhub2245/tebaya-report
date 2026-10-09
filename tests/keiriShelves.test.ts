import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  describeShelf,
  isMissingShelf,
  missingProbe,
  shelfState,
  summarizeShelves,
  SHELF_STEPS,
} from "../lib/keiri/shelves";
import { TEST_SHOP } from "../lib/keiri/tenantTrial";

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

test("貼り紙に入っているのは6つで、それぞれ仕上げ表の項目につながっている", () => {
  assert.equal(SHELF_STEPS.length, 6);
  const checks = SHELF_STEPS.map((s) => s.check);
  assert.deepEqual(checks, ["f1-4", "f1-5", "f1-6", "f3-4", "f3-4", "f5-4"]);
  for (const s of SHELF_STEPS) {
    assert.ok(s.benefit.length > 10, `${s.key} に「流すと何ができるか」が書かれていません`);
  }
});

test("⑤ シフトの棚に欄を足すところが貼り紙に入っている（2026-10-08・f3-4 の最後の穴）", () => {
  const sql = readFileSync(SQL_PATH, "utf8");
  // 棚が無い倉庫でも途中で止まらないように、あるときだけ足す形
  assert.match(sql, /table_name = 'shifts'/);
  assert.match(sql, /alter table public\.shifts\s*\n\s*add column if not exists tenant_id/);
  assert.ok(sql.includes("create index if not exists shifts_tenant_idx"));
  // 既存の行を書き換えない＝初期値を入れない
  assert.ok(!/add column if not exists tenant_id[^;]*default/i.test(sql));
});

test("⑥ テストのお店1軒を貼り紙の中で作る（2026-10-09・f5-4 を鍵待ちから外す）", () => {
  const sql = readFileSync(SQL_PATH, "utf8");
  const body = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  // 目印・店名・数え始めの日・金庫の起点は、コードの固定値と同じであること
  assert.ok(body.includes(`'${TEST_SHOP.mark}'`));
  assert.ok(body.includes(`'${TEST_SHOP.name}'`));
  assert.ok(body.includes(`'${TEST_SHOP.openingDate}'`));
  assert.ok(body.includes(String(TEST_SHOP.openingBalance)));

  // 新しい窓口（関数）は1つも作らない＝すでにある初回設定の窓口を呼ぶだけ
  assert.ok(!/create\s+(or\s+replace\s+)?function/i.test(body));
  assert.ok(body.includes("public.keiri_tenant_activate("));

  // 何度 流しても増えない（同じ目印があれば作らない・ぶつかっても黙って通す）
  assert.ok(body.includes("on conflict do nothing"));
  assert.ok(body.includes("where t.external_session_id = c_mark"));

  // 管理画面の合言葉は中で作って捨てる＝外から渡せない（誰も入れない）
  assert.ok(/v_hash\s+text\s*:=\s*md5\(/.test(body));

  // 手羽屋のデータには触らない（日報・経費・申し込み・出店場所の行は作らない）
  for (const forbidden of [
    "daily_reports",
    "keiri_advance_expenses",
    "keiri_applications",
    "locations",
    "staff_members",
    "sale_products",
  ]) {
    assert.ok(
      !new RegExp(`insert\\s+into\\s+public\\.${forbidden}`, "i").test(body),
      `貼り紙⑥が ${forbidden} に行を足しています`,
    );
  }
  // 消す・書き換える命令は1つも無い
  for (const forbidden of ["drop ", "truncate ", "delete from"]) {
    assert.ok(!body.toLowerCase().includes(forbidden), `貼り紙に ${forbidden.trim()} が入っています`);
  }
});

test("「貼り紙が作る行がまだ無い」は、棚と同じ「まだ無い」の言い方になる", () => {
  const probe = missingProbe("テストのお店がまだありません");
  assert.equal(shelfState(probe), "まだ無い");
  const report = describeShelf(
    { step: "⑥", name: "テストのお店", benefit: "手順を通せます", check: "f5-4" },
    probe,
  );
  assert.equal(report.state, "まだ無い");
  assert.match(report.note, /貼り紙を1回 貼る/);
});

test("貼り紙は「誰が何をできるか」を1つも変えない（鍵の決まりは足す棚のぶんだけ）", () => {
  const body = readFileSync(SQL_PATH, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();
  // 権限を渡す・取り上げる命令は1つも入れない
  for (const forbidden of ["grant ", "revoke ", "security definer", "alter policy"]) {
    assert.ok(!body.includes(forbidden), `貼り紙に ${forbidden.trim()} が入っています`);
  }
  // 決まりを作るのは、この貼り紙で新しく足した2つの棚だけ
  const created = body.match(/create policy (\w+)/g) ?? [];
  assert.deepEqual(created, [
    "create policy keiri_cash_events_all",
    "create policy keiri_expense_ignores_all",
  ]);
});
