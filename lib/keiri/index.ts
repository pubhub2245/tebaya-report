/**
 * 経理パッケージの入口。画面からはここだけを読み込めばよい。
 *
 * 設計は docs/keiri.md。
 */

export * from "./accounts";
export * from "./types";
export * from "./classify";
export * from "./aggregate";
export * from "./journal";
export { TEBAYA_TEMPLATE } from "./templates/tebaya";
export { GENERIC_TEMPLATE } from "./templates/generic";
// ★ tenants.ts はここから出しません。
//   中で node:crypto（サーバーだけで動く部品）を使うので、
//   ブラウザ側の画面に混ざるとビルドが壊れます。使う所から直接読み込んでください。

import { TEBAYA_TEMPLATE } from "./templates/tebaya";
import { GENERIC_TEMPLATE } from "./templates/generic";
import type { BusinessTemplate, KeiriSettings } from "./types";

/**
 * 業態コード → テンプレート。
 * 別の業態を足すときは、テンプレを1つ作ってここに1行足すだけ。
 */
export const TEMPLATES: Record<string, BusinessTemplate> = {
  [TEBAYA_TEMPLATE.code]: TEBAYA_TEMPLATE,
  [GENERIC_TEMPLATE.code]: GENERIC_TEMPLATE,
};

/**
 * 申し込んだお店の業態コードのかたち（`t_` ＋ お店の番号）。
 * ★元は lib/tenantScope.ts の businessCodeForScope()。**形を変えるときは両方直すこと。**
 *   （tests/keiri.test.ts に、両方が同じ形であることを確かめる検算を置いてあります）
 */
const TENANT_CODE_RE =
  /^t_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 業態コードからテンプレートを取り出す。
 *
 * ■ 2026-09-19（kp76）に直したところ
 *   経理パッケージを申し込んだお店の業態コードは `t_<お店の番号>` で、
 *   この一覧（TEMPLATES）には入っていません。そのため**よそのお店の経費が
 *   手羽屋の対応表で振り分けられていました**。汎用テンプレは作ってあるのに、
 *   どこからも使われていない状態でした。
 *   実測：ふつうの飲食店にありそうな経費の言葉13個のうち、
 *   手羽屋テンプレでは6個が「雑費」に落ち、汎用テンプレでは2個でした
 *   （「肉 仕入れ」「野菜」「小麦粉」などが仕入に入らない）。
 *
 * ■ 手羽屋は何も変わりません
 *   手羽屋の業態コードは "tebaya" のままなので、これまでどおり手羽屋テンプレです。
 *   変わるのは `t_...`（申し込んだお店）だけで、いまその形のお店は1軒もありません。
 */
export function templateFor(code: string | null | undefined): BusinessTemplate {
  const key = code ?? "";
  const found = TEMPLATES[key];
  if (found) return found;
  // 申し込んだお店 → 汎用テンプレ（手羽屋だけの言葉を使わない）
  if (TENANT_CODE_RE.test(key)) return GENERIC_TEMPLATE;
  // それ以外（空・知らない文字）は、これまでどおり手羽屋に戻す
  return TEBAYA_TEMPLATE;
}

/**
 * 設定が読めなかったときの保険の値。
 * docs/keiri.md 4章の「期首残高 2026-08-10 ＝ 0円」と
 * 5-3b の「家賃 毎月35,000円・2026年8月から」に合わせてある。
 */
export const DEFAULT_SETTINGS: KeiriSettings = {
  opening_date: "2026-08-10",
  opening_balance: 0,
  outsourcing_rate: 0.1,
  monthly_rent: 35000,
  rent_start_month: "2026-08",
};
