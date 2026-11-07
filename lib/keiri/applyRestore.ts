/**
 * 「お申し込みの控えが棚に残らなかったとき、その1件を取りこぼさない」ための道。
 *
 * ■ なぜ要るのか（2026-11-07・B／f2-1）
 *   受け口（/api/keiri/apply）は、知らせ（LINE）と控え（倉庫の1行）を**同時に**走らせ、
 *   **どちらか片方でも通れば**「ありがとうございます」と返します。
 *   ところが 2026-11-05 から倉庫（データのしまい場所）が止まっており、
 *   いまお申し込みが入ると **知らせだけ飛んで、棚には1行も残りません**。
 *   このとき LINE に届く知らせは本物のお申し込みとまったく同じ文で、
 *   **控えが残ったのか残らなかったのかが、受け取った人には1文字も分かりません。**
 *   ＝ 倉庫が起きたあと「どのお申し込みを入れ直せばよいか」が誰にも分からず、
 *     その1件は静かに消えます（仕上げ②「申し込みが確実に残る」が崩れる形）。
 *
 * ■ どう直すか（本物の受け口の流れは1行も変えない）
 *   控えが残らなかったときだけ、**2通目の短い知らせ**を送ります。中身は3つだけ：
 *     ① 棚には残っていない（この知らせが唯一の控え。消さないでください）
 *     ② 入れていただいた中身（打ち直さなくてよいように、そのまま載せる）
 *     ③ **［入れ直す］のリンク1本**（お申し込みの画面が、同じ中身で埋まった状態で開く）
 *   倉庫が起きたあとリンクを1回 開いて送信を押せば、同じ1件が棚に残ります。
 *
 * ■ 守っていること
 *   ・1通目（本物の知らせ）の文・送り方・速さは1文字も変えていません。
 *     控えを待ってから知らせを作る形にすると、倉庫が重い日に知らせそのものが遅れる／
 *     落ちることがあるためです（いまの同時実行はそのために入っています）。
 *   ・2通目は**控えが残らなかったときだけ**出ます（通数を無駄に使いません）。
 *   ・ここでは通信をしません。文字とリンクを組み立てるだけの純粋な計算です。
 *   ・リンクに入るのは、送り主が自分で入れた5つの欄だけです。
 *     鍵・合言葉・環境変数の値は1文字も入れません。
 *   ・手羽屋の日報・シフト・レジ・LINE の送り方・お金の計算には一切さわっていません。
 */

import { KEIRI_APPLY_LIMITS, type KeiriApplication } from "./apply";

/** 入れ直しのリンクが開く画面 */
export const APPLY_RESTORE_PATH = "/keiri/apply";

/** リンクに中身を載せるときの合言葉（住所の ?prefill= ） */
export const APPLY_RESTORE_PARAM = "prefill";

/**
 * リンクの長さの上限（文字）。
 * LINE の1通に収まり、スマホで折り返しても押せる長さにしておく。
 * 超えたときはリンクを付けず、中身だけを文に残す（＝打ち直しで残せる）。
 */
export const APPLY_RESTORE_MAX_URL = 1600;

/** 入れ直しに要る5つの欄だけ（短い合言葉にしてリンクを短く保つ） */
type Packed = {
  s?: string;
  c?: string;
  e?: string;
  p?: string;
  n?: string;
};

export type ApplyRestoreFields = {
  shopName: string;
  contactName: string;
  email: string;
  phone: string;
  note: string;
};

const EMPTY_FIELDS: ApplyRestoreFields = {
  shopName: "",
  contactName: "",
  email: "",
  phone: "",
  note: "",
};

/**
 * 住所に乗せられる形（base64url）に直す。日本語がそのまま入るので UTF-8 で包む。
 *
 * ★サーバー（Node）とブラウザの両方で動かす必要があります。
 *   この画面はブラウザ側で住所を読むので、Node だけにある Buffer を当てにしません
 *   （当てにすると、ブラウザで欄が埋まらないまま静かに空で開きます）。
 */
function utf8ToBase64(text: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function toBase64Url(text: string): string {
  return utf8ToBase64(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string | null {
  try {
    const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return base64ToUtf8(b64);
  } catch {
    return null;
  }
}

/** お申し込み1件を、リンクに乗せる合言葉に直す（空の欄は載せない） */
export function encodeApplyRestore(a: {
  shop_name: string;
  contact_name: string;
  email: string;
  phone: string;
  note: string | null;
}): string {
  const packed: Packed = {};
  if (a.shop_name) packed.s = a.shop_name;
  if (a.contact_name) packed.c = a.contact_name;
  if (a.email) packed.e = a.email;
  if (a.phone) packed.p = a.phone;
  if (a.note) packed.n = a.note;
  return toBase64Url(JSON.stringify(packed));
}

/**
 * リンクの合言葉を、画面の5つの欄に戻す。
 * 読めない・形が違うときは null（画面は今までどおり空で開く）。
 * ★長すぎる値は欄ごとの上限で切る（貼り付け攻めで画面を壊されないため）。
 */
export function decodeApplyRestore(raw: string | null | undefined): ApplyRestoreFields | null {
  if (typeof raw !== "string" || raw === "") return null;
  if (raw.length > APPLY_RESTORE_MAX_URL) return null;
  const json = fromBase64Url(raw);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  const pick = (key: string, max: number): string => {
    const v = p[key];
    return typeof v === "string" ? v.slice(0, max) : "";
  };
  const fields: ApplyRestoreFields = {
    shopName: pick("s", KEIRI_APPLY_LIMITS.shopName),
    contactName: pick("c", KEIRI_APPLY_LIMITS.contactName),
    email: pick("e", KEIRI_APPLY_LIMITS.email),
    phone: pick("p", KEIRI_APPLY_LIMITS.phone),
    note: pick("n", KEIRI_APPLY_LIMITS.note),
  };
  // 1つも中身が無ければ「無かった」と同じ扱いにする
  const empty = Object.values(fields).every((v) => v === "");
  return empty ? null : fields;
}

/**
 * ［入れ直す］のリンクを作る。長すぎるときは null（文には中身だけ残す）。
 * `origin` は「https://tebaya-report.vercel.app」のような住所の頭。
 */
export function applyRestoreUrl(
  origin: string,
  a: Parameters<typeof encodeApplyRestore>[0],
): string | null {
  const base = String(origin ?? "").replace(/\/+$/, "");
  if (base === "") return null;
  const url = `${base}${APPLY_RESTORE_PATH}?${APPLY_RESTORE_PARAM}=${encodeApplyRestore(a)}`;
  return url.length > APPLY_RESTORE_MAX_URL ? null : url;
}

/** 2通目の知らせの見出し（本物の知らせと取り違えないようにする） */
export const APPLY_SAVE_FAILURE_TITLE = "【⚠ いまのお申し込み：棚に控えが残っていません】";

/**
 * 控えが残らなかったときの2通目の文を作る（通信しない・文字を組むだけ）。
 *
 * ★お申し込みそのものは受け取れています（1通目が届いているので）。
 *   ここで言うのは「読み返せる1行が棚に無い」ことだけです。
 */
export function applySaveFailureNoticeText(args: {
  application: KeiriApplication;
  /** ［入れ直す］のリンク。作れなかったときは null */
  restoreUrl: string | null;
  /** 受け取った時刻。省略すると「いま」 */
  at?: Date;
  /** 控えが残らなかった理由の1行（人の言葉・鍵や値は入れない）。無ければ省略 */
  reason?: string | null;
}): string {
  const { application: a, restoreUrl, at = new Date(), reason = null } = args;
  const when = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);

  const lines = [
    APPLY_SAVE_FAILURE_TITLE,
    `受付：${when}`,
    "",
    "お申し込みは受け取れています（お店の方の画面には「ありがとうございます」が出ています）。",
    "ただし、あとから一覧で読み返すための**棚の1行が残っていません**。",
    "**この知らせが、いま唯一の控えです。消さないでください。**",
  ];
  if (reason) lines.push(`（残らなかった理由：${reason}）`);
  lines.push(
    "",
    "■ 入れていただいた中身",
    `お店：${a.shop_name || "（未記入）"}`,
    `電話：${a.phone || "（未記入）"}`,
  );
  if (a.contact_name) lines.push(`お名前：${a.contact_name}`);
  if (a.email) lines.push(`メール：${a.email}`);
  if (a.note) lines.push(`ひとこと：${a.note}`);
  lines.push("", "■ どうすればよいか");
  if (restoreUrl) {
    lines.push(
      "下のリンクを開くと、お申し込みの画面が**この中身のまま**開きます。",
      "いちばん下の送信を1回 押すだけで、同じ1件が棚に残ります（打ち直しは要りません）。",
      restoreUrl,
      "",
      "★いま開いても棚が起きていなければ、また同じ知らせが来ます。その日は押さなくて大丈夫です。",
    );
  } else {
    lines.push(
      "中身が長いためリンクは付けられませんでした。上の中身を",
      "お申し込みの画面（/keiri/apply）に入れ直すと、棚に1行 残ります。",
    );
  }
  return lines.join("\n");
}
