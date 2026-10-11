/**
 * 立替（たてかえ）を「どの期間ぶん読むか」を決める、ただ1か所のファイル（2026-10-11・kp249）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   経理の数字を読む道が2本あります。
 *     ① サーバー側の窓口から読む（lib/keiri/loadMonthServer.ts）
 *     ② 画面から倉庫を直接のぞく（lib/keiri/loadMonth.ts）
 *   10/11 に手羽屋も①へ寄せたところ、**立替の件数が17件ちがいました**
 *   （/api/keiri/readpaths で実測。売上・経費・利益・設定は1円もちがわない）。
 *   原因は、同じ「立替」を読むのに**読む期間の決め方が2か所に別々に書いてあった**ことです。
 *     ①は「前後40日」　②は「数え始めの日から今日まで」
 *   月の金額は変わりませんが、件数が変わると
 *   **金庫の計算（返した立替を引く）と「同じ支払いの疑い」の件数が動くおそれ**があります。
 *
 * ■ どう直したか
 *   読む期間の決め方を**このファイル1か所だけ**にして、2つの道が同じ関数を呼びます。
 *   ＝ もう別々にずれることがありません（CLAUDE.md 4-1 と同じ考え方）。
 *
 * ■ 通信はしません（計算だけ）。だから検算で固定できます。
 */

/** いつからいつまで読むか。to が null なら「上は区切らない」（今日まで全部） */
export type AdvanceReadRange = {
  /** この日から（YYYY-MM-DD） */
  from: string;
  /** この日まで（YYYY-MM-DD）。null なら区切らない */
  to: string | null;
};

/** YYYY-MM-DD を日数ぶんずらす（このファイルの中だけで使う） */
function shift(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** その月の末日 */
function monthEndOf(ym: string): string {
  return shift(`${shift(`${ym}-01`, 32).slice(0, 7)}-01`, -1);
}

/**
 * 立替を読む期間を決める。
 *
 * @param ym 見ている月（YYYY-MM）
 * @param openingDate 経理の数え始めの日（YYYY-MM-DD）。空なら月初として扱う
 * @param monthOnly その月だけを見る使い方か（事例ページ）。既定は false
 *
 * ■ 決まり
 *   ・ふだんの経理の画面（monthOnly なし）… **数え始めの日（月初のほうが早ければ月初）から、上は区切らない。**
 *     ＝ 2026-10-10 まで本番で動いていた画面と1日もちがわない期間です。
 *   ・その月だけ見る使い方（monthOnly）… 前後40日の余白つき。
 *     月をまたいだ同じ支払いを見るために要るので、ここは今までどおり変えません。
 */
export function advanceReadRange(params: {
  ym: string;
  openingDate: string;
  monthOnly?: boolean;
}): AdvanceReadRange {
  const monthStart = `${params.ym}-01`;
  const opening = params.openingDate || monthStart;

  if (params.monthOnly) {
    // その月だけ見る使い方（事例ページ）。前後40日の余白は今までどおり
    return { from: shift(monthStart, -40), to: shift(monthEndOf(params.ym), 40) };
  }
  // ふだんの経理の画面。画面が昔から使っている期間と1日もちがえないこと
  return { from: monthStart < opening ? monthStart : opening, to: null };
}
