/**
 * Gmail OAuth2 認証ライブラリ。
 *
 * - 認可URL生成（認証フロー開始用）
 * - 認可コード → トークン交換
 * - トークンの DB 保存（gmail_tokens テーブル）
 * - 期限切れアクセストークンのリフレッシュ
 * - 認証状態の取得
 *
 * スコープは https://www.googleapis.com/auth/gmail.readonly のみ。
 *
 * 対象ユーザー: tebaya1222@gmail.com（じゅんさんのGmail）。
 *   user_email カラムの UNIQUE 制約で 1 アカウント分のみ保管する。
 *
 * 環境変数:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI_PRODUCTION   - VERCEL_ENV=production の場合に使用
 *   GOOGLE_REDIRECT_URI_DEVELOPMENT  - それ以外（local / preview）の場合に使用
 */

import { google, type Auth } from "googleapis";
import { createClient } from "@supabase/supabase-js";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
];

/** 主要対象アカウント（じゅんさんの Gmail） */
export const PRIMARY_GMAIL_USER = "tebaya1222@gmail.com";

export type StoredToken = {
  user_email: string;
  access_token: string;
  refresh_token: string | null;
  expiry_date: string; // ISO timestamp
  scope: string;
  token_type: string | null;
};

// ---------------------------------------------------------------------------
// クライアント生成
// ---------------------------------------------------------------------------

function getRedirectUri(): string {
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (env === "production") {
    const uri = process.env.GOOGLE_REDIRECT_URI_PRODUCTION;
    if (!uri) throw new Error("GOOGLE_REDIRECT_URI_PRODUCTION 未設定");
    return uri;
  }
  const uri = process.env.GOOGLE_REDIRECT_URI_DEVELOPMENT;
  if (!uri) throw new Error("GOOGLE_REDIRECT_URI_DEVELOPMENT 未設定");
  return uri;
}

export function getOAuth2Client(): Auth.OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が環境変数に未設定です",
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ---------------------------------------------------------------------------
// 認可URL生成
// ---------------------------------------------------------------------------

/**
 * 認可URLを生成。state パラメータには CSRF 防止用のランダム値を入れる想定だが、
 * Phase 1 では単一ユーザー想定でリダイレクト先固定のため簡易実装。
 */
export function buildAuthUrl(state?: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline", // refresh_token を取得するために必須
    prompt: "consent", // 毎回 refresh_token が来るように
    scope: GMAIL_SCOPES,
    state: state ?? "",
  });
}

// ---------------------------------------------------------------------------
// 認可コード → トークン交換 ＋ DB 保存
// ---------------------------------------------------------------------------

export async function exchangeCodeAndStore(
  code: string,
  userEmail: string = PRIMARY_GMAIL_USER,
): Promise<StoredToken> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Google から access_token が返却されませんでした");
  }
  if (!tokens.expiry_date) {
    throw new Error("Google から expiry_date が返却されませんでした");
  }

  const stored: StoredToken = {
    user_email: userEmail,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expiry_date: new Date(tokens.expiry_date).toISOString(),
    scope: (tokens.scope ?? GMAIL_SCOPES.join(" ")).trim(),
    token_type: tokens.token_type ?? "Bearer",
  };

  const supabase = getSupabase();
  // 既存の refresh_token を保持するため UPSERT する
  // 既存行があり refresh_token: null が来たら、既存値を残す（COALESCE 相当をアプリ側でやる）
  const { data: existing } = await supabase
    .from("gmail_tokens")
    .select("refresh_token")
    .eq("user_email", userEmail)
    .maybeSingle();

  const finalRefresh =
    stored.refresh_token ?? existing?.refresh_token ?? null;

  const { error } = await supabase.from("gmail_tokens").upsert(
    {
      user_email: stored.user_email,
      access_token: stored.access_token,
      refresh_token: finalRefresh,
      expiry_date: stored.expiry_date,
      scope: stored.scope,
      token_type: stored.token_type,
    },
    { onConflict: "user_email" },
  );

  if (error) {
    throw new Error(`gmail_tokens への UPSERT 失敗: ${error.message}`);
  }

  return { ...stored, refresh_token: finalRefresh };
}

// ---------------------------------------------------------------------------
// トークン取得 ＋ 期限切れ時の自動リフレッシュ
// ---------------------------------------------------------------------------

/** 60秒のバッファを持って期限切れ判定 */
function isExpired(iso: string): boolean {
  const expiry = new Date(iso).getTime();
  const now = Date.now();
  return expiry - now < 60_000;
}

export async function getStoredToken(
  userEmail: string = PRIMARY_GMAIL_USER,
): Promise<StoredToken | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("*")
    .eq("user_email", userEmail)
    .maybeSingle();
  if (error) {
    throw new Error(`gmail_tokens SELECT 失敗: ${error.message}`);
  }
  if (!data) return null;
  return {
    user_email: data.user_email,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expiry_date,
    scope: data.scope,
    token_type: data.token_type,
  };
}

/**
 * 認証済みクライアントを返す。
 * - アクセストークンが期限切れなら refresh_token で更新し、DB を上書き保存。
 * - リフレッシュも失敗したら例外（呼び出し元で「再認証してください」UI を出すべき）。
 */
export async function getAuthedClient(
  userEmail: string = PRIMARY_GMAIL_USER,
): Promise<Auth.OAuth2Client> {
  const stored = await getStoredToken(userEmail);
  if (!stored) {
    throw new Error("Gmail トークン未保存です。先に /api/auth/google で連携してください。");
  }

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token ?? undefined,
    expiry_date: new Date(stored.expiry_date).getTime(),
    scope: stored.scope,
    token_type: stored.token_type ?? "Bearer",
  });

  if (isExpired(stored.expiry_date)) {
    if (!stored.refresh_token) {
      throw new Error(
        "アクセストークン期限切れ＋リフレッシュトークン未保存。再認証が必要です。",
      );
    }
    try {
      const { credentials } = await client.refreshAccessToken();
      const newAccessToken = credentials.access_token;
      const newExpiry = credentials.expiry_date;
      if (!newAccessToken || !newExpiry) {
        throw new Error("リフレッシュ結果に access_token / expiry_date がありません");
      }
      // DB 更新（refresh_token は再発行されるとは限らないので既存値を保持）
      const supabase = getSupabase();
      await supabase
        .from("gmail_tokens")
        .update({
          access_token: newAccessToken,
          expiry_date: new Date(newExpiry).toISOString(),
          // scope / token_type / refresh_token は変更しない
        })
        .eq("user_email", userEmail);
      // クライアントにも反映
      client.setCredentials({
        access_token: newAccessToken,
        refresh_token: stored.refresh_token,
        expiry_date: newExpiry,
        scope: stored.scope,
        token_type: stored.token_type ?? "Bearer",
      });
    } catch (err: any) {
      throw new Error(
        `アクセストークンのリフレッシュ失敗: ${err?.message || err}`,
      );
    }
  }

  return client;
}

// ---------------------------------------------------------------------------
// 連携解除
// ---------------------------------------------------------------------------

/** トークンを DB から削除する */
export async function deleteStoredToken(
  userEmail: string = PRIMARY_GMAIL_USER,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("gmail_tokens")
    .delete()
    .eq("user_email", userEmail);
  if (error) {
    throw new Error(`gmail_tokens DELETE 失敗: ${error.message}`);
  }
}
