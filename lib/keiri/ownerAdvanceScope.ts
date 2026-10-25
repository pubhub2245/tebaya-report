/**
 * 経営側の立替（/cash/advances・/cash・/sales-report）を、
 * 「どの店のものか」の印で絞って読み書きするための小さな道具（2026-10-25・f3-4・kp264）。
 *
 * ■ 何のためのファイルか（やさしい説明）
 *   経営側の立替の棚（advance_expenses）には、まだ
 *   「どの店のものか」の印（tenant_id）の欄がありません。
 *   欄は貼り紙（/keiri/sql）で1つ足しますが、**まだ流れていません**。
 *
 *   そこで現場の立替と同じ形にします（lib/keiri/advanceScope.ts と同じ考え方）：
 *   **欄があるかどうかを、アプリが自分で見て決めます。**
 *     ・欄がまだ無い … 今までどおり、絞らずに読む（手羽屋しか開けない門の内側）
 *     ・欄がある     … ふつうに「印が空のものだけ」＝手羽屋のぶんだけを読む
 *   ＝ 貼り紙を流す前でも後でも壊れません。**アプリを出し直す必要もありません。**
 *
 * ■ 手羽屋への影響：ありません
 *   手羽屋は印が空（null）のお店です。いまある51行はすべて印が空なので、
 *   欄が無ければ今までどおり全部読み、欄があっても「印が空のものだけ」＝同じ51行です。
 *   **見えるものも、保存されるものも、1行も変わりません。**
 *
 * ■ なぜ「先に絞っておく」のか
 *   貼り紙で欄ができた瞬間に、2軒目のお店の立替が同じ棚に入り始めます。
 *   そのときアプリが絞っていないと、**手羽屋の画面によその店の立替が混ざります**。
 *   欄ができてからアプリを直すのでは間に合わないので、先に入れておきます。
 */

import { isMissingTenantColumn } from "./advanceScope";

/** 倉庫に聞いた答えの、ここで要るところだけ */
export type QueryAnswer<T> = {
  data: T | null;
  error: { message?: string | null; code?: string | null } | null;
};

/**
 * 立替（経営）の棚に聞く。1回目は絞って聞き、
 * **「その欄はまだ無い」と断られたときだけ**、絞らずに聞き直す。
 *
 * ★「欄が無い」以外の断り（通信できない・権限が無い等）では聞き直しません。
 *   聞き直すと、本当は守れる場面で守りを外してしまいます（advanceScope.ts と同じ決まり）。
 *
 * @param ask 絞るか絞らないかを受け取って、倉庫に聞く係
 * @returns 倉庫の答え＋`scoped`（絞って聞けたか＝欄があったか）
 */
export async function withOwnerAdvanceTenant<T>(
  ask: (scoped: boolean) => PromiseLike<QueryAnswer<T>>,
): Promise<QueryAnswer<T> & { scoped: boolean }> {
  const first = await ask(true);
  if (!isMissingTenantColumn(first.error)) {
    return { data: first.data, error: first.error, scoped: true };
  }
  const second = await ask(false);
  return { data: second.data, error: second.error, scoped: false };
}
