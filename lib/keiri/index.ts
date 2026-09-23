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

/**
 * その業態コードが「経理パッケージを申し込んだお店」のものか。
 * 手羽屋（'tebaya'）と、知らない文字は false。
 */
export function isTenantBusinessCode(code: string | null | undefined): boolean {
  return TENANT_CODE_RE.test(String(code ?? ""));
}

/**
 * 申し込んだお店で、設定の行が読めなかったときの保険。
 *
 * ■ なぜ別に持つのか（ここが大事）
 *   上の DEFAULT_SETTINGS は**手羽屋の決めごと**です
 *   （期首日 2026-08-10／家賃 毎月35,000円／外注費 売上の10%）。
 *   これをよそのお店に当てると、
 *     ・払っていない家賃 35,000円が毎月の経費に出る
 *     ・売上の10%が「外注費（Alpha）」として引かれる
 *     ・会計ソフト用のCSVにも「Alpha 業務委託料（売上高の10%）」の行が入る
 *   ということが起きます。お店が税理士さんに渡す帳簿に、
 *   **こちらが勝手に作った金額と、よその会社の名前**が載ることになります。
 *   「勝手に金額を作らない」（CLAUDE.md 4-12）に正面から反するので、
 *   申し込んだお店の保険は**決めごとを1つも持たない**値にしてあります。
 *
 * ■ 数え始めの日
 *   本当の日が読めていないので、**ある分は全部数える**という意味で
 *   うんと古い日を入れてあります（日報を隠さないため）。
 *   画面には「設定がまだ読めていません」と出して、人に直してもらいます。
 */
export const TENANT_FALLBACK_SETTINGS: KeiriSettings = {
  opening_date: "1970-01-01",
  opening_balance: 0,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

/**
 * 設定の行が読めなかったときに使う値を、業態コードから選ぶ。
 * 手羽屋はこれまでどおり DEFAULT_SETTINGS（1つも変わりません）。
 */
export function defaultSettingsFor(code: string | null | undefined): KeiriSettings {
  return isTenantBusinessCode(code) ? TENANT_FALLBACK_SETTINGS : DEFAULT_SETTINGS;
}

/**
 * 外注先の呼び名。
 * 手羽屋は「Alpha」（株式会社Alpha ＝ じゅんさんの会社）のままです。
 * 申し込んだお店にとって Alpha は**関係のない会社の名前**なので、
 * その画面では「外注費」という一般の言葉にします。
 */
export function outsourcingLabelFor(code: string | null | undefined): string {
  return isTenantBusinessCode(code) ? "外注費" : "Alpha";
}

/**
 * 「科目ごとの表」に出す外注費の科目名。
 * 手羽屋は accounts.ts のとおり「外注費（Alpha）」のまま。
 * 申し込んだお店には、よその会社の名前を出さない。
 */
export function outsourcingAccountLabelFor(code: string | null | undefined): string {
  return isTenantBusinessCode(code) ? "外注費" : "外注費（Alpha）";
}
