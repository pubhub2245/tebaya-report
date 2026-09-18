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
  const { paymentLink, secret, tenants, settings } = input;
  const hasButton = !!paymentLink;
  const todo: string[] = [];

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
