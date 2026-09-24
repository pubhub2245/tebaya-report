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

/**
 * すでに入っている（合言葉を前に入れて、そのタブで管理者のままになっている）ときにも
 * 印を付け直してよいか。
 *
 * ■ なぜ要るか（kp146）
 *   印を付けるのは「合言葉を入力した、その瞬間」だけでした。
 *   ところが じゅんの端末は、タブを開いたままなら合言葉を入れ直しません。
 *   その場合この印は永久に付かず、**帯は一度も出ません**。
 *   入っていること自体が「合言葉を入れた端末である」証拠なので、そのときも印を付けます。
 *
 * ■ ゆるくしていないこと
 *   ・手羽屋の合言葉で入っているときだけ true（申し込んだお店の合言葉では呼ばない）
 *   ・合言葉が未設定のときは false（未設定なら誰も管理者にしない＝今までどおり）
 */
export function shouldMarkOwnerDeviceOnRestore(input: {
  /** そのタブで手羽屋の管理者として入っているか */
  tebayaAdminSession: boolean;
  /** 管理者パスワードが設定されているか */
  passwordConfigured: boolean;
}): boolean {
  return input.passwordConfigured && input.tebayaAdminSession;
}

/** この端末に印が付いているか */
export function readOwnerDevice(): boolean {
  try {
    return localStorage.getItem(OWNER_DEVICE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 帯が「一度も出ない」を無くすための、1タップの印付けリンク（kp147）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   帯（kp145）は「じゅんの端末」にだけ出します。その印が付くのは
 *   **管理者ページで合言葉を入れたとき**だけです（kp146 で「入ったままのタブ」も足しました）。
 *   つまり じゅんが管理者ページを開かないかぎり、印は永久に付かず、
 *   **帯はホームにも管理者ページにも一度も出ません。**
 *   毎日開くのはホームと日報なので、このままだと帯は空振りしたまま判定の日を迎えます。
 *
 *   そこで「押すだけで、この端末に印が付く」リンクを1本だけ用意します。
 *   じゅんは1回押すだけ（約2秒）。そのあとはホームを開くたびに帯が出ます。
 *
 * ■ 安全のために守っていること
 *   ・印が付いても、出るのは帯だけ（お店の**種類**と送る文）。
 *     連絡先・値段・日報のデータは1つも出ません＝知らない人が押しても害がない
 *   ・**合言葉の判定は1文字も変えていません。** 管理者ページに入れるようにはなりません
 *   ・`?owner=0` で取り消せます（押し間違えても戻せる）
 *   ・リンクはスタッフには渡しません。渡らなければスタッフの画面は今までどおりです
 */
export const OWNER_MARK_PARAM = "owner";

/** リンクの中身から「印を付ける／外す／何もしない」を決める（画面に触らない素の判定） */
export function ownerMarkFromQuery(
  value: string | null | undefined,
): "mark" | "unmark" | null {
  if (value === null || value === undefined) return null;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return "mark";
  if (v === "0" || v === "false" || v === "no") return "unmark";
  return null;
}

/** この端末の印を外す（`?owner=0` と「もう出さない」用） */
export function clearOwnerDevice(): void {
  try {
    localStorage.removeItem(OWNER_DEVICE_KEY);
  } catch {}
}

/** じゅんに渡す1タップのリンク（ホームを開いて、その端末に印を付ける） */
export const OWNER_MARK_LINK = `${PUBLIC_SITE_URL}/?${OWNER_MARK_PARAM}=1`;
