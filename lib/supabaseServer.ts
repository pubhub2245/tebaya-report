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
 * 貼り付けのしそこないを、**前後だけ**きれいにする。
 *
 * ■ なぜ「前後だけ」なのか
 *   値の途中に使えない文字が入っているときは、鍵そのものが違うということなので、
 *   直しようがない（人が貼り直すしかない）。勝手に消すと、間違った鍵で
 *   「使えるつもりのまま」動いてしまい、かえって原因が分からなくなる。
 *   取り除くのは、貼り付けのときに前後へ紛れ込むだけの文字に限る。
 *
 * ■ 取り除くもの
 *   半角の空白・改行・タブ／**全角の空白（　）**／見えない印（BOM・ゼロ幅）／
 *   前後を囲む引用符（" ' 「 」 “ ” ）
 *
 * ■ なぜ足したか（2026-09-19）
 *   本番の SUPABASE_SERVICE_ROLE_KEY が「値は入っているが使えない」状態だった。
 *   2026-08-28 と同じ全角混入。もし紛れ込んでいたのが前後の全角スペースだけなら、
 *   ここで取り除くだけで直る（人の作業がゼロで済む）。
 *   途中に混ざっていたときは、今までどおり「壊れている」と正直に出す。
 */
export function tidyPastedValue(raw: string): string {
  // 前後の「空白のようなもの」と見えない印を落とす
  let v = raw.replace(/^[\s\u3000\uFEFF\u200B-\u200D]+/, "").replace(/[\s\u3000\uFEFF\u200B-\u200D]+$/, "");
  // 前後を囲む引用符を落とす（1組だけ）
  v = v.replace(/^["'「“]/, "").replace(/["'」”]$/, "");
  // 引用符の内側にまた空白が残ることがあるので、もう一度だけ落とす
  return v.replace(/^[\s\u3000\uFEFF\u200B-\u200D]+/, "").replace(/[\s\u3000\uFEFF\u200B-\u200D]+$/, "");
}

/**
 * 環境変数の値を、鍵として使えるか調べて返す。
 * 前後の空白や引用符は、よくあるコピペのしそこないなので取り除く。
 */
export function checkKey(raw: string | undefined | null): KeyCheck {
  const trimmed = tidyPastedValue(raw ?? "");
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
