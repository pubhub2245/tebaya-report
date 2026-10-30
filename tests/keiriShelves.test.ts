import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SHELF_SQL_DRYRUN,
  describeShelf,
  dryRunLine,
  isMissingShelf,
  missingProbe,
  shelfState,
  summarizeShelves,
  SHELF_STEPS,
  BACKUP_COPY_TABLE,
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

test("貼り紙に入っているのは13 で、それぞれ仕上げ表の項目につながっている", () => {
  assert.equal(SHELF_STEPS.length, 13);
  const checks = SHELF_STEPS.map((s) => s.check);
  assert.deepEqual(checks, [
    "f1-4",
    "f1-5",
    "f1-6",
    "f3-4",
    "f3-4",
    "f5-4",
    "f3-4",
    // ⑧ よその店の日報を、公開の鍵では読めないようにする（2026-10-15）
    "f3-4",
    // ⑨ 払った記録の棚に「どの店のものか」の欄を足す（2026-10-17）
    "f3-4",
    // ⑩ 立替（経営・本物の棚）を、よその店ぶんだけ読めないようにする（2026-10-17）
    "f3-4",
    // ⑪ 払った記録（給与・外注費）を、よその店ぶんだけ読めないようにする（2026-10-18）
    "f3-4",
    // ⑫ のこりの4つの棚も、よその店ぶんだけ読めないようにする（2026-10-18）
    "f3-4",
    // ⑬ 選択肢の棚（出店場所・担当者・商品と単価）も締める（2026-10-29）
    "f3-4",
  ]);
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

  // 新しい窓口（関数）は1つも作らない＝すでにある初回設定の窓口を呼ぶだけ。
  // ★2026-10-15：⑧が窓口を1つ作るので、**⑥の所だけ**を切り出して見る
  //   （貼り紙ぜんぶを見ると、⑧の窓口に引っかかって意味が変わってしまう）。
  const sixth = body.slice(
    body.indexOf(`'${TEST_SHOP.mark}'`) - 2000 > 0 ? body.indexOf(`'${TEST_SHOP.mark}'`) - 2000 : 0,
    body.indexOf("relrowsecurity = false"),
  );
  assert.ok(!/create\s+(or\s+replace\s+)?function/i.test(sixth));
  assert.ok(body.includes("public.keiri_tenant_activate("));

  // 何度 流しても増えない（同じ目印があれば作らない・ぶつかっても黙って通す）
  assert.ok(body.includes("on conflict do nothing"));
  assert.ok(body.includes("where t.external_session_id = c_mark"));

  // 管理画面の合言葉は中で作って捨てる＝外から渡せない（誰も入れない）
  assert.ok(/v_hash\s+text\s*:=\s*md5\(/.test(body));

  // 手羽屋のデータには触らない（経費・申し込み・出店場所の行は作らない）
  //
  // ★2026-10-17：**日報だけは外した。** ⑥はテストの店の日報を1枚 入れる（手順5）。
  //   ⑧で足す読む決まり（印が空の行だけ 読んでよい）は「入れた行を読み返す」
  //   「印つきの行を消す」にも効くので、公開の鍵ではアプリ側から入れられない
  //   （PostgreSQL 16 で実測）。入れる行は**印がテストの店**で、
  //   手羽屋の行（印が空）は1行も読み書きしない。中身は
  //   tests/keiriShelvesSheet.test.ts で固定値と突き合わせてある。
  //
  // ★2026-10-29：**出店場所（locations）も外した。** ⑬で その棚にも同じ読む決まりを
  //   足すので、日報とまったく同じ理由で、公開の鍵ではアプリ側から入れられない
  //   （下見で実測）。手順4の1件も⑥がこの1枚の中で入れる。印はテストの店。
  //
  // ★2026-10-30：**商品（sale_products）も外した。** 日報の STEP4（単価×本数と売上の
  //   突き合わせ）は申し込んだお店では商品が1件も無くて一度も使えなかったため、
  //   ⑥がそのお店ぶんを1件 入れる。入れる行の印はテストの店で、
  //   手羽屋の商品7件（印が空）には1行も触らない。中身は
  //   tests/keiriShelvesSheet.test.ts で固定値と突き合わせてある。
  for (const forbidden of [
    "keiri_advance_expenses",
    "keiri_applications",
    "staff_members",
  ]) {
    assert.ok(
      !new RegExp(`insert\\s+into\\s+public\\.${forbidden}`, "i").test(body),
      `貼り紙⑥が ${forbidden} に行を足しています`,
    );
  }
  // 商品を入れるときも、必ずテストの店の印を付ける（2026-10-30・kp269）
  const prodInsert = body.slice(body.indexOf("insert into public.sale_products"));
  assert.ok(
    /insert\s+into\s+public\.sale_products\s*\(tenant_id/i.test(prodInsert),
    "⑥の商品に『どの店か』の印を付けていません（手羽屋の商品になってしまいます）",
  );
  assert.ok(
    /where p\.tenant_id = v_id and p\.name = '【テスト】テスト商品'/.test(body),
    "⑥の商品が、何度 流すと増える形になっています",
  );

  // 出店場所を入れるときも、必ずテストの店の印を付ける（2026-10-29・kp266）
  const locInsert = body.slice(body.indexOf("insert into public.locations"));
  assert.ok(
    /insert\s+into\s+public\.locations\s*\(tenant_id/i.test(locInsert),
    "⑥の出店場所に『どの店か』の印を付けていません（手羽屋の行になってしまいます）",
  );
  assert.ok(
    /where l\.tenant_id = v_id and l\.name = '【テスト】テスト広場'/.test(body),
    "⑥の出店場所が、何度 流すと増える形になっています",
  );
  // 日報を入れるときは、必ずテストの店の印を付ける（印が空＝手羽屋の行を作らない）
  const reportInsert = body.slice(body.indexOf("insert into public.daily_reports"));
  assert.ok(
    /insert\s+into\s+public\.daily_reports\s*\(\s*\n?\s*tenant_id/i.test(reportInsert),
    "⑥の日報に『どの店か』の印を付けていません（手羽屋の行になってしまいます）",
  );
  assert.ok(
    /where r\.tenant_id = v_id and r\.date = c_date/.test(body),
    "⑥の日報が、何度 流すと増える形になっています",
  );

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

test("貼り紙は、いまある決まりを1本も消さない・取り上げない（足すだけ）", () => {
  const body = readFileSync(SQL_PATH, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();

  // いまある決まりを消す・作り変える命令は1つも入れない
  for (const forbidden of [
    "drop policy",
    "alter policy",
    "drop function",
    "drop table",
    "grant all",
    "on all tables",
  ]) {
    assert.ok(!body.includes(forbidden), `貼り紙に ${forbidden} が入っています`);
  }

  // 決まりを作るのは、新しく足した2つの棚と、⑧の「読む決まり」だけ
  const created = body.match(/create policy "?(\w+)"?/g) ?? [];
  assert.deepEqual(created, [
    "create policy keiri_cash_events_all",
    "create policy keiri_expense_ignores_all",
    'create policy "keiri_only_tebaya_rows_readable"',
    // ⑩ 立替（経営・本物の棚）を締める（2026-10-17）。⑧と同じ形
    'create policy "keiri_only_tebaya_advances_readable"',
    // ⑪ 払った記録（給与・外注費）を締める（2026-10-18）。⑧⑩と同じ形
    'create policy "keiri_only_tebaya_payments_readable"',
    // ⑫ のこりの4つ（中身が1行も入っていない棚）を締める（2026-10-18）。同じ形
    'create policy "keiri_only_tebaya_settings_readable"',
    'create policy "keiri_only_tebaya_cash_events_readable"',
    'create policy "keiri_only_tebaya_expense_ignores_readable"',
    'create policy "keiri_only_tebaya_advance_expenses_readable"',
    // ⑬ 選択肢の棚（出店場所・担当者・商品と単価）を締める（2026-10-29）。同じ形
    'create policy "keiri_only_tebaya_locations_readable"',
    'create policy "keiri_only_tebaya_staff_readable"',
    'create policy "keiri_only_tebaya_products_readable"',
  ]);

  // ⑧の決まりは「読むときだけ」「印が空の行だけ」の追い禁止であること。
  // ★ここが for all になると、手羽屋の日報の保存まで止まる（絶対に変えない）
  assert.match(
    body,
    /create policy "keiri_only_tebaya_rows_readable" on public\.daily_reports\s*\n\s*as restrictive for select to public\s*\n\s*using \(tenant_id is null\)/,
  );

  // ⑩の決まりも同じ形であること（★for all になると、立替の登録・精算まで止まる）
  assert.match(
    body,
    /create policy "keiri_only_tebaya_advances_readable" on public\.advance_expenses\s*\n\s*as restrictive for select to public\s*\n\s*using \(tenant_id is null\)/,
  );

  // ⑪の決まりも同じ形であること（★for all になると、払った記録の登録・取り消しまで止まる）
  assert.match(
    body,
    /create policy "keiri_only_tebaya_payments_readable" on public\.keiri_payments\s*\n\s*as restrictive for select to public\s*\n\s*using \(tenant_id is null\)/,
  );

  // ⑬の決まりも同じ形であること（★for all になると、日報の選択肢の保存まで止まる）
  for (const [name, table] of [
    ["keiri_only_tebaya_locations_readable", "locations"],
    ["keiri_only_tebaya_staff_readable", "staff_members"],
    ["keiri_only_tebaya_products_readable", "sale_products"],
  ]) {
    assert.match(
      body,
      new RegExp(
        `create policy "${name}" on public\\.${table}\\s*\\n\\s*as restrictive for select to public\\s*\\n\\s*using \\(tenant_id is null\\)`,
      ),
    );
  }

  // ⑧⑩⑪⑫⑬で作る窓口のぶんだけ、許可を渡す。渡す相手は anon / authenticated / service_role のみ
  const grants = body.match(/grant execute on function [^;]+/g) ?? [];
  assert.equal(grants.length, 10, "許可を渡しているのは⑧⑩⑪⑫⑬の窓口10 だけであること");
  assert.match(grants[0], /public\.keiri_tenant_reports\(text, date, date, text\)/);
  assert.match(grants[1], /public\.keiri_tenant_advances_old\(text, date, date, text\)/);
  assert.match(grants[2], /public\.keiri_tenant_payments\(text, date, date, text\)/);
  assert.match(grants[3], /public\.keiri_tenant_settings\(text, date, date, text\)/);
  assert.match(grants[4], /public\.keiri_tenant_cash_events\(text, date, date, text\)/);
  assert.match(grants[5], /public\.keiri_tenant_expense_ignores\(text, date, date, text\)/);
  assert.match(grants[6], /public\.keiri_tenant_advance_expenses\(text, date, date, text\)/);
  assert.match(grants[7], /public\.keiri_tenant_locations\(text, date, date, text\)/);
  assert.match(grants[8], /public\.keiri_tenant_staff\(text, date, date, text\)/);
  assert.match(grants[9], /public\.keiri_tenant_products\(text, date, date, text\)/);
  for (const g of grants) assert.match(g, /to anon, authenticated, service_role/);
  // 渡す前に、だれでも実行できる状態を取り下げている（既存の窓口と同じ形）
  assert.match(
    body,
    /revoke all on function public\.keiri_tenant_reports\(text, date, date, text\) from public/,
  );
  assert.match(
    body,
    /revoke all on function public\.keiri_tenant_advances_old\(text, date, date, text\) from public/,
  );
  assert.match(
    body,
    /revoke all on function public\.keiri_tenant_payments\(text, date, date, text\) from public/,
  );
  // security definer（棚の決まりを飛び越えて読む作り）は、その10 の窓口だけ
  assert.equal((body.match(/security definer/g) ?? []).length, 10);

  // ⑪の窓口は、画面が名乗った「お店の番号」を受け取らない（入り口は合言葉とテストの印だけ）
  const paymentsWindow =
    body.split("create or replace function public.keiri_tenant_payments")[1] ?? "";
  assert.ok(
    paymentsWindow.includes("p_password_hash") && paymentsWindow.includes("p_test_mark"),
    "⑪の窓口の入り口は、合言葉とテストの印の2つだけであること",
  );
  assert.ok(
    !/p_tenant_id|p_tenant\b/.test(paymentsWindow),
    "⑪の窓口が、お店の番号をそのまま受け取る形になっています",
  );
});

test("⑦ 手羽屋のデータの写しに鍵をかける（2026-10-13・2026-10-14 拡大・f3-4）。消さない・決まりは作らない", () => {
  const sql = readFileSync(SQL_PATH, "utf8");
  const body = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  // 2026-10-14：相手を「写しぜんぶ」に広げた。見分けは名前のかたち
  //   （lib/keiri/copyTables.ts と同じ形にそろえてある）
  for (const pattern of [
    "(^|_)backups?(_|$)",
    "(^|_)bak(_|$)",
    "(^|_)copy(_|$)",
    "(^|_)old(_|$)",
    "(^|_)snapshots?(_|$)",
    "^deleted_",
  ]) {
    assert.ok(body.includes(pattern), `⑦ の見分けに ${pattern} が入っていません`);
  }
  // ★止め木①：もう鍵が付いているものは触らない＝何度 流しても同じ。
  //   いま使っている棚はすべて鍵が付いているので、ここで必ず外れる
  assert.ok(body.includes("c.relrowsecurity = false"));
  // ★止め木②：決まり（ポリシー）が1本も無い棚だけ。
  //   いま使っている棚には「全員OK」が1本あるので、ここでも外れる
  assert.match(body, /not exists\s*\(\s*\n?\s*select 1 from pg_policies/);
  // ★止め木③：別のアプリ（pkmn_…）の棚は触らない（CLAUDE.md 4-11）
  assert.match(body, /relname not like 'pkmn\\_%'/);
  // 鍵をかけるだけ。中身は触らない・外さない
  assert.match(body, /enable row level security/);
  assert.ok(!/disable row level security/i.test(body), "貼り紙が鍵を外しています");
  for (const forbidden of ["drop table", "truncate", "delete from", "update public.daily_reports_backup"]) {
    assert.ok(
      !body.toLowerCase().includes(forbidden),
      `貼り紙⑦に ${forbidden} が入っています（控えは元に戻す命綱なので消さない）`,
    );
  }
  // 控えの名前は lib 側と1か所でそろえる
  assert.equal(BACKUP_COPY_TABLE, "daily_reports_backup_20260902");
  const step7 = SHELF_STEPS.find((x) => x.step === "⑦");
  assert.ok(step7, "⑦が一覧に入っていません");
  assert.equal(step7?.check, "f3-4");
});

/**
 * 流す前の「下見」の約束（2026-10-13・f1-4・f3-4・f5-4）。
 *
 * この貼り紙は、仕上げの残り3つが全部 待っている1枚なので、
 * **中身を足したら、もう一度 通してから じゅんに渡す**。
 * 番号を足して下見を忘れると、ここで止まる。
 */
test("貼り紙に番号を足したら、下見もやり直してある", () => {
  for (const s of SHELF_STEPS) {
    assert.ok(
      (SHELF_SQL_DRYRUN.steps as readonly string[]).includes(s.step),
      `${s.step} が下見に入っていません。tools/check-shelves-sql.sh を流し直してください`,
    );
  }
  assert.equal(SHELF_SQL_DRYRUN.steps.length, SHELF_STEPS.length);
  // 下見は「何度 流しても増えない」を見るので、2回以上 流していること
  assert.ok(SHELF_SQL_DRYRUN.runs >= 2);
});

test("下見の1行には、本番ではないことが書いてある", () => {
  const line = dryRunLine();
  assert.match(line, /確かめてあります/);
  assert.match(SHELF_SQL_DRYRUN.caveat, /本番そのものではなく/);
  // 金額・合言葉・鍵の値を書かない（外から読める窓口に出すため）
  const all = JSON.stringify(SHELF_SQL_DRYRUN);
  assert.ok(!/[0-9]{4,}円/.test(all), "下見に金額が入っています");
  assert.ok(!/eyJ|service_role|password/i.test(all), "下見に鍵・合言葉のたぐいが入っています");
});

test("⑨ 払った記録の棚に欄を足すところが貼り紙に入っている（2026-10-17・f3-4）", () => {
  const sql = readFileSync(SQL_PATH, "utf8");
  // 欄を足す（あるときだけ・何度 流しても同じ）
  assert.match(sql, /alter table public\.keiri_payments\s+add column if not exists tenant_id/);
  assert.ok(sql.includes("keiri_payments_tenant_idx"));
  // ★⑨は欄を足すだけ。鍵の決まりも、読む所も触らない。
  //   （2026-10-18：締める工事は⑪として別に足したので、⑨の所だけを切り出して見る）
  const from = sql.indexOf("-- ⑨ 払った記録の棚に「どの店のものか」の欄を足す");
  const to = sql.indexOf("-- ⑩ 立替（経営・いま51行 入っている本物の棚）");
  assert.ok(from > 0 && to > from, "⑨の区切りが見つかりません");
  const nine = sql.slice(from, to);
  assert.ok(
    !/create policy/i.test(nine),
    "⑨ は決まりを作りません（締める工事は⑪です）",
  );
  assert.ok(!/drop\s+policy/i.test(nine), "⑨ は決まりを消しません");
});
