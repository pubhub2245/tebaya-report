/**
 * 「経理の『今の現金』は、どの数え始めから数えているのか」を1か所で答える所
 * （2026-10-19・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も出しません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   現金の『数え始め』の記録は、倉庫に**2か所**あります。
 *     ・経理パッケージが読む棚（keiri_settings）… /keiri の「今の現金」はこれだけを読む
 *     ・手羽屋が毎日使う現金の画面（/cash）が読む棚（cash_settings）… 別の日・別の金額
 *   どちらを読むかで「今の現金」は丸ごと変わるため、
 *   **金庫を数えて比べる相手がどちらなのか**が、外から分からない状態でした
 *   （2026-10-18・10-19 に A が倉庫の台帳を数えて気づいた点）。
 *
 *   答えはコードを読めば決まっています：**経理は keiri_settings だけを読みます**
 *   （lib/keiri/loadMonth.ts・loadMonthServer.ts。cash_settings は手羽屋の
 *   毎日の画面だけが読む＝全店共通の棚として lib/keiri/shelfScope.ts に記録ずみ）。
 *   その事実を、**画面と外からの窓口の両方で読める形**にしておくのがこの所です。
 *   じゅんが金庫を1分 数えたときに「どちらの金額と比べたのか」で迷わないようにします。
 *
 * ■ 外に出さないもの
 *   金額は1円も返しません（期首残高・今の現金のどちらも）。返すのは**棚の名前と日付**だけです。
 */

/** 経理パッケージが「数え始め」を読む棚 */
export const KEIRI_OPENING_SHELF = "keiri_settings";

/** 手羽屋が毎日使う現金の画面（/cash）が「数え始め」を読む棚 */
export const TEBAYA_DAILY_OPENING_SHELF = "cash_settings";

export type CashOpeningSource = {
  /** 経理が読む棚の名前（ここが唯一の正） */
  usedShelf: string;
  /** 経理の数え始めの日（金額は返さない） */
  openingDate: string | null;
  /** 手羽屋の毎日の画面だけが読む棚の名前 */
  otherShelf: string;
  /** その棚に行があるか */
  otherShelfExists: boolean;
  /** その棚の数え始めの日（金額は返さない） */
  otherOpeningDate: string | null;
  /** 2つの数え始めがちがうか（ちがっていても誤りではない） */
  differs: boolean;
  /** 人が読む1行 */
  line: string;
  /** この所が何を返さないか */
  note: string;
};

const NOTE =
  "金額は1円も返しません（期首残高・今の現金のどちらも）。返すのは棚の名前と日付だけです。" +
  "1行も書き込みません。";

/** YYYY-MM-DD → YYYY/M/D（画面と同じ書き方） */
function slash(date: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${m[1]}/${Number(m[2])}/${Number(m[3])}`;
}

/**
 * 「経理はどの数え始めを読んでいるか」を畳む。
 *
 * @param openingDate      経理の数え始め（keiri_settings.opening_date）
 * @param otherOpeningDate 手羽屋の毎日の画面の数え始め（cash_settings.start_date）
 * @param otherShelfExists その棚に行があるか
 */
export function buildCashOpeningSource(params: {
  openingDate: string | null;
  otherOpeningDate: string | null;
  otherShelfExists: boolean;
}): CashOpeningSource {
  const { openingDate, otherOpeningDate, otherShelfExists } = params;
  // 日が入っていない（全期間）ときも「ちがう」とは言わない。比べられるのは両方に日があるときだけ
  const differs =
    openingDate !== null && otherOpeningDate !== null && openingDate !== otherOpeningDate;

  const line = !openingDate
    ? "経理の数え始めがまだ決まっていません。先に「経理の設定」で、数え始めの日と" +
      "その日の手元の現金を入れてください（これが決まるまで、金庫と比べても意味がありません）。"
    : differs
      ? `経理の「今の現金」は ${slash(openingDate)} から数えています。` +
        `手羽屋が毎日使う現金の画面（/cash）は ${slash(otherOpeningDate)} から数えているので、` +
        "2つの画面で金額はちがって出ます（どちらも誤りではありません）。" +
        "金庫を数えて比べるのは、この経理の画面の金額です。"
      : `経理の「今の現金」は ${slash(openingDate)} から数えています。` +
        "金庫を数えて比べるのは、この金額です。";

  return {
    usedShelf: KEIRI_OPENING_SHELF,
    openingDate,
    otherShelf: TEBAYA_DAILY_OPENING_SHELF,
    otherShelfExists,
    otherOpeningDate,
    differs,
    line,
    note: NOTE,
  };
}
