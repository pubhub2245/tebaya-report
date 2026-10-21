/**
 * 「払ったお金の記録」（給与・外注費・家賃）を入れるときの決まり
 *                                   （2026-10-21・kp253 ③・f3-3・f3-4）。
 * **計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   経理画面の「💴 給与・…に払ったお金の記録」は、入れた1行に
 *   **「どのお店のものか」の印（tenant_id）を付けていませんでした**。
 *   手羽屋は印が空のお店なので、手羽屋にとっては正しい形です。
 *   ところが申し込んだお店が入れると、こうなります：
 *
 *     ・入る行の印は**空**（＝手羽屋の印）
 *     ・そのお店が自分の帳簿を読む道は**倉庫の窓口**（keiri_tenant_payments）で、
 *       窓口は「印がそのお店の行」だけを返す
 *     ＝ **画面は「✅ 記録しました」と出るのに、その行はどこにも出てきません。**
 *       「まだ払っていないお金」も1円も減らないので、お店は何度も入れ直し、
 *       **同じ給与が何行も溜まります**（どのお店の帳簿にも出ないまま）。
 *
 *   日報の保存（lib/keiri/tenantReportWrite.ts）・立替の一覧
 *   （lib/keiri/advanceReadHonest.ts）で直したのと同じ取り違えです。
 *   ここは**書く所**なので、黙って消えるのではなく**よその帳簿に紛れ込む**のが違いです。
 *
 * ■ 直し方（この1か所で決める）
 *   ① 入れるときに、いま開いているお店の印を付ける（手羽屋は空＝今までどおり）
 *   ② 棚に印の欄がまだ無い倉庫（貼り紙⑨の前）では：
 *      ・手羽屋 …… 印を付けずにもう一度 入れる＝**今までとまったく同じ**
 *      ・よその店 … **入れない。**「入れました」と言わずに理由を出す
 *        （印を付けられないまま入れると、手羽屋の帳簿に紛れ込むため）
 *
 * ■ 手羽屋は1行も変わりません（ここが大事）
 *   手羽屋の印は空なので、付けても付けなくても入る行は同じです。
 *   欄がまだ無い倉庫でも、①で断られたら②で今までどおり入れ直します
 *   （断られた入れ方は1行も書き込みません＝二重に入りません）。
 */

import { tenantStamp, type TenantScope } from "@/lib/tenantScope";

/** 棚に「どの店のものか」の欄があるか */
export type TenantColumnState =
  /** ある（貼り紙⑨が流れている） */
  | "ある"
  /** まだ無い */
  | "まだ";

/** 貼り紙の確かめ窓口（/api/keiri/shelves）で、欄を足す段と締める段 */
export const PAYMENT_SHELF_STEPS = { column: "⑨", scoped: "⑪" } as const;

/**
 * 1回目に送る中身。いま開いているお店の印を必ず付ける。
 *
 * ★印は `lib/tenantScope.ts` の `tenantStamp` で作る（決まりを2つ持たない）。
 *   手羽屋（null）は `{ tenant_id: null }` ＝ 入る行は今までと同じ。
 */
export function paymentRowForScope<T extends Record<string, unknown>>(
  base: T,
  scope: TenantScope,
): T & { tenant_id: string | null } {
  return { ...base, ...tenantStamp(scope) };
}

export type MissingColumnPlan =
  /** 印を付けずに、今までどおり入れ直す（手羽屋だけ） */
  | { action: "印なしで入れ直す"; why: string }
  /** 入れない（よその店。手羽屋の帳簿に紛れ込ませないため） */
  | { action: "入れない"; message: string; why: string };

/**
 * 棚に印の欄がまだ無いと断られたとき、どうするか。
 *
 * ★ここで「よその店でも印なしで入れ直す」を選ぶと、
 *   その行は**印が空＝手羽屋の行**として入ります。f3-4（お店ごとに分かれているか）が
 *   その1行で崩れるので、選びません。
 */
export function planWhenTenantColumnMissing(params: {
  isTebaya: boolean;
}): MissingColumnPlan {
  if (params.isTebaya) {
    return {
      action: "印なしで入れ直す",
      why: "手羽屋の印は空なので、欄が無くても入る行は今までと同じ",
    };
  }
  return {
    action: "入れない",
    message:
      "いまは保存できませんでした（倉庫の準備がまだ終わっていません）。" +
      "まちがったお店の帳簿に入れないために、ここでは何も入れていません。" +
      "少し待ってから、もう一度 入れてください。",
    why: "印を付けられないまま入れると、手羽屋の帳簿に紛れ込む（f3-4）",
  };
}

/**
 * 入れたあとに、その行の番号を読み返してよいか。
 *
 * 日報（lib/keiri/tenantReportWrite.ts）と同じ理由で、よその店は読み返しません。
 * 貼り紙⑪のあと、印が付いた行は公開の鍵では読めず、
 * **行は入っているのに「保存に失敗しました」**になるためです。
 * ※ いまの画面は番号を使っていないので、読み返しは行っていません。
 *   将来 使いたくなったときに、ここを見て決めること。
 */
export function paymentReadBackAllowed(params: { isTebaya: boolean }): boolean {
  return params.isTebaya;
}
