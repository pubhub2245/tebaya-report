/**
 * 「出店予定の表（shifts）は、まだ最新まで入っているのか」を1か所で決める所
 * （2026-11-14・kp245・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   金庫の窓口は「日報が入っていない日」について、出店予定の表を見て
 *   「予定が無い日＝お休み」と言っていました（lib/keiri/cashBooksGapOpen.ts）。
 *   ところが **2026-11-07 から 手羽屋は写真の日報に変わり、シフトの入り口を外しました**
 *   （CLAUDE.md 3-1 の「使わないと決めたもの（入り口なし）」にシフトが入っています）。
 *   ＝ 予定を入れる人がいなくなった表に「予定が無い」のは、**お休みだったからとは限りません。
 *   ただ入れていないだけ**かもしれません。
 *
 *   このまま「ぜんぶお休みでした＝この空きで食い違うことはありません」と言い切ると、
 *   実際には営業した日の売上が入っていないのに その分が差の心当たりから外れ、
 *   じゅんが金庫を数えたときに **「名前の付かない差」＝ f1-4 不合格** になります。
 *   本当は「日報がまだ入っていない日」という名前が付く差です。
 *
 * ■ 決まり（これだけ）
 *   出店予定の表のうち **いちばん新しい予定の日** を見て、
 *   その日が「見ている期間の始まり」より **前** なら、表はそこで止まっています
 *   ＝ その期間について この表は何も言っていない（＝分かりません）。
 *   読めなかったときは、今までどおり「分かりません」です。
 *
 * ■ ここでしないこと（大事）
 *   ① 金額を作らない・直さない。月の経費・利益・1枚の要約・CSV・試算表は1円も変わりません
 *   ② 「お休みでした」と言い切らない（0件を「無い」と取り違えない）
 *   ③ 日報・出店予定を作りません・直しません（読むだけ）
 */

/** 出店予定の表が、見ている期間まで入っているか */
export type ShiftShelfFresh = {
  /** 表を読めたか */
  readable: boolean;
  /** いちばん新しい予定の日（読めなければ null・1件も無ければ null） */
  lastDate: string | null;
  /**
   * 見ている期間まで表が入っているか。
   * true＝入っている（「予定が無い＝お休み」と言ってよい）
   * false＝表がその前で止まっている（言ってはいけない）
   * null＝読めなかった（今までどおり分かりません）
   */
  coversSince: boolean | null;
};

/** まだ見ていない（＝今までどおりの言い方に戻す）ときの値 */
export const SHIFT_SHELF_NOT_MEASURED: ShiftShelfFresh = {
  readable: false,
  lastDate: null,
  coversSince: null,
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 出店予定の表の新しさを決める。
 *
 * @param lastPublishedDate いちばん新しい「公開済み」の予定の日（読めなければ undefined）
 * @param since             見ている期間の始まりの日（YYYY-MM-DD）
 */
export function measureShiftShelfFresh(params: {
  lastPublishedDate?: string | null;
  since: string;
}): ShiftShelfFresh {
  const { since } = params;
  // 読めなかった（問い合わせに失敗した）
  if (params.lastPublishedDate === undefined) return SHIFT_SHELF_NOT_MEASURED;
  const last = params.lastPublishedDate;
  if (last !== null && !DATE.test(last)) return SHIFT_SHELF_NOT_MEASURED;
  if (!DATE.test(since)) return SHIFT_SHELF_NOT_MEASURED;
  // 読めて、1件も無い＝その期間について何も言っていない
  if (last === null) return { readable: true, lastDate: null, coversSince: false };
  return { readable: true, lastDate: last, coversSince: last >= since };
}

/** 人が読む一言のかけら（表がどこで止まっているか）。お店の名前・担当者の名前は入れない */
export function shiftShelfStaleLine(fresh: ShiftShelfFresh): string {
  if (fresh.coversSince !== false) return "";
  if (fresh.lastDate === null) {
    return "出店予定の表には、公開ずみの予定が1件も入っていません";
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fresh.lastDate);
  const day = m ? `${Number(m[2])}月${Number(m[3])}日` : fresh.lastDate;
  return `出店予定の表は ${day} までで止まっています`;
}
