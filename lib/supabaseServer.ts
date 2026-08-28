/**
 * サーバー側から倉庫（Supabase）に繋ぐときの鍵の扱いを、ここ1か所にまとめたファイル。
 *
 * ■ なぜ作ったか（2026-08-28 の事故）
 *   Vercel に登録した `SUPABASE_SERVICE_ROLE_KEY` の値に、
 *   **全角文字（例：`（`）が混ざっていた**。
 *   通信の合言葉（HTTPヘッダー）には半角の文字しか入れられないため、
 *   その鍵を使う処理がすべて
 *     「Cannot convert argument to a ByteString ...」
 *   というエラーで止まった。
 *
 *   この鍵は26か所で使われていて、設営後チェック・シフト・意見箱・LINE送信・
 *   毎日の自動処理まで、**サーバー側の広い範囲が一度に止まった**。
 *
 * ■ これからのルール
 *   鍵は必ずこのファイル経由で取り出す。
 *   値が壊れていたら（全角が混ざっている・空など）**使わずに元の鍵に戻す**。
 *   壊れた値のせいでアプリ全体が止まるより、
 *   「一部の機能だけが使えない」で踏みとどまる方がはるかにまし。
 *
 *   コピペのしそこないは誰にでも起きる。壊れた設定でアプリが全滅しない作りにしておく。
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** 鍵として使えるか調べた結果 */
export type KeyCheck =
  | { ok: true; key: string }
  | { ok: false; reason: "未設定" | "全角などの使えない文字が入っている" };

/**
 * 通信の合言葉として使える文字だけでできているか。
 *
 * HTTPヘッダーに入れられるのは、おおよそ半角の英数字と記号だけ。
 * 全角文字・日本語・改行が混ざっていると、通信そのものが失敗する。
 */
export function isUsableKey(value: string): boolean {
  // 制御文字（改行など）と、半角の範囲を超える文字を弾く
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return value.length > 0;
}

/**
 * 環境変数の値を、鍵として使えるか調べて返す。
 * 前後の空白や引用符は、よくあるコピペのしそこないなので取り除く。
 */
export function checkKey(raw: string | undefined | null): KeyCheck {
  const trimmed = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return { ok: false, reason: "未設定" };
  if (!isUsableKey(trimmed)) {
    return { ok: false, reason: "全角などの使えない文字が入っている" };
  }
  return { ok: true, key: trimmed };
}

/** service_role キー（全部の鍵を開けられるマスターキー）の状態 */
export function serviceRoleKeyStatus(): KeyCheck {
  return checkKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** ブラウザにも配られる通常の鍵の状態 */
export function anonKeyStatus(): KeyCheck {
  return checkKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * サーバー側で使う倉庫への接続。
 *
 * マスターキーが使えるならそれを使い、
 * **壊れているときは通常の鍵に戻して動かし続ける**。
 * （マスターキーが要る処理だけが失敗し、アプリ全体は止まらない）
 */
export function serverClient(): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const service = serviceRoleKeyStatus();
  const anon = anonKeyStatus();

  if (service.ok) return createClient(url, service.key);

  if (!service.ok && service.reason !== "未設定") {
    console.error(
      `[Supabase] SUPABASE_SERVICE_ROLE_KEY が使えません（${service.reason}）。` +
        `通常の鍵で動かします。Vercelの環境変数を貼り直してください。`,
    );
  }
  // 通常の鍵も壊れているなら、どのみち動かない。そのまま渡してエラーを出す
  return createClient(url, anon.ok ? anon.key : "");
}

/**
 * マスターキーが必要な処理（バックアップ・写真の引っ越しなど）専用の接続。
 * 使えないときは null を返す。呼び出し側は理由を利用者に伝えること。
 */
export function serviceClientOrNull(): SupabaseClient | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const service = serviceRoleKeyStatus();
  if (!url || !service.ok) return null;
  return createClient(url, service.key);
}
