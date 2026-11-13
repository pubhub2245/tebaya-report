/**
 * 「いま、よその店の行が 公開の鍵で何行 読めているか」を1行にまとめる所
 * （f3-4・2026-11-13）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   『よその店のデータが見えないか』（f3-4）は、いま **不合格** です。
 *   その理由は、ブラウザに配られている公開の鍵で
 *   **よその店の行がそのまま読める棚が残っている**ことです
 *   （2026-11-13 の実測では 出店場所 1行・商品と単価 3行。どちらも人の名前や
 *   商品の値段が入る棚です）。閉めるには倉庫の貼り紙（じゅんの2分）が要ります。
 *
 *   ところが この事実は、外から読む窓口（/api/keiri/copies）にしか出ていませんでした。
 *   **じゅんが見る唯一の一覧（/keiri のいちばん上）には1文字も出ていない**ので、
 *   貼り紙のお願いは「5つが一度に前に進みます」という**これから**の話だけで、
 *   **いま漏れている**という今の話がどこにもありませんでした。
 *   ここは、その1行を作ります。
 *
 * ■ 守ること
 *   ・返すのは **棚の名前（やさしい言い方）と行数だけ**。行の中身（名前・金額・
 *     連絡先・お店の番号）は1文字も受け取らず、1文字も返しません
 *   ・聞けなかった棚を「漏れていない」に寄せない（**分からないものは分からないと言う**）
 *   ・1行も書き込みません
 */

/** 棚ごとに数えた結果（rows が null＝聞けなかった） */
export type ShelfLeakCount = {
  table: string;
  label: string;
  rows: number | null;
};

export type ShelfLeak = {
  /** 公開の鍵で読めてしまっている「よその店の行」の合計 */
  rows: number;
  /** 漏れている棚（やさしい言い方と行数） */
  tables: { label: string; rows: number }[];
  /** 数えられた棚の数 */
  measured: number;
  /** 聞けなかった棚の数 */
  unknown: number;
  /** じゅんが読む1行。漏れが0行で、聞けなかった棚も無ければ null */
  line: string | null;
};

/**
 * 棚ごとの件数を1行にまとめる。
 *
 * @param counts 棚ごとの「印が付いた行」の数（null＝聞けなかった）
 */
export function summarizeShelfLeak(counts: ShelfLeakCount[]): ShelfLeak {
  const measured = counts.filter((c) => typeof c.rows === "number");
  const unknown = counts.length - measured.length;
  const leaking = measured
    .filter((c) => (c.rows as number) > 0)
    .map((c) => ({ label: c.label, rows: c.rows as number }));
  const rows = leaking.reduce((s, c) => s + c.rows, 0);

  let line: string | null = null;
  if (rows > 0) {
    line =
      `いま、よその店の行が ${rows}行、公開の鍵（ブラウザに配られている鍵）で読めます（` +
      leaking.map((c) => `${c.label} ${c.rows}行`).join("・") +
      "）。この貼り紙で閉まります";
  } else if (measured.length > 0 && unknown === 0) {
    line = "いま、公開の鍵で読めてしまう よその店の行は1行もありません";
  } else if (measured.length > 0) {
    line =
      `いま、公開の鍵で読めてしまう よその店の行は、数えられた棚には1行もありません` +
      `（ほかに ${unknown} つの棚は聞けませんでした）`;
  }
  // ★1本も聞けなかったときは line を作らない（数えたふりをしないため）

  return { rows, tables: leaking, measured: measured.length, unknown, line };
}
