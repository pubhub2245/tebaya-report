/**
 * 「写真だけの日報」のお店で、この端末が **店主** か **スタッフ** か（2026-11-19 追加）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   牟田町店では、雄大さん（店主）とお店で働く人（スタッフ）が同じアプリを使います。
 *   スタッフに要るのは「写真で日報を出す」と「調理マニュアル」だけで、
 *   「今月いま残っているお金」は店主だけが見ればよい数字です。
 *   そこで、スタッフ用の合言葉（/join）で入った端末に「スタッフ」の印を付けます。
 *
 * ■ 手羽屋（ゆうやさんのスーパー出店）の数字について
 *   牟田町店として開いた端末は、もともと手羽屋の日報・出店予定・売上を読めない作りです
 *   （お店の印で絞る applyTenantScope と、手羽屋だけの門 TebayaOnlyGate）。
 *   スタッフの端末も同じ「牟田町店」の印で開くので、手羽屋の数字は見えません。
 *
 * ★ 印はこの端末の控え（localStorage）です。鍵ではなく「画面の出し分け」です。
 * ★ tests/photoShopRole.test.ts で固定。
 */

import { photoShopFor } from "./photoShop";
import type { TenantScope } from "./tenantScope";

export type PhotoShopRole = "owner" | "staff";

/** 端末に控えておく置き場所の名前 */
export const PHOTO_SHOP_ROLE_KEY = "photo-shop-role";

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem" | "removeItem">;

/** 控えを読む。スタッフの印があるときだけ "staff"。それ以外は店主扱い */
export function readPhotoShopRole(store?: Reader): PhotoShopRole {
  try {
    const s = store ?? (typeof window === "undefined" ? null : window.localStorage);
    return s?.getItem(PHOTO_SHOP_ROLE_KEY) === "staff" ? "staff" : "owner";
  } catch {
    return "owner";
  }
}

/** 控えに書く。店主（owner）は印を消すだけ */
export function writePhotoShopRole(role: PhotoShopRole, store?: Writer): void {
  try {
    const s = store ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!s) return;
    if (role === "staff") s.setItem(PHOTO_SHOP_ROLE_KEY, "staff");
    else s.removeItem(PHOTO_SHOP_ROLE_KEY);
  } catch {
    /* 控えが使えない環境でも落とさない */
  }
}

/** お金の数字（今月残っているお金・/month）を出してよいか。スタッフには出さない */
export function canSeeShopMoney(role: PhotoShopRole): boolean {
  return role !== "staff";
}

/**
 * 調理マニュアルを見せてよいか。
 * ・写真だけの日報のお店として開いている端末（店主・スタッフどちらも）
 * ・じゅんの端末（管理者の合言葉を入れたことがある端末）
 * それ以外（印の無い手羽屋の端末・知らない人）には出さない。
 */
export function canViewManual(input: { scope: TenantScope; ownerDevice: boolean }): boolean {
  return !!photoShopFor(input.scope) || input.ownerDevice;
}
