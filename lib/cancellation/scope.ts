/**
 * 出店中止の記録（daily_cancellations）を、いま読み書きしてよいかの判定
 * （2026-10-25・f3-4）。**倉庫には触りません。判定だけ**です。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   出店中止の記録には **日付・出店場所・担当者の名前・中止の理由**が入ります。
 *   この棚には「どの店のものか」の欄がまだ無く、読む係（lib/cancellation/db.ts）も
 *   絞っていませんでした。画面（/report/cancel）には手羽屋だけの門が掛かっているので
 *   **今は漏れていません**が、読む係そのものに門が無いと、
 *   ほかの画面から呼び始めたときに誰も気づけません
 *   （限定商品で実際に起きた取り落としと同じ形。lib/limitedProductScope.ts）。
 *
 * ■ 手羽屋は1つも変わりません
 *   手羽屋は印が空なので答えは必ず「読む・書く」。いまの画面と1文字も変わりません。
 */

import { isTebayaScope, type TenantScope } from "@/lib/tenantScope";

/**
 * 中止の記録を、いま読み書きしてよいか。
 *
 * true  … 手羽屋として開いている（印が空）＝今までどおり
 * false … よその店として開いている＝1行も読まない・1行も書かない
 */
export function cancellationInScope(scope: TenantScope): boolean {
  return isTebayaScope(scope);
}

/** よその店のときに返す断りの1行（黙って「できた」ことにしないため） */
export const CANCELLATION_OUT_OF_SCOPE =
  "出店中止の記録は手羽屋のものです（お店ごとの中止の記録はまだ扱っていません）";
