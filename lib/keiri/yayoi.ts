/**
 * 弥生会計（やよいの青色申告を含む）の「仕訳日記帳インポート」用のファイルを作る。
 *
 * 「仕訳（しわけ）」＝ 会計ソフトが読む1行の記録。
 * 「8月1日／現金 12,000円／売上高 12,000円」のような形のこと。
 *
 * ■ なぜマネーフォワード用（moneyforward.ts）と別に要るのか
 *   マネーフォワードと freee は、取り込むときに「この列は何ですか」を
 *   画面で選ばせてくれる（列の並びが多少ちがっても人が合わせられる）。
 *   **弥生会計にはその画面が無く、列の並びが25個ぴったりに決まっている。**
 *   1つでもズレると弾かれるので、弥生には弥生の形で書き出すしかない。
 *
 * ■ 弥生の決まり（2026-09-24 に確認。出典は docs/auto/2026-09-24_会計ソフト取込仕様.md）
 *   ・列は25個ちょうど。使わない列も**空のまま置いて、カンマの数を合わせる**
 *   ・**見出し行（1行目の「日付,借方…」）は付けない**。1行目からいきなり仕訳
 *   ・文字コードは **Shift-JIS**。UTF-8 だと文字化けするか、取り込めない
 *   ・日付は `2026/09/01` の形（`2026-09-01` は不可）
 *   ・金額は**カンマ区切りにしない**（`12000`。`12,000` にしない）
 *   ・1列目の「識別フラグ」は、1行で完結する仕訳なら `2000`
 *   ・20列目の「タイプ」は `0`、25列目の「調整」は `no`（どちらも必須）
 *
 * ■ 税区分は空のままにする（大事）
 *   このアプリは税務判断をしない（CLAUDE.md 5-2）。
 *   空で出せば、弥生側で科目ごとに決めてある税区分が使われる。
 *   こちらが勝手に埋めると、それが「アプリが決めた税務判断」になってしまう。
 */

import type { JournalRow } from "./journal";

/**
 * 弥生会計の仕訳データの列（左から25個）。
 * ※ ファイルには**書き出さない**（見出し行を付けない決まりのため）。
 *    画面の説明と、検算（tests）で使うためにここに置いてある。
 */
export const YAYOI_HEADERS = [
  "識別フラグ",
  "伝票No",
  "決算",
  "取引日付",
  "借方勘定科目",
  "借方補助科目",
  "借方部門",
  "借方税区分",
  "借方金額",
  "借方税金額",
  "貸方勘定科目",
  "貸方補助科目",
  "貸方部門",
  "貸方税区分",
  "貸方金額",
  "貸方税金額",
  "摘要",
  "番号",
  "期日",
  "タイプ",
  "生成元",
  "仕訳メモ",
  "付箋1",
  "付箋2",
  "調整",
] as const;

/** 1行で完結する仕訳（複合仕訳でない）の識別フラグ */
export const YAYOI_SINGLE_ROW_FLAG = "2000";

/** 日付を 2026-09-01 から 2026/09/01 の形に直す（弥生の指定） */
export function toYayoiDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? "").trim());
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  // すでに 2026/09/01 などの形で来たものは、そのまま通す（勝手に作り変えない）
  return String(date ?? "").trim();
}

/**
 * 摘要などに、弥生が受け取れない文字が混ざっていたら落とす。
 *
 * 弥生は Shift-JIS で読むので、Shift-JIS に無い文字（絵文字など）が1つでも
 * 混ざっていると、その行がまるごと文字化けする。
 * 日報の「内容」欄は人が自由に打てるので、ここで見張っておく。
 * 併せて、行が割れる原因になる改行とタブも1つの空白に置き換える。
 */
export function toYayoiText(value: string): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    // Shift-JIS に無いことが多い並び（絵文字・記号の追加分）を落とす
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2190}-\u{21FF}]/gu, "")
    .trim();
}

/**
 * 仕訳を、弥生会計の25列に並べ直す。
 * 伝票No は 1 から順番に振る（1行＝1つの仕訳として扱う）。
 */
export function toYayoiRows(rows: JournalRow[]): string[][] {
  return rows.map((r, i) => {
    const cells: string[] = new Array(YAYOI_HEADERS.length).fill("");
    cells[0] = YAYOI_SINGLE_ROW_FLAG; // 識別フラグ
    cells[1] = String(i + 1); // 伝票No
    cells[2] = ""; // 決算（通常の仕訳は空）
    cells[3] = toYayoiDate(r.date); // 取引日付
    cells[4] = toYayoiText(r.debitAccount ?? ""); // 借方勘定科目
    cells[8] = String(Math.round(Number(r.debitAmount) || 0)); // 借方金額
    cells[9] = "0"; // 借方税金額
    cells[10] = toYayoiText(r.creditAccount ?? ""); // 貸方勘定科目
    cells[14] = String(Math.round(Number(r.creditAmount) || 0)); // 貸方金額
    cells[15] = "0"; // 貸方税金額
    cells[16] = toYayoiText(r.note ?? ""); // 摘要
    cells[19] = "0"; // タイプ（必須）
    cells[24] = "no"; // 調整（必須）
    return cells;
  });
}

/** CSVの1マスぶんを、カンマや引用符が入っていても壊れない形にする */
function csvCell(value: string): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 弥生会計用のCSVの文字列を作る。
 * **見出し行は付けない**（弥生の決まり）。ここではまだ文字コードは決めない。
 */
export function toYayoiCsv(rows: JournalRow[]): string {
  const lines = toYayoiRows(rows).map((cells) => cells.map(csvCell).join(","));
  if (lines.length === 0) return "";
  return lines.join("\r\n") + "\r\n";
}

/** ダウンロードするときのファイル名 */
export function yayoiFileName(ym: string): string {
  return `yayoi_shiwake_${ym}.csv`;
}
