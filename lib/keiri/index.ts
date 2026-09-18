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

/** 業態コードからテンプレートを取り出す。無ければ手羽屋テンプレを使う */
export function templateFor(code: string | null | undefined): BusinessTemplate {
  return TEMPLATES[code ?? ""] ?? TEBAYA_TEMPLATE;
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
