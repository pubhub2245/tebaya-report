/**
 * 経理パッケージ「無人販売の入口③：自動初期設定」の考える部分。
 *
 * ■ 何をする所か
 *   申し込みが1件決まったとき、そのお店が明日から日報を打てる状態を
 *   **人の手を一切かけずに** 作ります。順番はこうです。
 *     (1) 申し込みの通知が来たら、お店1軒ぶんの行（keiri_tenants）と
 *         初回設定の画面を開くための合言葉（setup_token）を作る
 *     (2) お店が初回設定の3項目（店名・数え始めの日・その日の手元の現金）を入れる
 *     (3) その時に管理画面の合言葉を作って**画面に1回だけ出す**
 *         （倉庫には戻せない形＝ハッシュだけを置く）
 *
 * ■ ここには通信を書きません
 *   倉庫（Supabase）への保存は「外から渡す」作りにしてあります。
 *   おかげで、本物の通信なしにテストで動きを確かめられます
 *   （lib/line/customerWebhook.ts と同じ考え方）。
 *
 * ■ 支払いの仕組みに依存させません
 *   Stripe（ネットでカード払いを受ける仕組み）はあくまで「引き金」です。
 *   引き金が何であっても（手で1件作る場合でも）初期設定は同じ道を通ります。
 *   こうしておけば、支払いの方法が変わってもこのファイルは直しません。
 */

import { createHash, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

/** 申し込みの出どころ */
export type SignupSource = "stripe" | "manual";

/** keiri_tenants に入れる1行（作るとき） */
export type KeiriTenantRow = {
  shop_name: string | null;
  template: string;
  setup_token: string;
  /**
   * 管理画面に入るための合言葉（ハッシュ＝戻せない形）。
   * 申し込んだ直後は null。初回設定の画面を終えたときに入ります。
   * ★生の合言葉は倉庫に置きません。画面に1回出すだけです。
   */
  admin_password_hash: string | null;
  source: SignupSource;
  external_customer_id: string | null;
  external_subscription_id: string | null;
  /**
   * 支払いの画面1回ぶんの番号（checkout session id）。
   * 支払いのあと、この番号を付けて初回設定の画面に戻ってくるので、
   * どのお店の初回設定かをこれで見分けます。
   */
  external_session_id: string | null;
  status: "pending";
  last_event_id: string | null;
};

/** 申し込み1件ぶんの入力（支払いの仕組みから取り出した最小限） */
export type SignupInput = {
  source: SignupSource;
  /** 支払いの仕組み側のお客さん番号（無ければ null） */
  customerId?: string | null;
  /** 定期課金の番号（無ければ null）。同じ通知が2回来たときの見分けに使う */
  subscriptionId?: string | null;
  /** 支払いの画面1回ぶんの番号（無ければ null） */
  sessionId?: string | null;
  /** 通知そのものの番号（重複判定の控え） */
  eventId?: string | null;
  /** 支払いの仕組み側に入っている店名。無ければ初回設定の画面で入れてもらう */
  shopName?: string | null;
  /** 業態テンプレ。指定が無ければ汎用 */
  template?: string | null;
};

/** 作った結果 */
export type CreatedTenant = {
  row: KeiriTenantRow;
  /** 初回設定の画面のURL（相対）。支払い完了メールに載せる */
  setupPath: string;
};

/**
 * 見間違えない文字だけ（0とO、1とlなどを外してある）。
 * 電話で読み上げても間違えないように選んでいます。
 */
const SAFE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

/** 見間違えない文字で、指定の長さの文字列を作る */
export function readableSecret(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += SAFE_CHARS[bytes[i] % SAFE_CHARS.length];
  return out;
}

/**
 * 管理画面の合言葉。4文字ずつ区切って読みやすくする（例：k7pm-3qxr-9tsb）。
 * 長さは 12 文字（区切りを除く）。
 */
export function generateAdminPassword(): string {
  const raw = readableSecret(12);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** 初回設定のURLに付ける合言葉。URLに出るので長め（32文字） */
export function generateSetupToken(): string {
  return readableSecret(32);
}

/**
 * 合言葉を「戻せない形」にする。
 * 倉庫に生の合言葉を置かないため（倉庫が覗かれても合言葉は分からない）。
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** 合言葉が合っているか。中身を推測されないように、時間が変わらない比べ方をする */
export function secretMatches(secret: string, hash: string): boolean {
  const a = Buffer.from(hashSecret(secret), "utf8");
  const b = Buffer.from(hash ?? "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 店名の掃除。前後の空白を取り、長すぎるものは切る。空なら null */
export function cleanShopName(raw: unknown): string | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  return s.slice(0, 60);
}

/**
 * 申し込み1件から、倉庫に入れる1行と案内に載せる文字を作る。
 * ★この関数は通信をしません。作った物を返すだけです。
 */
export function buildTenant(input: SignupInput): CreatedTenant {
  const setupToken = generateSetupToken();
  return {
    row: {
      shop_name: cleanShopName(input.shopName),
      template: input.template?.trim() || "generic",
      setup_token: setupToken,
      // 合言葉はまだ作りません（初回設定を終えた時に作って、画面に1回出す）
      admin_password_hash: null,
      source: input.source,
      external_customer_id: input.customerId?.trim() || null,
      external_subscription_id: input.subscriptionId?.trim() || null,
      external_session_id: input.sessionId?.trim() || null,
      status: "pending",
      last_event_id: input.eventId?.trim() || null,
    },
    setupPath: `/keiri/welcome?t=${setupToken}`,
  };
}

/**
 * そのお店ぶんの「設定の行」に付ける業態コード。
 *
 * ★なぜ必要か
 *   設定の棚（keiri_settings）は「業態コード1つにつき1行だけ」という決まりで、
 *   何も指定しないと既定値の 'tebaya'（手羽屋）になります。
 *   そのまま新しいお店の設定を作ろうとすると**手羽屋の行とぶつかって作れず**、
 *   お店が入れた「数え始めの日」と「その日の手元の現金」が消えてしまいます。
 *   お店の番号（必ず1軒ごとに違う）から作ったコードを付けて、ぶつからないようにします。
 *
 * ★手羽屋には触りません
 *   手羽屋の行は 'tebaya' のままで、経理画面も 'tebaya' だけを読み書きします。
 */
export function tenantBusinessCode(tenantId: string): string {
  const id = String(tenantId ?? "").trim().toLowerCase();
  if (!id) throw new Error("お店の番号が空です");
  return `t_${id}`;
}

// ============================================================
// 初回設定（お店が入れる3項目）
// ============================================================

/** 初回設定の3項目 */
export type WelcomeInput = {
  shopName: unknown;
  /** 数え始めの日（期首日）。YYYY-MM-DD */
  openingDate: unknown;
  /** その日の手元の現金（期首残高・円） */
  openingBalance: unknown;
};

export type WelcomeCheck =
  | { ok: true; value: { shopName: string; openingDate: string; openingBalance: number } }
  | { ok: false; message: string };

/**
 * 3項目を確かめる。
 * ★金額は「勝手に作らない」。読めない値は直さずに、人に入れ直してもらう
 *   （レシートの税の直しと同じ考え方。docs/keiri.md 11-6）。
 */
export function checkWelcomeInput(input: WelcomeInput): WelcomeCheck {
  const shopName = cleanShopName(input.shopName);
  if (!shopName) return { ok: false, message: "お店の名前を入れてください。" };

  const date = String(input.openingDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "数え始めの日は 2026-10-01 のような形で入れてください。" };
  }
  const [y, m, d] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return { ok: false, message: "数え始めの日が実在しない日付です。" };
  }

  const rawBalance = String(input.openingBalance ?? "").trim().replace(/[,\s円]/g, "");
  if (rawBalance === "") {
    return { ok: false, message: "数え始めの日の手元の現金を入れてください（0円でも構いません）。" };
  }
  if (!/^\d+$/.test(rawBalance)) {
    return { ok: false, message: "手元の現金は半角の数字で入れてください（例：30000）。" };
  }
  const openingBalance = Number(rawBalance);
  if (openingBalance > 100_000_000) {
    return { ok: false, message: "手元の現金の桁が多すぎます。入れ直してください。" };
  }

  return { ok: true, value: { shopName, openingDate: date, openingBalance } };
}

// ============================================================
// 支払い完了の通知（Webhook）の署名
// ============================================================

/**
 * Stripe から届く通知が本物か確かめる。
 *
 * ヘッダーは `t=1699999999,v1=<16進の文字列>` の形で、
 * 「時刻 + "." + 本文」を合言葉で計算した値が v1 と一致すれば本物です
 * （LINE の署名確認と同じ考え方。lib/line/customerClient.ts）。
 *
 * ★本番で使う前に、Stripe のテスト通知を1回受けて
 *   ここが true になることを必ず確かめること（docs/auto の設計書に手順あり）。
 */
export function verifyStripeSignature(
  bodyText: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!v) continue;
    if (k === "t") timestamp = v;
    if (k === "v1") signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // 古い通知の使い回し（盗んだ通知をあとで投げ直す）を防ぐ
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${bodyText}`, "utf8")
    .digest("hex");

  return signatures.some((sig) => {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(sig, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  });
}
