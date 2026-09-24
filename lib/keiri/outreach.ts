/**
 * 「今日1軒だけ送る」の帯（kp145）の中身を、ここ1か所にまとめたファイル。
 *
 * ■ なぜ作ったか（やさしい説明）
 *   経理パッケージの最初の1件を取るための材料は、もうそろっています
 *   （メール1通・LINEで送る4行・返事が来たあとの文・順番つきの1枚）。
 *   それでも 9/19 から6日、1通も送られていません。
 *   足りないのは材料ではなく「思い出す場所」でした。
 *   そこで、じゅんが毎日必ず開く日報アプリのホームのいちばん上から、
 *   「今日、1軒だけ送りませんか」と声をかけます。1軒10秒です。
 *
 * ■ ここに入れてよいもの・いけないもの
 *   ・お店の**種類**（クレープ・回転焼き…）は出してよい
 *   ・**連絡先（LINEのID・メールアドレス）は1つも出さない**
 *     画面に出す必要がなく、出せば端末を見た人に他人の連絡先が渡るため。
 *     誰がどれかは じゅんの手元（司令室の meta/keiri-line-message）にあります。
 *   ・**値段は書かない**（受け取る8軒は同じ出店先に出ている同業のため）
 *   どれも tests/keiriOutreach.test.ts で固定してあります。
 *
 * ■ 手羽屋のスタッフには出しません
 *   このアプリにはログイン（アカウント）がありません。じゅんだけが持っているものは
 *   **管理者パスワード**だけなので、それを一度でも入れた端末にだけ印を付け、
 *   その端末にだけ帯を出します。スタッフの端末には最初から最後まで出ません。
 */

import { PUBLIC_SITE_URL } from "./siteUrl";

/** 送り先1軒 */
export type OutreachShop = {
  /** 控えに残す名前（変えると印が外れるので変えない） */
  id: string;
  /** 画面に出す呼び名。お店の種類だけ。連絡先は入れない */
  label: string;
  /** LINE で送れない相手にだけ付ける但し書き */
  note?: string;
};

/**
 * 送り先8軒（ながやまさんの出店でご一緒している同業）。
 * 並び順・id は司令室の送り先一覧（meta/keiri-line-message）と同じ順番。
 */
export const OUTREACH_SHOPS: readonly OutreachShop[] = [
  { id: "crepe", label: "クレープ" },
  { id: "kaitenyaki", label: "回転焼き" },
  { id: "tori", label: "鶏のお店" },
  { id: "bistro", label: "ビストロ" },
  { id: "kitchencar1", label: "キッチンカー（1軒目）" },
  { id: "kitchencar2", label: "キッチンカー（2軒目）" },
  { id: "houjin", label: "法人（複数台）", note: "この1軒はメールのみ" },
  { id: "night", label: "夜の催事のお店" },
] as const;

/** 案内ページ（送る文に入れるリンク） */
export const OUTREACH_LINK = `${PUBLIC_SITE_URL}/keiri/case`;

/**
 * そのままコピーして送る文（司令室の meta/keiri-line-message の「本文」と同じ）。
 * 先頭の「◯◯さん」だけ相手の名前に変えてもらう。
 */
export const OUTREACH_MESSAGE = [
  "◯◯さん、手羽屋の川畑です。",
  "うちで毎日つけている日報から、その月の利益と今の現金が出る仕組みを作って、よそのお店でも使えるようにしました。レシートの仕分けと月末の締めは、こちらでやります。",
  "もしよければ、中身だけ見てみてください（登録はいりません）。",
  OUTREACH_LINK,
].join("\n");

/** この端末が じゅんのものか（管理者パスワードを入れたことがあるか）の印 */
export const OWNER_DEVICE_KEY = "tebaya-owner-device.v1";
/** 送った印（お店の id をカンマでつないで持つ） */
export const OUTREACH_SENT_KEY = "keiri-outreach-sent.v1";
/** 「今日は出さない」を押した日（YYYY-MM-DD） */
export const OUTREACH_SNOOZE_KEY = "keiri-outreach-snooze.v1";

/** 送った印の文字列を、お店の id の一覧に戻す（知らない id は捨てる） */
export function parseSent(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const known = new Set(OUTREACH_SHOPS.map((s) => s.id));
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

function indexOfShop(id: string): number {
  return OUTREACH_SHOPS.findIndex((s) => s.id === id);
}

/** まだ送っていないお店 */
export function remainingShops(sent: readonly string[]): OutreachShop[] {
  const done = new Set(parseSent(sent.join(",")));
  return OUTREACH_SHOPS.filter((s) => !done.has(s.id));
}

/**
 * 帯を出すかどうか。
 * 出すのは「じゅんの端末」「今日はまだ閉じていない」「8軒ぜんぶには送っていない」の3つが揃うときだけ。
 */
export function shouldShowNudge(input: {
  /** 管理者パスワードを入れたことがある端末か */
  ownerDevice: boolean;
  /** 送った印 */
  sent: readonly string[];
  /** 「今日は出さない」を押した日（YYYY-MM-DD） */
  snoozedOn: string | null;
  /** 今日（YYYY-MM-DD） */
  today: string;
}): boolean {
  if (!input.ownerDevice) return false;
  if (input.snoozedOn && input.snoozedOn === input.today) return false;
  return remainingShops(input.sent).length > 0;
}

/** 今日の日付（YYYY-MM-DD・日本時間）。「今日は出さない」の判定に使う */
export function todayKey(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/**
 * この端末に「じゅんのもの」の印を付ける。
 * 手羽屋の管理者パスワードが合ったときにだけ呼ぶ
 * （申し込んだお店の合言葉では呼ばない）。
 */
export function markOwnerDevice(): void {
  try {
    localStorage.setItem(OWNER_DEVICE_KEY, "1");
  } catch {}
}

/** この端末に印が付いているか */
export function readOwnerDevice(): boolean {
  try {
    return localStorage.getItem(OWNER_DEVICE_KEY) === "1";
  } catch {
    return false;
  }
}
