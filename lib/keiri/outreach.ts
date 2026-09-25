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

/**
 * 返事が来たときに、じゅんがその場で返す1文（kp90 の決めごとと同じ）。
 *
 * ■ なぜ1文だけにしてあるか（やさしい説明）
 *   返事が来た その場で じゅんが中身の説明を始めると、あとで こちらが出す
 *   ご案内と食い違います。約束を作るのは こちら側の役目なので、
 *   じゅんが返すのは「受け取りました」だけにしておきます。
 */
export const OUTREACH_REPLY_HOLD = "ありがとうございます、折り返します。";

/**
 * 返事が来たあとにやること。**2つだけ**にしてある。
 *
 * ★3つ目に「お支払いのご案内」を足さないこと。
 *   お支払いの道は、まだ こちら側でつながっていません（司令室 kp107）。
 *   いま手元にあるリンクは古い値段のもので、押されると
 *   いまの値段ではない額で毎月の引き落としが決まってしまいます。
 */
export const OUTREACH_REPLY_STEPS: readonly string[] = [
  `まず「${OUTREACH_REPLY_HOLD}」とだけ返してください。`,
  "返事の文を、そのままチャットに貼ってください。中身のご説明・初回の設定・ご請求は、こちらで用意します。",
] as const;

/**
 * 返事が来たときに、やってはいけないこと（1つだけ）。
 * 金額は書かない（この1枚は値段を出さない決まり。tests/keiriSendPage.test.ts で固定）。
 */
export const OUTREACH_REPLY_WARNING =
  "ご自分でお支払いのリンクを貼らないでください。いま手元にあるリンクは古い値段のもので、押されるとその額で毎月の引き落としが決まってしまいます。";

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
 * 「今日の1軒」＝まだ送っていない中の、いちばん上の1軒（kp154）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   これまでの帯は、送り先8軒を一度に並べていました。押す前に
 *   「どこにしようか」を8通りから選ぶことになり、そこで手が止まります。
 *   選ぶのをこちらで済ませて、**1軒だけ名指しする**形にします。
 *   じゅんがやるのは「この1軒に送る／別の1軒にする」の2択だけです。
 *   送った印が付けば、次の1軒がひとりでに出てきます。
 *
 * まだ1軒も残っていなければ null（そのときは帯そのものが出ません）。
 */
export function nextShop(sent: readonly string[]): OutreachShop | null {
  const rest = remainingShops(sent);
  // 帯のいちばん大きいボタンは［LINEで送る］なので、LINE で送れる1軒を先に名指しする。
  // 但し書きの付いた1軒（メールのみ）は、それしか残っていないときだけ出す。
  return rest.find((s) => !s.note) ?? rest[0] ?? null;
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

/**
 * LINE を開いて、送り先を選ぶだけにするリンク（kp151）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   いまの帯は［LINEの文をコピー］までしかできません。そのあと じゅんは
 *   ①LINEに持ちかえる ②相手を探す ③貼り付ける ④送る の4手が要ります。
 *   1軒10秒と書いていますが、実際には「アプリを持ちかえる」ところで止まります。
 *   LINE には「送る文を持ったまま、送り先を選ぶ画面を開く」入口があるので、
 *   そこへ1タップで飛ばします。じゅんがやるのは**相手を選んで送るだけ**になります。
 *
 * ■ 安全のために守っていること
 *   ・**文は勝手に送られません。** 開くのは送り先を選ぶ画面までで、送るのは人が押したとき
 *   ・宛名の空欄（◯◯さん）は入れない。選ぶ画面では宛名を直せないので、
 *     そのまま送ると「◯◯さん」のまま相手に届いてしまうため
 *   ・値段・連絡先は入れない（コピー用の文と同じ決まり）
 *   ・パソコンなど LINE が開けない所のために、［コピー］の道も残す
 */

/**
 * 送り先を選ぶ画面に渡す文。コピー用の文から、宛名の空欄だけを外したもの。
 * （選ぶ画面では文を直せないため、直さないと困る所を最初から入れない）
 */
export const OUTREACH_MESSAGE_SHARE = OUTREACH_MESSAGE.replace(
  /^◯◯さん、/,
  "",
);

/** LINE の「送り先を選ぶ」画面を、上の文を持って開くリンク */
export function lineShareUrl(message: string = OUTREACH_MESSAGE_SHARE): string {
  return `https://line.me/R/share?text=${encodeURIComponent(message)}`;
}

/** 帯の［LINEで送る］が開くリンク */
export const OUTREACH_LINE_SHARE_URL = lineShareUrl();

/**
 * どこからでも開ける「送る1枚」（kp162）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   送る材料は6日ぶん用意できているのに、1通も送られていない。
 *   いまの帯（kp145）は「じゅんの端末に印が付いていて、アプリのホームか
 *   管理者ページを開いたとき」にだけ出る。つまり
 *     ① 印を付ける1タップ（kp150）を押す → ② アプリを開く
 *   の2つが揃わないと、送る入口にたどり着けない。
 *   そこで **印もアプリも合言葉も要らない1枚**を用意して、その住所を1本だけ渡す。
 *   じゅんは思い出した所（メモ・スマホのホーム画面・パソコン）から開くだけでよい。
 *
 * ■ この1枚に出すもの・出さないもの
 *   ・出す … 送る文そのものと［LINEで送る］の1タップ
 *   ・出さない … 送り先8軒の一覧・連絡先・値段
 *     （合言葉の要らない住所なので、内側の話は1つも置かない）
 *   決まりは tests/keiriSendPage.test.ts で固定してある。
 */
export const OUTREACH_SEND_PATH = "/keiri/send";

/** じゅんに渡す1本の住所（どの端末でも、合言葉なしで開く） */
export const OUTREACH_SEND_LINK = `${PUBLIC_SITE_URL}${OUTREACH_SEND_PATH}`;

/**
 * 「送る1枚」（/keiri/send）で、何軒送ったかを控える（kp171）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   送る1枚は、印（kp150）もアプリも要らない道として作りました。
 *   ところが同じ1枚の最後に「どこに送ったかの控えは、ホームに出る帯
 *   （管理者の合言葉を入れた端末にだけ出ます）で付けられます」と書いてありました。
 *   帯が出るには印が要ります。＝ **この1枚が要らなくするために作った、その印を
 *   もう一度やってください、と案内していた**ことになります。
 *   印はまだ一度も付いていないので、じゅんがこの1枚から1軒送っても、
 *   控えはどこにも残りません。翌日「昨日どこに送ったか」を思い出せないまま開くことになり、
 *   同じお店にもう一度送ってしまう恐れもあります。
 *
 * ■ 控えるのは「何軒送ったか」だけ
 *   この住所は合言葉が要らない＝誰でも開けるので、**お店の呼び名は画面に出しません**
 *   （kp162 の決まり）。数だけを出します。
 *
 * ■ 控えの置き場は、帯とまったく同じ1か所
 *   別に持つと「帯では3軒、この1枚では5軒」のように食い違います。
 *   帯と同じ `OUTREACH_SENT_KEY` に、帯と同じ順番（nextShop）で印を足します。
 *   ＝ 記録は1つだけ。あとで印を付けて帯を出しても、続きから進みます。
 */

/** 送った印を1つ足す（次の1軒＝帯が名指しするのと同じ1軒）。全部送りおわっていれば何もしない */
export function markNextSent(sent: readonly string[]): string[] {
  const current = parseSent(sent.join(","));
  const next = nextShop(current);
  if (!next) return current;
  return parseSent([...current, next.id].join(","));
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
  const total = OUTREACH_SHOPS.length;
  return { done, total, remaining: total - done };
}
