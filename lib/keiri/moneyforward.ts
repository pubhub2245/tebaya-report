/**
 * マネーフォワード クラウド会計「仕訳帳インポート」用のCSVを作る。
 *
 * 「仕訳（しわけ）」＝ 会計ソフトが読む1行の記録。
 * 「8月1日／現金 12,000円／売上高 12,000円」のような形のこと。
 *
 * ■ なぜ journal.ts と別にするのか
 *   journal.ts の6列のCSVは、人が Excel で見るためのもの（docs/keiri.md 6章）。
 *   こちらはマネーフォワードに読み込ませる専用で、列が27個ときっちり決まっている。
 *   同じ仕訳（JournalRow）から、2つの形に書き出せるようにしてある。
 *
 * ■ 列の並びの出どころ
 *   マネーフォワード クラウド確定申告サポート「『仕訳帳』をインポートする」に
 *   載っていた27列を、左から順にそのまま並べている。
 *   必ず要るのは「取引日・勘定科目・金額」の3つ。
 *
 * ■ 税区分・税額は空のままにする（大事）
 *   このアプリは税務判断をしない（CLAUDE.md 5-2）。
 *   空で出せば、マネーフォワード側で科目ごとに決めてある税区分が使われる。
 *   こちらが勝手に埋めると、それが「アプリが決めた税務判断」になってしまう。
 *
 * ■ 文字コードは2つから選べる
 *   公式ページに指定が書かれていなかったため、
 *   UTF-8（BOM付き）と Shift-JIS の両方を出せるようにしてある。
 *   取り込めたほうを使えばよい。
 */

import type { JournalRow } from "./journal";

/** マネーフォワードの仕訳帳インポートの列（左から27個） */
export const MF_HEADERS = [
  "取引No",
  "取引日",
  "借方勘定科目",
  "借方補助科目",
  "借方部門",
  "借方取引先",
  "借方税区分",
  "借方インボイス",
  "借方金額(円)",
  "借方税額",
  "貸方勘定科目",
  "貸方補助科目",
  "貸方部門",
  "貸方取引先",
  "貸方税区分",
  "貸方インボイス",
  "貸方金額(円)",
  "貸方税額",
  "摘要",
  "仕訳メモ",
  "タグ",
  "MF仕訳タイプ",
  "決算整理仕訳",
  "作成日時",
  "作成者",
  "最終更新日時",
  "最終更新者",
] as const;

/** 文字コードの選択肢 */
export type CsvEncoding = "utf8" | "shift_jis";

/** 日付を 2026-08-01 から 2026/08/01 の形に直す（マネーフォワードの指定は yyyy/MM/dd） */
export function toMfDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? "").trim());
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  // すでに yyyy/MM/dd などの形で来たものは、そのまま通す（勝手に作り変えない）
  return String(date ?? "").trim();
}

/**
 * 仕訳を、マネーフォワードの27列に並べ直す。
 * 取引No は 1 から順番に振る（1行＝1取引として扱う）。
 */
export function toMoneyForwardRows(rows: JournalRow[]): string[][] {
  return rows.map((r, i) => {
    const cells: string[] = new Array(MF_HEADERS.length).fill("");
    cells[0] = String(i + 1); // 取引No
    cells[1] = toMfDate(r.date); // 取引日
    cells[2] = r.debitAccount ?? ""; // 借方勘定科目
    cells[8] = String(Math.round(Number(r.debitAmount) || 0)); // 借方金額(円)
    cells[10] = r.creditAccount ?? ""; // 貸方勘定科目
    cells[16] = String(Math.round(Number(r.creditAmount) || 0)); // 貸方金額(円)
    cells[18] = r.note ?? ""; // 摘要
    return cells;
  });
}

/** CSVの1マスぶんを、カンマや改行が入っていても壊れない形にする */
function csvCell(value: string): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * マネーフォワード用のCSVの文字列を作る。
 * ここではまだ文字コードは決めない（BOMも付けない）。
 */
export function toMoneyForwardCsv(rows: JournalRow[]): string {
  const lines: string[] = [MF_HEADERS.join(",")];
  for (const cells of toMoneyForwardRows(rows)) {
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/**
 * CSVの文字列を、選んだ文字コードのバイト列に直す。
 *
 * - utf8 … 先頭に BOM（ビーオーエム＝目印）を付ける。これが無いとExcelで文字化けする
 * - shift_jis … 昔からの日本語の文字コード。BOMは付けない
 *
 * ※ Shift-JIS への変換だけは自前で書けないので、encoding-japanese という
 *   無料の部品を、押されたときだけ読み込んで使う（ふだんの表示は重くならない）。
 */
export async function encodeCsv(
  csv: string,
  encoding: CsvEncoding,
): Promise<Uint8Array<ArrayBuffer>> {
  const BOM = "\uFEFF"; // Excel用の目印（これが無いと日本語が文字化けする）
  const bytes: number[] =
    encoding === "utf8"
      ? Array.from(new TextEncoder().encode(BOM + csv))
      : await toShiftJisBytes(csv);
  // Blob に渡せる形（ふつうの ArrayBuffer を持つ Uint8Array）にそろえて返す
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

/** Shift-JIS のバイト列に直す。部品は押されたときだけ読み込む */
async function toShiftJisBytes(csv: string): Promise<number[]> {
  const Encoding = (await import("encoding-japanese")).default;
  const unicode = Encoding.stringToCode(csv);
  return Encoding.convert(unicode, { to: "SJIS", from: "UNICODE" });
}

/** ダウンロードするときのファイル名 */
export function moneyForwardFileName(ym: string, encoding: CsvEncoding): string {
  const suffix = encoding === "utf8" ? "utf8" : "sjis";
  return `mf_shiwake_${ym}_${suffix}.csv`;
}
