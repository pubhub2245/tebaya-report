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
