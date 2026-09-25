/**
 * 送り先8軒の「並び順」と「何軒送ったかの控え」だけを持つファイル（kp172）。
 *
 * ■ なぜ呼び名と分けたか（やさしい説明）
 *   kp162 で「送る1枚（/keiri/send）には、送り先8軒の呼び名を出さない」と決めました。
 *   ところがその約束は「画面に出さない」までで、「配らない」にはなっていませんでした。
 *   ブラウザに配られる部品（"use client" の付いたもの）が、呼び名の入ったファイルを
 *   まるごと取り込んでいたため、画面には1文字も出ないのに、
 *   **配られている中身を読めば呼び名が分かる**形になっていました。
 *   （/keiri/send は合言葉の要らない住所＝誰でも開けます。）
 *
 *   そこで、**呼び名は別のファイル（outreachShopLabels.ts）に移し**、
 *   ここには id（控えに残す印の名前）と並び順だけを置きます。
 *   呼び名が要るのは「じゅんの端末にだけ出る帯」1か所だけなので、
 *   そこだけが呼び名のファイルを取り込みます。
 *
 * ■ ここに書いてよいもの・いけないもの
 *   ・書いてよい … id（crepe / kaitenyaki … のような英字の印）、並び順、
 *     LINE で送れるかどうか
 *   ・**書いてはいけない … お店の呼び名・連絡先・値段**
 *   戻り止めは tests/keiriOutreachNames.test.ts と tests/keiriOutreach.test.ts。
 */

/** 送り先1軒の印（控えに残す名前。変えると印が外れるので変えない） */
export type OutreachShopId =
  | "crepe"
  | "kaitenyaki"
  | "tori"
  | "bistro"
  | "kitchencar1"
  | "kitchencar2"
  | "houjin"
  | "night";

/** 並び順の1件。呼び名は持たない */
export type OutreachShopOrder = {
  id: OutreachShopId;
  /** LINE では送れない（メールのみ）1軒だけ true */
  emailOnly?: true;
};

/**
 * 送り先8軒の並び順（ながやまさんの出店でご一緒している同業）。
 * 司令室の送り先一覧（meta/keiri-line-message）と同じ順番。
 */
export const OUTREACH_SHOP_ORDER: readonly OutreachShopOrder[] = [
  { id: "crepe" },
  { id: "kaitenyaki" },
  { id: "tori" },
  { id: "bistro" },
  { id: "kitchencar1" },
  { id: "kitchencar2" },
  { id: "houjin", emailOnly: true },
  { id: "night" },
] as const;

/** 送り先の軒数（8） */
export const OUTREACH_SHOP_COUNT = OUTREACH_SHOP_ORDER.length;

/** 送った印（お店の id をカンマでつないで持つ） */
export const OUTREACH_SENT_KEY = "keiri-outreach-sent.v1";

/** 送った印の文字列を、お店の id の一覧に戻す（知らない id は捨てる） */
export function parseSent(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const known = new Set<string>(OUTREACH_SHOP_ORDER.map((s) => s.id));
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id && known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** 送った印の一覧を、控えに入れる文字列にする */
export function serializeSent(ids: readonly string[]): string {
  return parseSent(ids.join(","))
    .slice()
    .sort((a, b) => indexOfShop(a) - indexOfShop(b))
    .join(",");
}

/** 並び順の何番目か（知らない id は -1） */
export function indexOfShop(id: string): number {
  return OUTREACH_SHOP_ORDER.findIndex((s) => s.id === id);
}

/** まだ送っていないお店の id（並び順のまま） */
export function remainingShopIds(sent: readonly string[]): OutreachShopId[] {
  const done = new Set(parseSent(sent.join(",")));
  return OUTREACH_SHOP_ORDER.filter((s) => !done.has(s.id)).map((s) => s.id);
}

/**
 * 「今日の1軒」＝まだ送っていない中の、いちばん上の1軒の id（kp154）。
 *
 * 帯のいちばん大きいボタンは［LINEで送る］なので、LINE で送れる1軒を先に名指しする。
 * メールのみの1軒は、それしか残っていないときだけ出す。
 * まだ1軒も残っていなければ null。
 */
export function nextShopId(sent: readonly string[]): OutreachShopId | null {
  const rest = remainingShopIds(sent);
  const lineOk = rest.find((id) => !isEmailOnly(id));
  return lineOk ?? rest[0] ?? null;
}

/** LINE では送れない1軒か */
export function isEmailOnly(id: string): boolean {
  return OUTREACH_SHOP_ORDER.some((s) => s.id === id && s.emailOnly === true);
}

/** 送った印を1つ足す（次の1軒＝帯が名指しするのと同じ1軒）。全部送りおわっていれば何もしない */
export function markNextSent(sent: readonly string[]): string[] {
  const current = parseSent(sent.join(","));
  const next = nextShopId(current);
  if (!next) return current;
  return parseSent([...current, next].join(","));
}

/** 送った印を1つ取り消す（押し間違え用）。順番のいちばん後ろの1つを外す */
export function undoLastSent(sent: readonly string[]): string[] {
  const current = parseSent(sent.join(","));
  if (current.length === 0) return current;
  let lastId = current[0];
  for (const id of current) {
    if (indexOfShop(id) >= indexOfShop(lastId)) lastId = id;
  }
  return current.filter((id) => id !== lastId);
}

/** 画面に出す「◯ / 8 軒」と「あと ◯ 軒」。**お店の呼び名は返さない** */
export function sentProgress(sent: readonly string[]): {
  done: number;
  total: number;
  remaining: number;
} {
  const done = parseSent(sent.join(",")).length;
  const total = OUTREACH_SHOP_COUNT;
  return { done, total, remaining: total - done };
}
