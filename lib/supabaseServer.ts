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
  // 全角が混ざっているだけなら、形を確かめたうえで直して使う（2026-09-19・kp67）。
  // 直せなければ今までどおり null。ここは「使えないと何もできない」所なので、
  // 直して動くほうが必ず良く、直しが外れても今と同じ（何もできない）で済む。
  const service = serviceRoleKeyRepair(url);
  if (!url || !service.ok) return null;
  return createClient(url, service.key);
}

/* ============================================================
 * ここから下は 2026-09-19（kp67）に足した「全角混入を、確かめられる範囲だけ直す」しくみ。
 *
 * ■ なぜ足したか
 *   本番の SUPABASE_SERVICE_ROLE_KEY に全角が混ざっていて（kp54）、
 *   ①お申し込みの控え ②サイトに来た人の数 ③手羽屋の毎日のバックアップ
 *   の3つが止まっている。貼り直し（kp55）は2分で済むが、
 *   人の画面操作を待つあいだ、記録は1件も残らない。
 *
 * ■ どこまで直すか（ここが肝心）
 *   直すのは「全角の英数字・記号を、対応する半角に置き換える」だけ。
 *   これは JIS の決まりで1対1に決まっている変換（NFKC）で、こちらの推測は入らない。
 *   そのうえで **直した結果が本当に鍵の形をしているかを確かめてからでないと使わない**：
 *     ・「. で3つに分かれ、どれも半角の英数字と - _ だけ」（JWT の形）
 *     ・真ん中を読むと JSON になり、role が service_role
 *     ・その中の ref が、いま繋ぎに行く倉庫の名前と一致する
 *   1つでも外れたら直せなかった扱いにして、今までどおり「壊れている」と正直に出す。
 *   ＝ **鍵を推測で作り変えることはしない。**
 *
 * ■ 安全について
 *   直した鍵を使うのは、いま **どのみち動いていない所だけ**（serviceClientOrNull）。
 *   すでに動いている所（serverClient → 通常の鍵に戻す道）には手を入れていないので、
 *   万一この直しが外れても、手羽屋の画面が今より悪くなることはない。
 *   直した鍵が違っていれば倉庫側が断るだけで、いまと同じ結果になる。
 * ============================================================ */

/** 使えない文字の内訳。**値そのものは絶対に含めない**（数だけ） */
export type BrokenChars = {
  /** 通信に使えない文字の数 */
  count: number;
  /** そのうち「全角→半角」で直せるものの数 */
  convertible: number;
};

/** 使えない文字が何個あり、そのうち何個が半角に直せるかを数える（値は返さない） */
export function countBrokenChars(value: string): BrokenChars {
  let count = 0;
  let convertible = 0;
  for (const ch of value) {
    if (isUsableKey(ch)) continue;
    count++;
    const half = ch.normalize("NFKC");
    if (half.length > 0 && isUsableKey(half)) convertible++;
  }
  return { count, convertible };
}

/** 全角の英数字・記号を、決まりどおりの半角に置き換える（推測は入らない） */
export function repairWideChars(value: string): string {
  return value.normalize("NFKC");
}

/** URL から倉庫の名前（例 vtuyebyjbvjmucqpkxug）を取り出す */
export function projectRefFromUrl(url: string): string | null {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\./i.exec(url.trim());
  return m ? m[1] : null;
}

/**
 * 直した値が、本当にこの倉庫の service_role の鍵の形をしているか確かめる。
 * 形が違えば false。ここを通らない値は使わない。
 */
export function looksLikeServiceRoleKey(key: string, url: string): boolean {
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  if (!parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  let payload: unknown;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    payload = JSON.parse(json);
  } catch {
    return false;
  }
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (p.role !== "service_role") return false;
  const ref = projectRefFromUrl(url);
  // 倉庫の名前が読み取れるときは、一致まで確かめる（別の倉庫の鍵を使わないため）
  if (ref && p.ref !== ref) return false;
  return true;
}

/** 直したかどうかまで含めた、鍵の見立て */
export type KeyRepair =
  | { ok: true; key: string; repaired: boolean; broken: BrokenChars }
  | {
      ok: false;
      reason: "未設定" | "全角などの使えない文字が入っている";
      repaired: false;
      broken: BrokenChars;
    };

/**
 * service_role キーを、必要なら直したうえで返す。
 *
 * ① そのまま使えるなら、そのまま返す（いままでと同じ）
 * ② 全角が混ざっているだけなら、半角に直して **鍵の形を確かめてから** 返す
 * ③ 確かめられなければ、今までどおり「壊れている」と返す
 */
export function serviceRoleKeyRepair(url?: string): KeyRepair {
  const raw = tidyPastedValue(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  const broken = countBrokenChars(raw);

  if (!raw) return { ok: false, reason: "未設定", repaired: false, broken };
  if (isUsableKey(raw)) return { ok: true, key: raw, repaired: false, broken };

  const target = (url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const fixed = tidyPastedValue(repairWideChars(raw));
  if (isUsableKey(fixed) && looksLikeServiceRoleKey(fixed, target)) {
    return { ok: true, key: fixed, repaired: true, broken };
  }
  return {
    ok: false,
    reason: "全角などの使えない文字が入っている",
    repaired: false,
    broken,
  };
}
