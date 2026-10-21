/**
 * 出店先ランクの自動判定を「どのお店の数字で」行うかを決める所（2026-10-21・f3-4）。
 * **計算だけ**（倉庫は触りません）。
 *
 * ■ 何が起きていたか（やさしい説明）
 *   日報を1枚 保存すると、その出店先のランクと目標額をその場で判定し直します
 *   （→ CLAUDE.md 4-13）。このとき読むものが2つあります。
 *     ① 出店場所マスタ（locations）… **開いているお店のぶんだけ**読んでいました（正しい）
 *     ② 判定に使う日報（daily_reports）… **いつでも手羽屋のぶんだけ**読んでいました
 *   ②が手羽屋に固定されていたので、申し込んだお店が日報を出すと、
 *   **そのお店のランクと目標額が、手羽屋の売上から決まっていました。**
 *   出店先の名前が同じだと（ながやま・イオンモールなど、同じ会場に出るお店に売る商品なので
 *   ふつうに起きます）、よその店の画面に手羽屋の実績が化けて出ます。
 *
 * ■ これからの決まり
 *   ①と②は**必ず同じお店**で読みます。開いているお店は、日報を保存するときと
 *   同じ「安全側の決め方」（lib/keiri/readSource.ts の effectiveKeiriScope）で決めます。
 *
 * ■ 手羽屋は1行も変わりません（ここが大事）
 *   手羽屋は印が空なので、②の絞り込みは今までとまったく同じ条件
 *   （tenant_id が空の行だけ）になります。日報・シフト・レジ・LINE・お金の計算は触っていません。
 */

import { isTebayaScope, rowsInScope, type TenantScope } from "./tenantScope";

/**
 * 判定に使う日報を、開いているお店のぶんだけに絞る（手元の行に対して行う計算）。
 * 画面を通さずに「絞る前と後で手羽屋の結果が変わらないか」を確かめられるようにしてある。
 */
export function rankRowsInScope<R extends { tenant_id?: string | null }>(
  rows: R[],
  scope: TenantScope,
): R[] {
  return rowsInScope(rows, scope);
}

/** ランクが変わった記録（location_rank_history）を残してよいか */
export type RankHistoryVerdict = {
  write: boolean;
  why: string;
};

/**
 * ランクが変わった記録を残してよいかを決める。
 *
 * ■ なぜお店では残さないのか
 *   この棚（location_rank_history）には「どの店か」の欄がまだありません
 *   （→ lib/tenantScope.ts の TABLES_WITHOUT_TENANT_COLUMN と同じ事情）。
 *   印の無いまま入れると、よその店のランクの動きが手羽屋と同じ棚に混ざります。
 *   **ランクと目標額そのものは、そのお店の出店場所マスタに ちゃんと入ります**。
 *   残らないのは「いつ変わったか」の履歴だけです。
 *
 * ■ 手羽屋は今までどおり残します
 */
export function decideRankHistoryWrite(scope: TenantScope): RankHistoryVerdict {
  if (isTebayaScope(scope)) {
    return { write: true, why: "手羽屋（印が空）＝今までどおり履歴を残します" };
  }
  return {
    write: false,
    why:
      "申し込んだお店では履歴を残しません（棚に「どの店か」の欄がまだ無く、" +
      "印なしで入れると手羽屋の履歴に混ざるため）。ランクと目標額の書き換えは行います",
  };
}
