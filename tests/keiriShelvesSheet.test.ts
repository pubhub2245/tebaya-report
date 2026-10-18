/**
 * 貼り紙（supabase/migrations/keiri_shelves_20261005.sql）の⑥が入れる
 * 「テストの店の日報1枚」（手順5）が、コード側の固定値とずれないかを縛るテスト。
 *
 * ■ なぜ要るか（2026-10-17）
 *   手順5の日報は、2026-10-17 から**貼り紙⑥の中で**入れている。
 *   理由は⑧で足す読む決まり（印が空の行だけ 読んでよい）が
 *   「入れた行を読み返す」「印つきの行を消す」にも効き、
 *   公開の鍵ではテストの店の日報を入れることも消すこともできないため（実測）。
 *   その結果、同じ値が **TypeScript（lib/keiri/tenantTrialSteps.ts）と
 *   SQL（貼り紙⑥）の2か所**に書かれている。
 *   片方だけ直すと「手順は通ったのに中身が違う」になるので、ここで縛る。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { TEST_SHOP } from "../lib/keiri/tenantTrial";
import { TEST_LOCATION, TEST_REPORT, testReportDate } from "../lib/keiri/tenantTrialSteps";
import { PENDING_SHELVES, SHARED_SHELVES } from "../lib/keiri/shelfScope";

const SHEET = "supabase/migrations/keiri_shelves_20261005.sql";
const sql = readFileSync(SHEET, "utf8");

/** ⑥の do ブロックだけを切り出す（ほかの番号の中身に当たらないように） */
function stepSix(): string {
  const from = sql.indexOf("-- ⑥ テストのお店1軒");
  const to = sql.indexOf("-- ⑦ 日報の「古い控え」に鍵をかける");
  assert.ok(from > 0 && to > from, "⑥の区切りが見つかりません");
  return sql.slice(from, to);
}

test("⑥は手順5の日報を1枚だけ入れる（増やさない形になっている）", () => {
  const six = stepSix();
  assert.ok(six.includes("insert into public.daily_reports"), "日報を入れる所がありません");
  assert.ok(
    six.includes("where r.tenant_id = v_id and r.date = c_date"),
    "同じお店・同じ日の行があるかを見ていません（何度 流すと増えてしまいます）",
  );
});

test("⑥の日報の中身が、コード側の固定値と同じ", () => {
  const six = stepSix();
  for (const v of [
    String(TEST_REPORT.sales),
    String(TEST_REPORT.labor),
    String(TEST_REPORT.expenseAmount),
    TEST_REPORT.expenseLabel,
    TEST_REPORT.staffName,
    TEST_REPORT.shop,
    TEST_LOCATION.name,
  ]) {
    assert.ok(six.includes(v), `⑥に ${v} がありません（コード側とずれています）`);
  }
});

test("⑥の日報の日付が、テストの店の数え始めの日と同じ", () => {
  const six = stepSix();
  assert.equal(testReportDate(), TEST_SHOP.openingDate);
  assert.ok(
    six.includes(`c_date    constant date := '${TEST_SHOP.openingDate}'`),
    "⑥の日付が、テストの店の数え始めの日と違います",
  );
});

test("⑥が入れる行は、ぜんぶテストの店の印（手羽屋の行に混ざらない）", () => {
  const six = stepSix();
  const insert = six.slice(six.indexOf("insert into public.daily_reports"));
  assert.ok(insert.includes("tenant_id"), "日報に『どの店か』の印を入れていません");
  assert.ok(
    insert.includes("v_id, c_date"),
    "印にテストの店の番号（v_id）を入れていません",
  );
});

test("⑧の説明が「アプリ側からは入れられない・消せない」に直っている", () => {
  // 以前は「テストの店の日報を1枚 入れて取り消す道も通ります」と書いてあった。
  // 実測すると逆（入れられない・消せない）だったので、言い直してある。
  // その言い回しが残っていてもよいのは、**誤りだったと断ってある所だけ**。
  const idx = sql.indexOf("テストの店の日報を1枚 入れて取り消す道も通ります");
  if (idx >= 0) {
    assert.ok(
      sql.slice(idx, idx + 200).includes("誤り"),
      "⑧に、実測で誤りだった説明が、誤りと断らずに残っています",
    );
  }
  assert.ok(
    sql.includes("印つきの日報を入れて番号を受け取ることも、消すこともできません"),
    "⑧に、実測して分かったこと（入れられない・消せない）が書いてありません",
  );
});

/* ------------------------------------------------------------------ *
 *  ⑩ 立替（経営）を締める（2026-10-17・f3-4・kp253 ③）
 * ------------------------------------------------------------------ */

/** ⑩の所だけを切り出す */
function stepTen(): string {
  const from = sql.indexOf("-- ⑩ 立替（経営・いま51行 入っている本物の棚）");
  // ★2026-10-18：うしろに⑪が入ったので、区切りは⑪の見出しまで
  //   （ここを「確かめ方」までにしておくと、⑪の中身まで⑩として数えてしまう）
  const to = sql.indexOf("-- ⑪ 払った記録（給与・外注費）");
  assert.ok(from > 0 && to > from, "⑩の区切りが見つかりません");
  return sql.slice(from, to);
}

test("⑩の窓口と棚の名前が、コード側の一覧と同じ", () => {
  const ten = stepTen();
  const plan = PENDING_SHELVES.find((p) => p.table === "advance_expenses");
  assert.ok(plan, "締める棚の一覧に立替（経営）がありません");
  assert.ok(
    ten.includes(`create or replace function public.${plan!.window}(`),
    `⑩が作る窓口の名前が、コード側（${plan!.window}）とちがいます`,
  );
  assert.ok(
    ten.includes(`on public.${plan!.table}`),
    "⑩が締める棚の名前が、コード側とちがいます",
  );
});

test("⑩は「読むときだけ」の追い禁止の決まりを1本 足すだけ（消さない）", () => {
  const ten = stepTen();
  assert.ok(ten.includes("as restrictive for select"), "読むときだけの決まりになっていません");
  assert.ok(ten.includes("using (tenant_id is null)"), "「印が空の行だけ」になっていません");
  // 説明文には「元に戻す1行」として drop policy が書いてあるので、**流れる所だけ**を見る
  const runs = ten
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .toLowerCase();
  for (const bad of ["drop policy", "drop table", "delete from", "truncate", "alter column"]) {
    assert.ok(!runs.includes(bad), `⑩の流れる所に ${bad} が入っています（消す操作は禁止）`);
  }
});

test("⑩の窓口は、画面が名乗った番号を受け取らない（合言葉かテストの印だけ）", () => {
  const ten = stepTen();
  assert.ok(ten.includes("p_password_hash"), "合言葉の入り口がありません");
  assert.ok(ten.includes("p_test_mark"), "テストの印の入り口がありません");
  assert.ok(!ten.includes("p_tenant_id"), "お店の番号を受け取る入り口が付いています");
  assert.ok(ten.includes("[0-9a-f]{64}"), "合言葉のかたちを確かめていません");
});

test("⑩の窓口は、レシート写真の住所を返さない", () => {
  const ten = stepTen();
  const body = ten.slice(ten.indexOf("return query"));
  assert.ok(!body.includes("receipt_image_url"), "写真の住所を返しています");
});

test("分けないと決めた棚は、貼り紙の⑩に理由が書いてある", () => {
  const ten = stepTen();
  for (const s of SHARED_SHELVES) {
    assert.ok(ten.includes(s.table), `⑩に ${s.table} の決めが書かれていません`);
  }
});

/* ------------------------------------------------------------------ *
 *  ⑪ 払った記録（給与・外注費）を締める（2026-10-18・f3-4・kp253 ③）
 *
 *  ■ ここで縛っていること
 *    ⑪は⑧⑩と**同じ形**（読む決まりと倉庫の窓口を対で足す）であること。
 *    形が崩れると、手羽屋の経理画面（まだ払っていないお金・払った記録）が
 *    止まるか、よその店の**給与の金額**が公開の鍵で読めたままになります。
 * ------------------------------------------------------------------ */

/** ⑪の所だけを切り出す */
function stepEleven(): string {
  const from = sql.indexOf("-- ⑪ 払った記録（給与・外注費）");
  const to = sql.indexOf("-- 確かめ方（流したあと");
  assert.ok(from > 0 && to > from, "⑪の区切りが見つかりません");
  return sql.slice(from, to);
}

test("⑪の窓口と棚の名前が、コード側の一覧と同じ", () => {
  const eleven = stepEleven();
  const plan = PENDING_SHELVES.find((p) => p.table === "keiri_payments");
  assert.ok(plan, "締める棚の一覧に払った記録がありません");
  assert.ok(
    eleven.includes(`create or replace function public.${plan!.window}(`),
    `⑪が作る窓口の名前が、コード側（${plan!.window}）とちがいます`,
  );
  assert.ok(
    eleven.includes(`on public.${plan!.table}`),
    "⑪が締める棚の名前が、コード側とちがいます",
  );
});

test("⑪は「読むときだけ」の追い禁止の決まりを1本 足すだけ（消さない）", () => {
  const eleven = stepEleven();
  assert.ok(eleven.includes("as restrictive for select"), "読むときだけの決まりになっていません");
  assert.ok(eleven.includes("using (tenant_id is null)"), "「印が空の行だけ」になっていません");
  const runs = eleven
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .toLowerCase();
  for (const bad of ["drop policy", "drop table", "delete from", "truncate", "alter column"]) {
    assert.ok(!runs.includes(bad), `⑪の流れる所に ${bad} が入っています（消す操作は禁止）`);
  }
});

test("⑪の窓口は、画面が名乗った番号を受け取らない（合言葉かテストの印だけ）", () => {
  const eleven = stepEleven();
  assert.ok(eleven.includes("p_password_hash"), "合言葉の入り口がありません");
  assert.ok(eleven.includes("p_test_mark"), "テストの印の入り口がありません");
  assert.ok(!eleven.includes("p_tenant_id"), "お店の番号を受け取る入り口が付いています");
  assert.ok(eleven.includes("[0-9a-f]{64}"), "合言葉のかたちを確かめていません");
});

test("⑪の窓口は、お店の名前・合言葉・連絡先を返さない（返すのは払った記録だけ）", () => {
  const eleven = stepEleven();
  const body = eleven.slice(eleven.indexOf("return query"));
  for (const bad of ["shop_name", "admin_password_hash", "contact", "setup_token"]) {
    assert.ok(!body.includes(bad), `⑪の窓口が ${bad} を返しています`);
  }
  assert.ok(body.includes("p.amount") && body.includes("p.kind"), "払った記録を返していません");
});

test("⑪は棚が無い倉庫でも途中で止まらない（あるときだけ足す）", () => {
  const eleven = stepEleven();
  assert.ok(
    eleven.includes("table_name = 'keiri_payments'"),
    "棚があるかを見てから足す形になっていません",
  );
});
