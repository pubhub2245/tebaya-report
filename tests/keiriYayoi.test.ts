/**
 * 弥生会計（やよいの青色申告を含む）用の仕訳CSVの形を固定するテスト。
 *
 * 弥生には「この列は何ですか」と選び直す画面が無い。
 * 列の数・並び・日付の書き方・必須の値・文字コードが1つでも崩れると、
 * お店の人の手元で「取り込めません」になって、そこで話が終わる。
 * だからここで固定する。決まりの出典は docs/auto/2026-09-24_会計ソフト取込仕様.md。
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { JournalRow } from "../lib/keiri/journal";
import { encodeCsv } from "../lib/keiri/moneyforward";
import {
  YAYOI_HEADERS,
  YAYOI_SINGLE_ROW_FLAG,
  toYayoiCsv,
  toYayoiDate,
  toYayoiRows,
  toYayoiText,
  yayoiFileName,
} from "../lib/keiri/yayoi";

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

test("YAYOI_HEADERS: 列は弥生の25個・並びも固定", () => {
  assert.equal(YAYOI_HEADERS.length, 25);
  assert.equal(YAYOI_HEADERS[0], "識別フラグ");
  assert.equal(YAYOI_HEADERS[3], "取引日付");
  assert.equal(YAYOI_HEADERS[4], "借方勘定科目");
  assert.equal(YAYOI_HEADERS[8], "借方金額");
  assert.equal(YAYOI_HEADERS[10], "貸方勘定科目");
  assert.equal(YAYOI_HEADERS[14], "貸方金額");
  assert.equal(YAYOI_HEADERS[16], "摘要");
  assert.equal(YAYOI_HEADERS[19], "タイプ");
  assert.equal(YAYOI_HEADERS[24], "調整");
});

test("toYayoiDate: 2026-08-01 を 2026/08/01 に直す（弥生はハイフンを受け取らない）", () => {
  assert.equal(toYayoiDate("2026-08-01"), "2026/08/01");
  assert.equal(toYayoiDate("2026/08/01"), "2026/08/01");
  assert.equal(toYayoiDate(""), "");
});

test("toYayoiRows: 必須の値（識別フラグ2000・タイプ0・調整no）が必ず入る", () => {
  const rows = toYayoiRows(SAMPLE);
  assert.equal(rows.length, 2);
  for (const cells of rows) {
    assert.equal(cells.length, 25, "列は必ず25個ちょうど");
    assert.equal(cells[0], YAYOI_SINGLE_ROW_FLAG);
    assert.equal(cells[0], "2000");
    assert.equal(cells[19], "0", "タイプは必須");
    assert.equal(cells[24], "no", "調整は必須");
  }
  assert.equal(rows[0][1], "1", "伝票Noは1から順");
  assert.equal(rows[1][1], "2");
  assert.equal(rows[0][3], "2026/08/01");
  assert.equal(rows[0][4], "現金");
  assert.equal(rows[0][8], "12000");
  assert.equal(rows[0][10], "売上高");
  assert.equal(rows[0][14], "12000");
  assert.equal(rows[0][16], "売上 ながやま鷹尾");
});

test("toYayoiRows: 税区分は空のまま（このアプリは税務判断をしない）", () => {
  const cells = toYayoiRows(SAMPLE)[0];
  assert.equal(cells[7], "", "借方税区分");
  assert.equal(cells[13], "", "貸方税区分");
  assert.equal(cells[9], "0", "借方税金額は0");
  assert.equal(cells[15], "0", "貸方税金額は0");
});

test("toYayoiCsv: 見出し行を付けない（弥生の決まり）", () => {
  const csv = toYayoiCsv(SAMPLE);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 2, "仕訳2行ぶん。見出し行は無い");
  assert.ok(lines[0].startsWith("2000,"), "1行目からいきなり仕訳");
  assert.ok(!csv.includes("識別フラグ"), "見出しの文字が入っていない");
  for (const line of lines) {
    // カンマ区切りが25個ぶん（引用符の中にカンマが無いサンプル）
    assert.equal(line.split(",").length, 25);
  }
});

test("toYayoiCsv: 金額はカンマ区切りにしない", () => {
  const csv = toYayoiCsv([
    { ...SAMPLE[0], debitAmount: 1234567, creditAmount: 1234567 },
  ]);
  assert.ok(csv.includes(",1234567,"), "1,234,567 ではなく 1234567");
  assert.ok(!csv.includes("1,234,567"));
});

test("toYayoiCsv: カンマや引用符が摘要に入っていても行が壊れない", () => {
  const csv = toYayoiCsv([
    { ...SAMPLE[0], note: '売上, "ながやま" 鷹尾' },
  ]);
  assert.ok(csv.includes('"売上, ""ながやま"" 鷹尾"'));
  assert.equal(csv.trimEnd().split("\r\n").length, 1, "1行のまま");
});

test("toYayoiText: 改行と、Shift-JISに無い文字（絵文字）は落とす", () => {
  assert.equal(toYayoiText("売上\nながやま"), "売上 ながやま");
  assert.equal(toYayoiText("売上🍗ながやま"), "売上ながやま");
  assert.equal(toYayoiText("  売上  "), "売上");
});

test("toYayoiCsv: 行が無いときは空の文字（見出しだけのファイルを作らない）", () => {
  assert.equal(toYayoiCsv([]), "");
});

test("encodeCsv: 弥生用は Shift-JIS。日本語が戻せて、BOMは付かない", async () => {
  const bytes = await encodeCsv(toYayoiCsv(SAMPLE), "shift_jis");
  assert.notEqual(bytes[0], 0xef, "BOMは付けない");
  const back = new TextDecoder("shift_jis").decode(bytes);
  assert.ok(back.includes("売上高"));
  assert.ok(back.includes("ながやま鷹尾"));
  assert.ok(back.startsWith("2000,"));
});

test("yayoiFileName: 月が名前に入る", () => {
  assert.equal(yayoiFileName("2026-08"), "yayoi_shiwake_2026-08.csv");
});
