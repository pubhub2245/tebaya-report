/**
 * 仕込み日報（/prep）の保存の窓口を、手羽屋のときだけに絞る判定（2026-10-24・f3-4・kp253 ③）。
 * **計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   仕込み日報の画面には、手羽屋だけに開く門（TebayaOnlyGate）が掛かっています。
 *   ところが**保存の窓口（/api/prep/save）には門がありません**。
 *   窓口は住所をたたけば呼べるので、画面に門を掛けても**窓口が裏口として残ります**
 *   （2026-10-23 にレシートの窓口で同じ形を直しました）。
 *   そこを通られると、よその店が入れた仕込みの記録が
 *   **手羽屋の仕込みの画面に混ざります**（仕込みの棚には「どの店のものか」の欄がまだ無いので、
 *   あとから見分けることもできません）。
 *
 * ■ 手羽屋は1つも変わりません（ここが大事）
 *   手羽屋は印が空（null）なので、答えは必ず「保存してよい」です。
 *   **印が送られてこないときも「保存してよい」**にします
 *   （古い画面がそのまま開かれていても、手羽屋の保存が止まらないため）。
 *   断るのは「よその店だと**はっきり名乗った**とき」だけです。
 *
 * ■ 黙って何もしない、はしない
 *   断るときは日本語の1行を返します（CLAUDE.md 4-12 の
 *   「1行も変わっていないのに『保存しました』と言わない」と同じ考え方）。
 */

import { isTebayaScope, normalizeTenantScope } from "./tenantScope";

/** よその店に返す断りの1行（画面にそのまま出せる） */
export const PREP_SAVE_OUT_OF_SCOPE =
  "仕込み日報は手羽屋のものです（お店ごとの仕込みはまだ扱っていません）";

export type PrepSaveVerdict = {
  /** 保存してよいか */
  allow: boolean;
  /** 断るときに出す1行（よいときは null） */
  message: string | null;
  why: string;
};

/**
 * 仕込み日報を保存してよいか。
 *
 * @param tenantId 画面が名乗った「どの店か」（手羽屋は null／送られてこないこともある）
 */
export function decidePrepSave(tenantId: unknown): PrepSaveVerdict {
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
    message: PREP_SAVE_OUT_OF_SCOPE,
    why: "よその店だとはっきり名乗った＝手羽屋の仕込みに混ざるので保存しない",
  };
}
