/**
 * 経理パッケージ「申し込みが入ったとき、人の手を借りずに使い始められるか」の判定。
 *
 * app/api/keiri/diagnose/route.ts から呼ばれます。
 * ここは通信をしません（調べた結果を受け取って、言葉に直すだけ）。
 *
 * ■ 申し込みは次の4つが全部つながって初めて成立します
 *   ① 申し込みボタン（支払いページへのリンク）が出ている
 *   ② 支払いが終わったという通知を受け取れる（合言葉が入っている）
 *   ③ お店1軒ぶんの行を作る置き場がある（keiri_tenants）
 *   ④ 初回設定を書き込む置き場がある（keiri_settings）
 *   どれか1つでも欠けると、お客さんはお金だけ払って使い始められません。
 *
 * ★ 合言葉・鍵の値そのものは扱いません（設定済み／未設定だけ）。
 */

import { paymentLinkEnvName, priceLabel } from "./caseNumbers";

/** Stripe の画面で1回だけ人が設定する値（このアプリからは見えない） */
export const STRIPE_MANUAL_SETUP = {
  /** 支払いが終わったお客さんの戻り先 */
  returnUrl: "https://tebaya-report.vercel.app/keiri/welcome?session={CHECKOUT_SESSION_ID}",
  /** 支払いが終わったことを知らせてもらう先 */
  webhookUrl: "https://tebaya-report.vercel.app/api/keiri/signup-webhook",
  /** 知らせてもらう出来事 */
  webhookEvent: "checkout.session.completed",
} as const;

export type TableCheck = { ok: boolean; reason: string | null };

export type SignupReadinessInput = {
  /** 申し込みボタンの飛び先。未設定なら null */
  paymentLink: string | null;
  /** 通知の合言葉の状態 */
  secret: { ok: boolean; reason?: string };
  /** お店の置き場が読めたか */
  tenants: TableCheck;
  /** 初回設定の置き場が読めたか */
  settings: TableCheck;
  /**
   * サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）が使えるか。
   *
   * ★2026-09-19（kp76）に足しました。**ここを見ないと嘘の緑が出ます。**
   *   お店の置き場（keiri_tenants）は鍵（RLS）を掛けてあり、
   *   サーバー側の鍵でしか読み書きできません。
   *   ところがその鍵が使えないとき、読みに行っても**エラーにならず「0件」が返る**ので、
   *   「読めました＝つながっています」に見えてしまいます。
   *   実際には、申し込んだお店は
   *     ・初回設定のリンクを開いても「このリンクは使えません」になり
   *     ・合言葉を入れても「パスワードが違います」になります（どちらも0件が返るため）
   *   ＝**お金を払っても、1歩も進めません。**
   *   控え（keiri_applications）で同じ見落としを直したのと同じ考え方です（kp57）。
   */
  serverKeyUsable: boolean;

  /**
   * 倉庫の「窓口」（keiri_tenant_activate / keiri_tenant_login）が使えるか。
   *
   * ★サーバー側の合鍵が壊れていても、この窓口があれば
   *   初回設定も合言葉での入室も通ります（2026-09-19・kp93）。
   *   ＝ここが true なら、鍵の貼り直し（kp55）を待たずにお店は使い始められます。
   */
  tenantRpcUsable?: boolean;
};

export type SignupReadiness = {
  ready: boolean;
  summary: string;
  checks: {
    payment_button: boolean;
    signup_notice: boolean;
    shop_table: boolean;
    settings_table: boolean;
  };
  todo: string[];
};

export function buildSignupReadiness(input: SignupReadinessInput): SignupReadiness {
  const { paymentLink, secret, serverKeyUsable } = input;
  // 合鍵が生きている か、倉庫の窓口がある。どちらかあればお店は進める
  const tenantAccessOk = serverKeyUsable || input.tenantRpcUsable === true;
  const hasButton = !!paymentLink;
  const todo: string[] = [];

  // ★鍵が使えないときは、読めていても「つながっている」とは言わない（安全側に倒す）
  const keyReason =
    "表はありますが、サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）が使えないので、" +
    "申し込んだお店は初回設定も、合言葉での入室もできません" +
    "（どちらも0件が返るため「このリンクは使えません」「パスワードが違います」になります）。" +
    "Vercel の SUPABASE_SERVICE_ROLE_KEY を貼り直すか、" +
    "倉庫の SQL Editor で supabase/migrations/keiri_tenant_rpc.sql を1回流してください（kp55／kp93）";
  const tenants: TableCheck = tenantAccessOk
    ? input.tenants.ok || input.tenantRpcUsable === true
      ? { ok: true, reason: null }
      : input.tenants
    : { ok: false, reason: input.tenants.reason ?? keyReason };
  const settings: TableCheck = tenantAccessOk
    ? input.settings.ok || input.tenantRpcUsable === true
      ? { ok: true, reason: null }
      : input.settings
    : { ok: false, reason: input.settings.reason ?? keyReason };

  if (!hasButton) {
    todo.push(
      `申し込みボタンが出ていません。Vercel の環境変数 ${paymentLinkEnvName()} に、いまの価格（${priceLabel()}）の支払いリンクを入れてください。` +
        "※ 名前に金額が入っています。値上げしたときは、新しい金額で支払いリンクを作り直してこの名前で登録してください（前の金額のリンクは自動で使われなくなります）",
    );
  }
  if (!secret.ok) {
    todo.push(
      secret.reason === "未設定"
        ? `支払いが終わった通知を受け取れません。Stripe で通知先（Webhook）を ${STRIPE_MANUAL_SETUP.webhookUrl} に登録し、出てきた合言葉を Vercel の環境変数 KEIRI_SIGNUP_WEBHOOK_SECRET に入れてください`
        : "KEIRI_SIGNUP_WEBHOOK_SECRET に全角などの使えない文字が入っています（貼り直してください）",
    );
  }
  if (!tenants.ok) todo.push(`お店の置き場（keiri_tenants）：${tenants.reason}`);
  if (!settings.ok) todo.push(`初回設定の置き場（keiri_settings）：${settings.reason}`);

  const ready = hasButton && secret.ok && tenants.ok && settings.ok;

  return {
    ready,
    summary: ready
      ? "申し込みから使い始めまで、人の手を借りずにつながっています"
      : `つながっていません。残り ${todo.length} か所`,
    checks: {
      payment_button: hasButton,
      signup_notice: secret.ok,
      shop_table: tenants.ok,
      settings_table: settings.ok,
    },
    todo,
  };
}

/** 置き場を読もうとしたときのエラーを、人の言葉に直す */
export function describeTableError(code: string | null | undefined, message: string): string {
  // ★ 置き場そのものが無いときは、直し方が違う（SQLを1回実行する）ので言い分ける
  if (code === "42P01" || /does not exist|could not find the table/i.test(message)) {
    return "置き場（表）が本番にありません。SQLをまだ実行していない可能性があります";
  }
  // ★ 表はあるのに「読む許可がありません」のときは、直し方がまた違う
  //   （サーバー側の鍵 SUPABASE_SERVICE_ROLE_KEY を貼り直す）ので言い分ける
  if (code === "42501" || /permission denied/i.test(message)) {
    return "表はありますが、読む許可がありません。サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）が使えていない可能性があります";
  }
  return `読めませんでした（${code ?? "理由不明"}）`;
}
