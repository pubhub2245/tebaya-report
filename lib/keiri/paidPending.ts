/**
 * 経理パッケージ：**支払いのリンクで先に払われたお店を、行き止まりにしない**（kp95）。
 *
 * ■ どういう場面か
 *   Stripe の支払い後の戻り先は `/keiri/welcome?session=…` です。
 *   ここは「初回設定」の画面で、ふつうは支払いの知らせ（Webhook）が
 *   先にお店の行を1つ作ってから開かれます。
 *   ところがいまは
 *     ・Stripe に知らせ先がまだ登録されていない（kp27②）
 *     ・登録されていても、サーバー側の合鍵が壊れていて棚に書けない（kp55）
 *   の2重で、**お店の行が作られません。**
 *   そのため画面は「このリンクは使えません。申し込み完了の画面から開き直してください」と出て、
 *   **お金を払った人がそこで終わっていました。**
 *
 * ■ ここで直すこと（倉庫の中だけで済む範囲）
 *   `?session=` で来たのに行が見つからなかったときだけ、
 *     ① 文面を「お手続きを確認しています。担当からすぐにご連絡します」に変える
 *     ② スタッフの LINE グループへ「先に払われた人がいます」と知らせる
 *     ③ 申し込みの控えに1行残す（source='paid_pending'）
 *   ①②は**いますぐ効きます**。③は控えの棚の決まりが
 *   `source='form'` だけを通す形なので、
 *   supabase/migrations/keiri_applications_paid_pending.sql を流すまでは静かに失敗します
 *   （失敗しても①②は通るので、行き止まりにはなりません）。
 *
 * ■ `?t=`（こちらが手で発行したリンク）で来たときは、今までどおりです
 *   あちらは「お店の行があるはず」のリンクなので、見つからないのは
 *   リンク違いです。文面を変えるとかえって分かりにくくなります。
 *
 * ■ ここには通信を書きません
 *   文字を組み立てるだけです（lib/keiri/apply.ts と同じ考え方）。
 *   おかげで本物の通信なしにテストで動きを確かめられます。
 *
 * ■ 手羽屋の機能には一切さわっていません
 *   日報・シフト・レジ・LINE の送り方・お金の計算（lib/money.ts）は変えていません。
 */

import { KEIRI_APPLY_COPY_TO, keiriApplyRecipients } from "@/lib/keiri/apply";

/** 画面に出す文面。お金を払った人が読むので、断定しない・待たせない言い方にする */
export const KEIRI_PAID_PENDING_MESSAGE =
  "お手続きを確認しています。担当からすぐにご連絡します。";

/** 控えに残すときの「どこから来たか」の印 */
export const KEIRI_PAID_PENDING_SOURCE = "paid_pending";

/**
 * 名前が分からない欄に入れる言葉。
 * ★ここに作り物の名前やメールアドレスを入れないこと（架空の連絡先を控えに残さないため）。
 */
export const KEIRI_PAID_PENDING_UNKNOWN = "（未確認）";

/** 長すぎる貼り付けをそのまま控えに入れない */
const LIMITS = { session: 200, shopName: 120 } as const;

function text(v: unknown): string {
  if (typeof v !== "string") return "";
  // 改行と全角の空白は落とす（1行の控えに入れるため）
  return v.replace(/[\r\n\t]+/g, " ").replace(/　/g, " ").trim();
}

function cut(v: string, max: number): string {
  return v.length > max ? v.slice(0, max) : v;
}

/**
 * この「行き止まりにしない道」に入るのは、どういうときか。
 *
 * ★`?t=` が付いているときは入らない（今までどおりの案内に落とす）。
 * ★`?session=` だけのときに入る。
 */
export function isPaidPendingArrival(args: { token?: unknown; session?: unknown }): boolean {
  return text(args.token) === "" && text(args.session) !== "";
}

/** 控えに残す1行（keiri_applications に入れる形） */
export function paidPendingApplicationRow(args: { session: unknown; shopName?: unknown }): {
  shop_name: string;
  contact_name: string;
  email: string;
  phone: null;
  note: string;
  source: string;
  status: string;
} {
  const session = cut(text(args.session), LIMITS.session);
  const shopName = cut(text(args.shopName), LIMITS.shopName);
  return {
    shop_name: shopName === "" ? KEIRI_PAID_PENDING_UNKNOWN : shopName,
    // お名前とメールは、この場面では分かりません。作り物を入れず「（未確認）」と正直に置く
    contact_name: KEIRI_PAID_PENDING_UNKNOWN,
    email: KEIRI_PAID_PENDING_UNKNOWN,
    phone: null,
    note: [
      "お支払いのリンクから先にお支払いが済んだ方が、初回設定の画面を開きました。",
      `お支払い画面の番号：${session}`,
      "この番号で Stripe の画面から、どなたがお支払いになったかを引けます。",
    ].join("\n"),
    source: KEIRI_PAID_PENDING_SOURCE,
    status: "new",
  };
}

/**
 * スタッフの LINE グループへ送る本文。
 *
 * ★「担当からすぐにご連絡します」と画面に出す以上、**人が気づく道**が要る。
 *   控えの棚は決まり待ちで入らないことがあるので、知らせはこちらが本命。
 */
export function paidPendingNotificationText(args: {
  session: unknown;
  shopName?: unknown;
  /** 受け取った時刻。省略すると「いま」 */
  at?: Date;
}): string {
  const session = cut(text(args.session), LIMITS.session);
  const shopName = cut(text(args.shopName), LIMITS.shopName);
  const when = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(args.at ?? new Date());

  return [
    "【経理パッケージ お支払いが先に済んだ方が初回設定を開きました】",
    `受付：${when}`,
    "",
    `お店（ご本人の入力）：${shopName === "" ? KEIRI_PAID_PENDING_UNKNOWN : shopName}`,
    `お支払い画面の番号：${session}`,
    "",
    "※ このお店の行がまだ無いため、初回設定はこの場では終わっていません。",
    "※ Stripe の画面でこの番号を引くと、どなたがお支払いになったか分かります。",
    "※ 折り返して、初回設定のリンクをお渡ししてください。",
  ].join("\n");
}

/**
 * 知らせも控えも通らなかったときに、ご本人が「そのままメールで送る」ための下書き。
 *
 * ★ここでは通信をしない。文字を組み立てるだけ。
 * ★送らなくても、お支払いそのものは Stripe に残っている（そのことも文面に書く）。
 */
export function paidPendingMailto(args: {
  /** 送り先（KEIRI_COMPANY.email） */
  to: string;
  /** 写し（CC）。何も渡さなければ KEIRI_APPLY_COPY_TO。null を渡すと写しを付けない */
  cc?: string | null;
  session: unknown;
  shopName?: unknown;
}): { subject: string; body: string; url: string; to: string; cc: string | null; recipients: string[] } {
  const session = cut(text(args.session), LIMITS.session);
  const shopName = cut(text(args.shopName), LIMITS.shopName);

  const subject = shopName
    ? `経理パッケージ お支払い後の初回設定について（${shopName}）`
    : "経理パッケージ お支払い後の初回設定について";

  const body = [
    "経理パッケージのお支払いを済ませたのですが、初回設定の画面で先に進めませんでした。",
    "",
    `お店：${shopName || "（未記入）"}`,
    `お支払い画面の番号：${session}`,
    "",
    "（初回設定の画面から、この下書きを開いています）",
  ].join("\n");

  const asked = args.cc === undefined ? KEIRI_APPLY_COPY_TO : args.cc;
  const copyTo = asked && asked.trim() !== "" && asked !== args.to ? asked : null;

  const query = [
    copyTo ? `cc=${encodeURIComponent(copyTo)}` : null,
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ]
    .filter((v): v is string => v !== null)
    .join("&");

  return {
    subject,
    body,
    url: `mailto:${args.to}?${query}`,
    to: args.to,
    cc: copyTo,
    recipients: keiriApplyRecipients(args.to, copyTo),
  };
}
