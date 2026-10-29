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
 * 「毎回、倉庫に取りに行く」ための取り方。
 *
 * ■ なぜ要るか（2026-09-19・kp99 で実測して分かったこと）
 *   Next.js は、サーバー側から出す問い合わせの答えを**覚えておいて使い回す**ことがある。
 *   数を見せる窓口（/api/hit/summary）でこれが起きると、
 *   **表に行が入ったあとも、空っぽだった時の答えを返し続ける**。
 *   実際、9/19 の 10:43（表が空）に一度読んだあと、
 *   10:44 と 10:47 に行が入っても、10:49 まで「0」を返し続けた。
 *   ＝ じゅんが見る3つの数字のうち「訪問」が、**動いても動かなく見える**。
 *
 * ■ 直し方
 *   その問い合わせにだけ「覚えないで」と付ける（`cache: "no-store"`）。
 *   数を数える所・診断する所だけに付け、**手羽屋が毎日使う所には付けない**
 *   （既定の取り方は1文字も変えていない＝今までどおり動く）。
 */
export function noStoreFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, { ...(init ?? {}), cache: "no-store" });
}

/** 接続のしかた。`fresh` を付けたときだけ「覚えないで」を足す */
export type ServerClientOptions = { fresh?: boolean };

function clientOptions(opts?: ServerClientOptions) {
  return opts?.fresh ? { global: { fetch: noStoreFetch } } : undefined;
}

/**
 * サーバー側で使う倉庫への接続。
 *
 * マスターキーが使えるならそれを使い、
 * **壊れているときは通常の鍵に戻して動かし続ける**。
 * （マスターキーが要る処理だけが失敗し、アプリ全体は止まらない）
 *
 * `{ fresh: true }` を付けると、答えを覚えずに毎回倉庫へ取りに行く（数を見せる所だけで使う）。
 */
export function serverClient(opts?: ServerClientOptions): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const service = serviceRoleKeyStatus();
  const anon = anonKeyStatus();

  if (service.ok) return createClient(url, service.key, clientOptions(opts));

  if (!service.ok && service.reason !== "未設定") {
    console.error(
      `[Supabase] SUPABASE_SERVICE_ROLE_KEY が使えません（${service.reason}）。` +
        `通常の鍵で動かします。Vercelの環境変数を貼り直してください。`,
    );
  }
  // 通常の鍵も壊れているなら、どのみち動かない。そのまま渡してエラーを出す
  return createClient(url, anon.ok ? anon.key : "", clientOptions(opts));
}

/**
 * **表に出ている鍵（公開の鍵）だけ**で倉庫につなぐ。
 *
 * ■ なぜ要るか（2026-10-13・f3-4）
 *   「ブラウザに配られている鍵で、この棚が読めてしまわないか」を確かめるには、
 *   必ずその鍵で聞かないといけません。`serverClient()` はサーバー側の鍵が
 *   使えるときはそちらを使うので（鍵の決まりを飛び越えて読めてしまう）、
 *   確かめには使えません。ここは**いつでも公開の鍵だけ**を使います。
 *
 * ★読むだけの確かめに使うもので、書き込みには使いません。
 */
export function anonClient(opts?: ServerClientOptions): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anon = anonKeyStatus();
  return createClient(url, anon.ok ? anon.key : "", clientOptions(opts));
}

/**
 * マスターキーが必要な処理（バックアップ・写真の引っ越しなど）専用の接続。
 * 使えないときは null を返す。呼び出し側は理由を利用者に伝えること。
 */
export function serviceClientOrNull(opts?: ServerClientOptions): SupabaseClient | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  // 全角が混ざっているだけなら、形を確かめたうえで直して使う（2026-09-19・kp67）。
  // 直せなければ今までどおり null。ここは「使えないと何もできない」所なので、
  // 直して動くほうが必ず良く、直しが外れても今と同じ（何もできない）で済む。
  const service = serviceRoleKeyRepair(url);
  if (!url) return null;
  if (service.ok) return createClient(url, service.key, clientOptions(opts));
  // 公式の名前が使えないときだけ、**よその名前に本物が入っていないか**を見る
  // （2026-10-29・kp267）。形の確かめを そのまま通ったものしか使わないので、
  // 推測で鍵を作ることにはなりません。無ければ今までどおり null＝何もしません。
  const alt = alternateServiceKey(process.env, url);
  if (!alt) return null;
  return createClient(url, alt.key, clientOptions(opts));
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

/** 使えない文字の内訳。**値そのものは絶対に含めない**（数と種類だけ） */
export type BrokenChars = {
  /** 通信に使えない文字の数 */
  count: number;
  /** そのうち「全角→半角」で直せるものの数 */
  convertible: number;
  /** 値全体の長さ。鍵らしい長さかどうかを見るためだけに使う */
  length: number;
  /** 日本語（ひらがな・カタカナ・漢字）が何文字入っているか */
  japanese: number;
  /** 改行が何個入っているか（1行のはずの値に改行があれば貼り間違い） */
  newlines: number;
  /** 鍵の書き出しになっているか（JWT の eyJ／新しい形の sb_ ）。値そのものは出さない */
  startsLikeKey: boolean;
};

/**
 * 使えない文字の数と種類を調べる（**値そのものは返さない**）。
 *
 * 数だけだと「貼り付けのしそこない」と「そもそも別の物を貼った」が区別できない。
 * 2026-09-19 に本番で数えたら **513 個**あり、鍵（200文字ほど）ではありえなかった。
 * そこで、長さ・日本語の数・改行の数・書き出しも見て、
 * 「直せば済むのか」「値そのものが違うのか」を言い分けられるようにした。
 */
export function countBrokenChars(value: string): BrokenChars {
  let count = 0;
  let convertible = 0;
  let japanese = 0;
  let newlines = 0;
  for (const ch of value) {
    if (ch === "\n" || ch === "\r") newlines++;
    if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(ch)) japanese++;
    if (isUsableKey(ch)) continue;
    count++;
    const half = ch.normalize("NFKC");
    if (half.length > 0 && isUsableKey(half)) convertible++;
  }
  return {
    count,
    convertible,
    length: value.length,
    japanese,
    newlines,
    // JWT はどれも eyJ で始まる（公開されている形なので、これを出しても秘密は漏れない）
    startsLikeKey: /^(eyJ|sb_)/.test(value),
  };
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

/* ============================================================
 * ここから下は 2026-10-29（kp267）に足した「鍵が別の名前に入っていないか探す」しくみ。
 *
 * ■ なぜ足したか（やさしい説明）
 *   仕上げの残り3つ（f1-4・f3-4・f5-4）は、22日 動いていません。
 *   止まっている理由はコードではなく、**サーバー側の鍵の欄に鍵ではないものが
 *   入っていること**（kp241）と、倉庫に貼り紙を1回 貼ること（kp238）です。
 *   鍵の欄に日本語の文章が入っている＝**貼る欄を間違えた**ようにも見えます。
 *   だとすれば、**本物の鍵はよその欄に入っているかもしれません**。
 *   入っていれば、じゅんの1分を待たずに、こちら側で f3-4 が1つ前に進みます
 *   （レシート写真の置き場を閉める・毎日の控えが戻る）。
 *
 * ■ ここでやること／やらないこと
 *   やる  … Vercel に預けてある設定の**名前だけ**を1つずつ見て、
 *           その値が「この倉庫の service_role の鍵の形」をしているかを確かめる。
 *   やらない … 値を返す・記録に残す・推測で作り変える。
 *           形の確かめ方は 2026-09-19 のものと**同じ関数**（looksLikeServiceRoleKey）で、
 *           「. で3つ／真ん中の role が service_role／ref がこの倉庫」を全部 満たさないと
 *           候補にしません。新しい形（sb_secret_…）は倉庫の名前が入っていないので
 *           **見つけたことだけ言って、使いません**。
 *   ブラウザにも配られる名前（NEXT_PUBLIC_…）に鍵が入っていたら、
 *   それは**すでに表に出てしまっている**ので、やはり使わず「危ない」と言うだけにします。
 * ============================================================ */

/** 本来、鍵が入っているはずの名前 */
export const SERVICE_KEY_NAME = "SUPABASE_SERVICE_ROLE_KEY";

/** 鍵らしい長さの下限（JWT は 200 文字ほど。短い値は見ない） */
const KEY_MIN_LENGTH = 40;

/** 見つけた候補。**値は1文字も持ちません**（名前と見立てだけ） */
export type KeyCandidate = {
  /** 設定の名前（値ではありません） */
  name: string;
  /** そのまま鍵として使える形か */
  usable: boolean;
  /** 全角を半角に直すと形が合うか */
  repaired: boolean;
  /** ブラウザにも配られる名前（NEXT_PUBLIC_…）か。true なら使いません */
  publicName: boolean;
  /** 新しい形の秘密の鍵（sb_secret_…）に見えるか。倉庫が分からないので使いません */
  secretStyle: boolean;
};

/** 新しい形の秘密の鍵の書き出し（公開されている形なので、これを見ても値は漏れない） */
function looksLikeSecretStyleKey(value: string): boolean {
  return /^sb_secret_[A-Za-z0-9_-]{10,}$/.test(value);
}

/**
 * 預けてある設定の中から、「この倉庫の service_role の鍵の形」をしている名前を探す。
 * **値は返しません。**（公式の名前そのものは、探す対象から外します）
 */
export function findServiceKeyCandidates(
  env: Record<string, string | undefined>,
  url?: string,
): KeyCandidate[] {
  const target = (url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const found: KeyCandidate[] = [];
  for (const name of Object.keys(env)) {
    if (name === SERVICE_KEY_NAME) continue;
    const raw = env[name];
    if (typeof raw !== "string") continue;
    const tidy = tidyPastedValue(raw);
    if (tidy.length < KEY_MIN_LENGTH) continue;

    const publicName = name.startsWith("NEXT_PUBLIC_");
    if (isUsableKey(tidy) && looksLikeServiceRoleKey(tidy, target)) {
      found.push({ name, usable: true, repaired: false, publicName, secretStyle: false });
      continue;
    }
    if (isUsableKey(tidy) && looksLikeSecretStyleKey(tidy)) {
      found.push({ name, usable: false, repaired: false, publicName, secretStyle: true });
      continue;
    }
    const fixed = tidyPastedValue(repairWideChars(tidy));
    if (isUsableKey(fixed) && looksLikeServiceRoleKey(fixed, target)) {
      found.push({ name, usable: false, repaired: true, publicName, secretStyle: false });
    }
  }
  return found;
}

/**
 * 公式の名前の鍵が使えないときに、代わりに使ってよい鍵を1つだけ選ぶ。
 *
 * ■ 使ってよい条件（1つでも外れたら使いません）
 *   ・形の確かめを**そのまま**通った（全角を直した値は使いません。直すのは公式の名前だけ）
 *   ・ブラウザにも配られる名前ではない（NEXT_PUBLIC_… は表に出てしまっているので使わない）
 *   ・新しい形（sb_secret_…）ではない（どの倉庫のものか確かめられないので使わない）
 */
export function alternateServiceKey(
  env: Record<string, string | undefined>,
  url?: string,
): { name: string; key: string } | null {
  const target = (url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  for (const c of findServiceKeyCandidates(env, target)) {
    if (!c.usable || c.publicName || c.secretStyle) continue;
    const key = tidyPastedValue(env[c.name] ?? "");
    if (isUsableKey(key) && looksLikeServiceRoleKey(key, target)) {
      return { name: c.name, key };
    }
  }
  return null;
}
