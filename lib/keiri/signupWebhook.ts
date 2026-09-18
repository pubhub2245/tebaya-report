/**
 * 経理パッケージ「申し込みが決まった」という通知を受ける本体。
 *
 * app/api/keiri/signup-webhook/route.ts から呼ばれます。
 * 倉庫（Supabase）への保存は外から渡すので、ここは通信をしません。
 *
 * ■ 必ず 200 を返す
 *   支払いの仕組み（Stripe）も LINE と同じで、200 以外を返すと
 *   同じ通知を何度も送り直してきます。
 *   保存に失敗しても記録に残して 200 を返します。
 *   例外は「署名が合わない（401）」と「合言葉が未設定（500）」だけ
 *   ——お客さんLINEの受け口と同じ決まりにしてあります（CLAUDE.md 4-16）。
 *
 * ■ 同じ通知が2回来ても1軒しか作らない
 *   定期課金の番号（subscriptionId）が同じ行が既にあれば、何もしません。
 *   （支払いの仕組みは、返事が届かないと同じ通知を送り直すため）
 *
 * ■ メールは送りません
 *   支払いが終わったお客さんは、支払いの仕組みの「戻り先」の設定で
 *   /keiri/welcome?session=<支払いの番号> に自動で戻ってきます。
 *   このアプリから第三者にメールを出す作りは持ちません（外に出る行動を作らない）。
 */

import { buildTenant, verifyStripeSignature, type CreatedTenant, type KeiriTenantRow } from "./tenants";

export type SignupWebhookDeps = {
  /** 支払いの仕組みの合言葉（未設定なら undefined） */
  webhookSecret: string | undefined;
  /** 定期課金の番号で、既に作ってあるか調べる。あれば true */
  alreadyExists: (subscriptionId: string) => Promise<boolean>;
  /** 1行作る */
  createTenant: (row: KeiriTenantRow) => Promise<void>;
  nowSeconds?: number;
  log?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
};

export type SignupWebhookResult = {
  status: number;
  body: Record<string, unknown>;
};

/** 通知の中から、必要な項目だけ取り出す */
export function readStripeEvent(payload: unknown): {
  eventId: string | null;
  type: string;
  customerId: string | null;
  subscriptionId: string | null;
  sessionId: string | null;
  shopName: string | null;
} {
  const ev = (payload ?? {}) as Record<string, any>;
  const obj = (ev.data?.object ?? {}) as Record<string, any>;
  const details = (obj.customer_details ?? {}) as Record<string, any>;
  return {
    eventId: ev.id ? String(ev.id) : null,
    type: String(ev.type ?? ""),
    customerId: obj.customer ? String(obj.customer) : null,
    subscriptionId: obj.subscription ? String(obj.subscription) : null,
    sessionId: obj.id ? String(obj.id) : null,
    // 店名は「名前」の欄をそのまま借りる。無ければ初回設定の画面で入れてもらう
    shopName: details.name ? String(details.name) : null,
  };
}

/** この通知で新しいお店を作るか。支払いが終わったものだけ */
export function isSignupEvent(type: string): boolean {
  return type === "checkout.session.completed";
}

export async function handleSignupWebhook(
  req: { bodyText: string; signature: string | null | undefined },
  deps: SignupWebhookDeps,
): Promise<SignupWebhookResult> {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;

  if (!deps.webhookSecret) {
    logError("[経理 申込Webhook] 合言葉が未設定です。Vercelの環境変数を入れてください。");
    return { status: 500, body: { ok: false, reason: "合言葉が未設定" } };
  }

  const genuine = verifyStripeSignature(
    req.bodyText,
    req.signature,
    deps.webhookSecret,
    deps.nowSeconds,
  );
  if (!genuine) {
    logError("[経理 申込Webhook] 署名が合いません。受け取りません。");
    return { status: 401, body: { ok: false, reason: "署名不一致" } };
  }

  // ここから先は、何があっても 200 を返す
  try {
    let payload: unknown;
    try {
      payload = JSON.parse(req.bodyText);
    } catch {
      logError("[経理 申込Webhook] 本文が読めませんでした。");
      return { status: 200, body: { ok: true, handled: false, reason: "本文が読めない" } };
    }

    const ev = readStripeEvent(payload);
    if (!isSignupEvent(ev.type)) {
      log(`[経理 申込Webhook] 対象外の通知（${ev.type || "種別なし"}）。何もしません。`);
      return { status: 200, body: { ok: true, handled: false, reason: "対象外の通知" } };
    }

    if (ev.subscriptionId) {
      const exists = await deps.alreadyExists(ev.subscriptionId);
      if (exists) {
        log("[経理 申込Webhook] 同じ申し込みが既にあります。作りません。");
        return { status: 200, body: { ok: true, handled: false, reason: "重複" } };
      }
    }

    const created: CreatedTenant = buildTenant({
      source: "stripe",
      customerId: ev.customerId,
      subscriptionId: ev.subscriptionId,
      sessionId: ev.sessionId,
      eventId: ev.eventId,
      shopName: ev.shopName,
    });

    await deps.createTenant(created.row);

    log("[経理 申込Webhook] お店1軒ぶんの初期設定を作りました。");
    // ★ 初回設定URLは返事の中には入れません（記録に残さないため）。
    //   お客さんは支払い後の「戻り先」から初回設定の画面に来ます。
    return { status: 200, body: { ok: true, handled: true } };
  } catch (e) {
    logError("[経理 申込Webhook] 途中で失敗しました：", e);
    return { status: 200, body: { ok: true, handled: false, reason: "保存に失敗" } };
  }
}
