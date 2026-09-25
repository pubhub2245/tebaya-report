/**
 * 「送る1枚」（/keiri/send）で、いま開いている端末がスマホかパソコンかを見分ける（kp169）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   送る1枚の主役だったオレンジのボタンは、LINE の「送り先を選ぶ画面」を開く
 *   特別なリンク（`https://line.me/R/share?text=...`）です。
 *   このしかけは **スマホの LINE だけ**が分かる約束事で、
 *   パソコン版の LINE は同じ約束事に対応していません。
 *   ＝ じゅんがパソコンでこの1枚を開いて押しても、送る画面は開きません。
 *   6日間 1通も送られていない理由の候補として、いちばん直しやすいのがここです。
 *
 *   そこで、スマホなら今までどおり［LINEで送る］を主役にし、
 *   パソコンなら［送る文をコピーする］を主役にして、
 *   「コピーして、パソコンのLINEのトークに貼る」道を1タップにします。
 *
 * ■ 見分け方（どちらか当てはまればスマホ扱い）
 *   ① 名乗り（userAgent）に Android / iPhone / iPad / iPod / Mobile が入っている
 *   ② 指で触る画面（pointer: coarse）である
 *   どちらも取れないときは **スマホ扱い**にします。理由：スマホ扱いなら
 *   ［LINEで送る］が主役になるだけで、コピーのボタンも同じ画面に残るため、
 *   間違えても道が消えないほう（安全な側）に倒れます。
 */

export type SendDeviceInput = {
  /** ブラウザの名乗り（navigator.userAgent）。取れなければ空文字 */
  userAgent?: string | null;
  /** 指で触る画面か（matchMedia("(pointer: coarse)")）。取れなければ null */
  pointerCoarse?: boolean | null;
};

/** iPad の Safari は「Macintosh」と名乗るので、触れる画面かどうかも一緒に見る */
const PHONE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i;

/**
 * スマホ（＝LINE の送り先を選ぶ画面が開く端末）とみなすか。
 * @returns true=スマホ扱い（［LINEで送る］を主役にする）/ false=パソコン扱い（［コピー］を主役にする）
 */
export function isPhoneLike(input: SendDeviceInput = {}): boolean {
  const ua = typeof input.userAgent === "string" ? input.userAgent : "";
  if (PHONE_UA.test(ua)) return true;
  if (input.pointerCoarse === true) return true;
  // 名乗りも触り方も分からないときは、道が消えないスマホ扱いに倒す
  if (!ua && input.pointerCoarse == null) return true;
  return false;
}
