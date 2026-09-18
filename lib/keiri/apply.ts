/**
 * 経理パッケージの「お申し込み」を受け取る所（考える部分だけ）。
 *
 * ■ なぜ要るのか
 *   紹介ページ（/keiri/case）の申し込みボタンは、カード決済のリンクが
 *   設定されているときだけ出る作りになっている（lib/keiri/caseNumbers.ts）。
 *   設定が済むまでは「申し込み受付は準備中です」と出るので、
 *   せっかく紹介の URL を開いた店主がそこで行き止まりになる。
 *   カードの受付口が無くても「申し込みます」と言える道を1本だけ用意する。
 *
 * ■ ここには通信を書かない
 *   届ける所（LINE の知らせ・倉庫への保存）は呼ぶ側に置いてある。
 *   おかげで本物の通信なしにテストで動きを確かめられる
 *   （lib/keiri/tenants.ts・lib/line/customerWebhook.ts と同じ考え方）。
 *
 * ■ 手羽屋の機能には一切さわらない
 *   日報・シフト・レジ・LINE の送り方・お金の計算（lib/money.ts）は変えていない。
 */

/**
 * お申し込みの「メールでそのまま送る」下書きの、写し（CC）の宛先。
 *
 * ■ なぜ要るのか（2026-09-19・kp63）
 *   今月は LINE の知らせが止まっていて（今月ぶんの送信数を使い切り。毎月1日に戻る）、
 *   倉庫の控えも鍵が壊れていて残らない（kp55）。
 *   ＝ **いまの受け口は、この「メールの下書き」1本だけ**。
 *   ところがその宛先は特定商取引法の表記と同じ1つだけで、
 *   司令室が読める受信箱（手羽屋の Gmail）ではなかった。
 *   このままだと、申し込みが入っても司令室は気づけず「0件」と書き続ける
 *   （訪問 kp54・控え kp57 と同じ「数えられていないのに0に見える」形）。
 *
 * ★ 表に出す連絡先（特定商取引法のページ）は変えない。
 *   あちらは「法律で表示が要るもの」、こちらは「受け取りの控え」で別の話。
 * ★ ここから誰かにメールを送ることはしない。
 *   店主の画面に立ち上がる下書きの宛先欄を1つ増やすだけ。
 */
export const KEIRI_APPLY_COPY_TO = "tebaya1222@gmail.com";

/** 入れてもらう欄の長さの上限（長すぎる貼り付けをそのまま通さない） */
export const KEIRI_APPLY_LIMITS = {
  shopName: 80,
  contactName: 60,
  email: 160,
  phone: 40,
  note: 1000,
} as const;

/** 画面から送られてくる中身（何が入っているか分からない前提で受ける） */
export type KeiriApplyInput = {
  shopName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  note?: unknown;
  /** 人には見えない囮の欄。ここに何か入っていたら機械の書き込み */
  website?: unknown;
};

/** 確かめ終わった申し込み1件 */
export type KeiriApplication = {
  shop_name: string;
  contact_name: string;
  email: string;
  /** 任意。入れていなければ null */
  phone: string | null;
  /** 任意。入れていなければ null */
  note: string | null;
};

export type KeiriApplyResult =
  | { ok: true; spam: false; value: KeiriApplication }
  /** 囮の欄に書き込みがあった＝機械。画面には成功と同じ顔を見せ、誰にも知らせない */
  | { ok: true; spam: true }
  | { ok: false; errors: string[] };

function text(v: unknown): string {
  if (typeof v !== "string") return "";
  // 全角の空白も落とす。前後の空白だけの入力を「入っている」と数えないため
  return v.replace(/　/g, " ").trim();
}

/**
 * メールアドレスらしいか。
 * ★厳密な判定はしない（正しくても届かない住所はあるし、弾きすぎるほうが損）。
 *   明らかに住所でないもの（@が無い・空白が混じる・ドットが無い）だけを断る。
 */
function looksLikeEmail(v: string): boolean {
  if (/\s/.test(v)) return false;
  const parts = v.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length === 0 || domain.length < 3) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}

/**
 * 送られてきた中身を確かめて、申し込み1件に整える。
 * 足りない所は「何が足りないか」を日本語で返す（画面にそのまま出せる形）。
 */
export function normalizeKeiriApplication(input: KeiriApplyInput): KeiriApplyResult {
  // 囮の欄。人の画面では見えないので、埋まっているのは機械だけ
  if (text(input.website) !== "") return { ok: true, spam: true };

  const shopName = text(input.shopName);
  const contactName = text(input.contactName);
  const email = text(input.email);
  const phone = text(input.phone);
  const note = text(input.note);

  const errors: string[] = [];
  if (shopName === "") errors.push("お店の名前を入れてください。");
  else if (shopName.length > KEIRI_APPLY_LIMITS.shopName)
    errors.push(`お店の名前は${KEIRI_APPLY_LIMITS.shopName}文字までです。`);

  if (contactName === "") errors.push("お名前を入れてください。");
  else if (contactName.length > KEIRI_APPLY_LIMITS.contactName)
    errors.push(`お名前は${KEIRI_APPLY_LIMITS.contactName}文字までです。`);

  if (email === "") errors.push("メールアドレスを入れてください。");
  else if (email.length > KEIRI_APPLY_LIMITS.email)
    errors.push(`メールアドレスは${KEIRI_APPLY_LIMITS.email}文字までです。`);
  else if (!looksLikeEmail(email))
    errors.push("メールアドレスの形が違うようです。もう一度ご確認ください。");

  if (phone.length > KEIRI_APPLY_LIMITS.phone)
    errors.push(`電話番号は${KEIRI_APPLY_LIMITS.phone}文字までです。`);

  if (note.length > KEIRI_APPLY_LIMITS.note)
    errors.push(`ひとことは${KEIRI_APPLY_LIMITS.note}文字までです。`);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    spam: false,
    value: {
      shop_name: shopName,
      contact_name: contactName,
      email,
      phone: phone === "" ? null : phone,
      note: note === "" ? null : note,
    },
  };
}

/**
 * 申し込みが入ったことを知らせる文（スタッフの LINE グループへ送る本文）。
 *
 * ★じゅんがその場で折り返せるように、宛先（メール・電話）を本文に入れる。
 * ★金額は呼ぶ側から渡す（ここに書き写すと、値上げしたときに食い違う）。
 */
export function keiriApplyNotificationText(args: {
  application: KeiriApplication;
  /** 「月額15,000円（税込）／1店舗」。lib/keiri/caseNumbers.ts の priceLabel() を渡す */
  priceLabel: string;
  /** 受け取った時刻。省略すると「いま」 */
  at?: Date;
}): string {
  const { application: a, priceLabel, at = new Date() } = args;
  const when = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);

  const lines = [
    "【経理パッケージ お申し込みが1件入りました】",
    `受付：${when}`,
    "",
    `お店：${a.shop_name}`,
    `お名前：${a.contact_name}`,
    `メール：${a.email}`,
  ];
  if (a.phone) lines.push(`電話：${a.phone}`);
  if (a.note) lines.push("", `ひとこと：${a.note}`);
  lines.push(
    "",
    `価格：${priceLabel}`,
    "このあとのご案内・初期設定・お支払いのご請求はこちらで用意します。",
  );
  return lines.join("\n");
}

/**
 * 届けられなかったときに、店主が「そのままメールで送る」ための下書きを作る。
 *
 * ■ なぜ要るのか（2026-09-19・kp60）
 *   申し込みの知らせ（LINE）と控え（倉庫）が両方だめなとき、
 *   フォームは「受け付けました」と言えない。けれど
 *   「いま受け付けができません」で終わらせると、**せっかくの1件がそこで消える**。
 *   入れてもらった中身をそのまま入れたメールの下書きを開くボタンにすれば、
 *   店主は1回押すだけで、こちらに届く。
 *
 * ★ここでは通信をしない。文字を組み立てるだけ。
 * ★入力の中身は捨てない。打ち直しをお願いしないため。
 */
export function keiriApplyMailto(args: {
  /** 送り先（KEIRI_COMPANY.email） */
  to: string;
  /** 写し（CC）の宛先。何も渡さなければ KEIRI_APPLY_COPY_TO。null を渡すと写しを付けない */
  cc?: string | null;
  shopName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  note?: unknown;
}): {
  subject: string;
  body: string;
  url: string;
  /** 宛先（To） */
  to: string;
  /** 写し（CC）。付けないときは null */
  cc: string | null;
  /** その下書きが届く先の一覧（重複なし） */
  recipients: string[];
} {
  const shopName = text(args.shopName);
  const contactName = text(args.contactName);
  const email = text(args.email);
  const phone = text(args.phone);
  const note = text(args.note);

  const subject = shopName
    ? `経理パッケージ お申し込み（${shopName}）`
    : "経理パッケージ お申し込み";

  const lines = [
    "経理パッケージに申し込みます。",
    "",
    `お店：${shopName || "（未記入）"}`,
    `お名前：${contactName || "（未記入）"}`,
    `メール：${email || "（未記入）"}`,
  ];
  if (phone) lines.push(`電話：${phone}`);
  if (note) lines.push("", "ひとこと：", note);
  lines.push("", "（お申し込みフォームから送れなかったため、メールでお送りしています）");

  const body = lines.join("\n");

  // 写し（CC）。同じ宛先を二重に書かない
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

/**
 * その下書きが届く先の一覧（重複なし）。
 * 診断（/api/keiri/diagnose）で「宛先が何か所あるか」を出すのに使う。
 * ＝次に誰が見ても、受け口が1か所しかない状態に1回で気づける。
 */
export function keiriApplyRecipients(to: string, cc: string | null): string[] {
  const list = [to, cc].filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  return Array.from(new Set(list));
}
