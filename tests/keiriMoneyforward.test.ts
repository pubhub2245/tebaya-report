/**
 * マネーフォワード用の仕訳CSVの形を固定するテスト。
 * 列の数・並び・日付の書き方・文字コードが変わったら、ここで落ちる。
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { JournalRow } from "../lib/keiri/journal";
import {
  MF_HEADERS,
  encodeCsv,
  moneyForwardFileName,
  toMfDate,
  toMoneyForwardCsv,
  toMoneyForwardRows,
} from "../lib/keiri/moneyforward";

const SAMPLE: JournalRow[] = [
  {
    date: "2026-08-01",
    debitAccount: "現金",
    debitAmount: 12000,
    creditAccount: "売上高",
    creditAmount: 12000,
    note: "売上 ながやま鷹尾",
  },
  {
    date: "2026-08-31",
    debitAccount: "外注費（Alpha）",
    debitAmount: 1200,
    creditAccount: "未払金",
    creditAmount: 1200,
    note: "Alpha 業務委託料（売上高の10%）",
  },
];

test("MF_HEADERS: 列はマネーフォワードの27個・並びも固定", () => {
  assert.equal(MF_HEADERS.length, 27);
  assert.equal(MF_HEADERS[0], "取引No");
  assert.equal(MF_HEADERS[1], "取引日");
  assert.equal(MF_HEADERS[2], "借方勘定科目");
  assert.equal(MF_HEADERS[8], "借方金額(円)");
  assert.equal(MF_HEADERS[10], "貸方勘定科目");
  assert.equal(MF_HEADERS[16], "貸方金額(円)");
  assert.equal(MF_HEADERS[18], "摘要");
  assert.equal(MF_HEADERS[26], "最終更新者");
});

test("toMfDate: 2026-08-01 は 2026/08/01 になる", () => {
  assert.equal(toMfDate("2026-08-01"), "2026/08/01");
  assert.equal(toMfDate("2026-08-01T00:00:00Z"), "2026/08/01");
  // すでに斜線の形のものは、勝手に作り変えない
  assert.equal(toMfDate("2026/08/01"), "2026/08/01");
});

test("toMoneyForwardRows: 取引Noは1から・金額と科目が決めた位置に入る", () => {
  const rows = toMoneyForwardRows(SAMPLE);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 27);
  assert.equal(rows[0][0], "1");
  assert.equal(rows[0][1], "2026/08/01");
  assert.equal(rows[0][2], "現金");
  assert.equal(rows[0][8], "12000");
  assert.equal(rows[0][10], "売上高");
  assert.equal(rows[0][16], "12000");
  assert.equal(rows[0][18], "売上 ながやま鷹尾");
  assert.equal(rows[1][0], "2");
});

test("toMoneyForwardRows: 税区分・税額・インボイスは空のまま（税務判断をしない）", () => {
  const r = toMoneyForwardRows(SAMPLE)[0];
  assert.equal(r[6], ""); // 借方税区分
  assert.equal(r[7], ""); // 借方インボイス
  assert.equal(r[9], ""); // 借方税額
  assert.equal(r[14], ""); // 貸方税区分
  assert.equal(r[15], ""); // 貸方インボイス
  assert.equal(r[17], ""); // 貸方税額
});

test("toMoneyForwardCsv: 見出し行＋仕訳の行が出る。BOMはこの時点では付かない", () => {
  const csv = toMoneyForwardCsv(SAMPLE);
  assert.equal(csv.startsWith("取引No,取引日,"), true);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1].startsWith("1,2026/08/01,現金,"), true);
});

test("toMoneyForwardCsv: カンマや引用符が入っていても行が壊れない", () => {
  const csv = toMoneyForwardCsv([
    {
      date: "2026-08-02",
      debitAccount: "仕入高",
      debitAmount: 500,
      creditAccount: "現金",
      creditAmount: 500,
      note: 'タレ,容器 "特売"',
    },
  ]);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[1].includes('"タレ,容器 ""特売"""'), true);
});

test("encodeCsv: UTF-8はBOM付き、Shift-JISはBOM無しで日本語が戻せる", async () => {
  const csv = toMoneyForwardCsv(SAMPLE);

  const utf8 = await encodeCsv(csv, "utf8");
  assert.equal(utf8[0], 0xef);
  assert.equal(utf8[1], 0xbb);
  assert.equal(utf8[2], 0xbf);

  const sjis = await encodeCsv(csv, "shift_jis");
  assert.notEqual(sjis[0], 0xef);
  const back = new TextDecoder("shift_jis").decode(sjis);
  assert.equal(back.startsWith("取引No,取引日,"), true);
  assert.equal(back.includes("売上 ながやま鷹尾"), true);
});

test("moneyForwardFileName: 月と文字コードが名前に入る", () => {
  assert.equal(moneyForwardFileName("2026-08", "utf8"), "mf_shiwake_2026-08_utf8.csv");
  assert.equal(moneyForwardFileName("2026-08", "shift_jis"), "mf_shiwake_2026-08_sjis.csv");
});
