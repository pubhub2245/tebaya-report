/**
 * 外から読む窓口（/api/keiri/diagnose）の checks の **読み方**（2026-11-12・B・f2-1／f2-2）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   いまの本番は **銀行振込の道**（route: "bank"）で、ready は true・残りは0件です。
 *   ところが同じ答えの中の checks には、こう並んでいます：
 *     payment_button: false / signup_notice: false / shop_create: false
 *   このうち3つは **カードの道だけに効くもの**で、銀行振込の道では使いません。
 *   とくに `signup_notice` は名前が「申し込みの知らせ」に読めるので、
 *   外から見た人が「**お申し込みが入っても じゅんに届かない**」と受け取り、
 *   合格にしてある f2-2 と食い違って見えます（11/12 に実際に起きました）。
 *   ほんとうの意味は「**カードの支払いが終わった通知（Stripe）を受け取る合言葉があるか**」です。
 *
 * ■ どうするか
 *   **数字（facts）は1つも隠しません。**（「カードの残りは隠さない」2026-09 の決まりのまま）
 *   代わりに、1つずつに「どの道で効くか」と「何を言っているのか」を添えます。
 *   申し込みが じゅんに届くかは、`application_delivery` と `notify` を見ます。
 *
 * ★ 文だけ（倉庫は触りません）。tests/keiriSignupChecksMean.test.ts で固定。
 */

import type { SignupRoute } from "./signupReadiness";

export type CheckKey =
  | "payment_button"
  | "signup_notice"
  | "shop_table"
  | "settings_table"
  | "shop_create";

/** その check が効く道 */
export type AppliesTo = "card" | "both";

export const CHECK_APPLIES_TO: Record<CheckKey, AppliesTo> = {
  payment_button: "card",
  signup_notice: "card",
  shop_table: "both",
  settings_table: "both",
  shop_create: "card",
};

/** その check が「ほんとうは何を見ているか」 */
const CHECK_MEANS: Record<CheckKey, string> = {
  payment_button: "カードの申し込みボタン（支払いリンク）が出ているか",
  signup_notice:
    "**カードの支払いが終わった通知（Stripe）を受け取る合言葉があるか**です。" +
    "『お申し込みが入ったことが じゅんに届くか』ではありません" +
    "（そちらは application_delivery と notify を見てください）",
  shop_table: "お店の置き場（keiri_tenants）が読めるか",
  settings_table: "初回設定の置き場（keiri_settings）が読めるか",
  shop_create:
    "お店1軒ぶんの行を**自動で**作れるか（サーバー側の鍵）。" +
    "銀行振込の道では、担当が1行 流して作ります（manual_steps）",
};

/** いまの道で、その check が合否に効くか */
export function checkAppliesOnRoute(key: CheckKey, route: SignupRoute): boolean {
  return CHECK_APPLIES_TO[key] === "both" || CHECK_APPLIES_TO[key] === route;
}

/** 1つぶんの読み方（1行） */
export function checkMeaning(key: CheckKey, route: SignupRoute): string {
  const mean = CHECK_MEANS[key];
  return checkAppliesOnRoute(key, route)
    ? mean
    : `【いまの道（銀行振込）では使いません。false でも受け付けられます】${mean}`;
}

/** checks と同じ並びの読み方 */
export function checksMeaning(route: SignupRoute): Record<CheckKey, string> {
  const keys = Object.keys(CHECK_APPLIES_TO) as CheckKey[];
  return keys.reduce(
    (acc, key) => {
      acc[key] = checkMeaning(key, route);
      return acc;
    },
    {} as Record<CheckKey, string>,
  );
}

/** checks 全体にかぶせる1行 */
export function checksNote(route: SignupRoute): string {
  return route === "bank"
    ? "いまは**銀行振込の道**です。payment_button・signup_notice・shop_create の3つは" +
        "**カードの道だけに効くもの**で、false でもお申し込みは受け付けられます" +
        "（合否は ready と todo を見てください）。" +
        "**お申し込みが じゅんに届くか**は、この3つではなく application_delivery と notify です"
    : "いまは**カードの道**です。checks の5つは、そのまま ready の中身です";
}
