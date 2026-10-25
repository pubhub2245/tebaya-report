/**
 * 「まだ お店ごとに分けられていない棚」を触る**窓口**を、
 * 手羽屋のときだけに絞る判定（2026-10-25・f3-4・kp253 ③の続き）。
 * **計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   設営後チェック（setup_checks）と意見箱の返信（feedback_replies）の棚には、
 *   「どの店のものか」の欄がまだありません。
 *   画面には手羽屋だけに開く門（TebayaOnlyGate）が掛かっていますが、
 *   **窓口（/api/…）は住所をたたけば呼べる**ので、
 *   画面に門を掛けても**窓口が裏口として残ります**
 *   （2026-10-23 にレシートの窓口、2026-10-24 に仕込みの保存で同じ形を直しました）。
 *   そこを通られると、よその店が入れた開店前のレジ金や返信が
 *   **手羽屋の記録に混ざり**、欄が無いのであとから見分けることもできません。
 *   LINE へ流す窓口は、さらに**手羽屋のスタッフのグループに文が飛びます**。
 *
 * ■ 手羽屋は1つも変わりません（ここが大事）
 *   手羽屋は印が空（null）なので、答えは必ず「してよい」です。
 *   **印が送られてこないときも「してよい」**にします
 *   （古い画面がそのまま開かれていても、手羽屋の登録・返信・LINE が止まらないため）。
 *   断るのは「よその店だと**はっきり名乗った**とき」だけです。
 *
 * ■ 黙って何もしない、はしない
 *   断るときは日本語の1行を返します（1行も残していないのに
 *   「登録しました」と言わないため）。
 *
 * ★ 棚に印の欄を足したら（Supabase で1列足すだけ）、ここを外して
 *   ふつうに applyTenantScope で絞る形に直してください。
 */

import { isTebayaScope, normalizeTenantScope } from "./tenantScope";

/** どの窓口か */
export type TebayaOnlyWindow =
  /** 設営後チェックを登録する窓口（/api/setup-check/create） */
  | "setup-check"
  /** 設営後チェックを LINE へ流す窓口（/api/setup-check/post-line） */
  | "setup-check-line"
  /** 意見箱にスタッフ返信を足す窓口（/api/feedback/[id]/replies） */
  | "feedback-reply";

/** よその店に返す断りの1行（画面にそのまま出せる） */
export const TEBAYA_ONLY_MESSAGES: Record<TebayaOnlyWindow, string> = {
  "setup-check":
    "設営後チェックは手羽屋のものです（お店ごとの設営後チェックはまだ扱っていません）",
  "setup-check-line":
    "設営後チェックのLINE投稿は手羽屋のものです（お店ごとのLINEはまだ扱っていません）",
  "feedback-reply":
    "意見箱は手羽屋のものです（お店ごとの意見箱はまだ扱っていません）",
};

export type TebayaOnlyVerdict = {
  /** してよいか */
  allow: boolean;
  /** 断るときに出す1行（よいときは null） */
  message: string | null;
  why: string;
};

/**
 * この窓口を使ってよいか。
 *
 * @param tenantId 画面が名乗った「どの店か」（手羽屋は null／送られてこないこともある）
 * @param window   どの窓口か（断りの1行を選ぶのに使う）
 */
export function decideTebayaOnlyWindow(
  tenantId: unknown,
  window: TebayaOnlyWindow,
): TebayaOnlyVerdict {
  const scope = normalizeTenantScope(tenantId);
  if (isTebayaScope(scope)) {
    return {
      allow: true,
      message: null,
      why: "手羽屋（印が空）＝今までどおり。印が送られてこないときもここに入る",
    };
  }
  return {
    allow: false,
    message: TEBAYA_ONLY_MESSAGES[window],
    why: "よその店だとはっきり名乗った＝手羽屋の記録に混ざるので何もしない",
  };
}
