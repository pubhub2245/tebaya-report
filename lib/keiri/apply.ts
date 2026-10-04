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

import { cleanCampaign } from "@/lib/siteVisits";

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
  /** 合言葉（?from=card など）。長い貼り付けをそのまま残さない */
  campaign: 40,
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
  /**
   * どこから来た申し込みか（?from=card など・2026-09-28・kp194）。
   * 紙の札やその場で見せた1枚から申し込まれたのかを、あとから見分けるため。
   * 画面（ブラウザ）が住所から拾って送る。入っていなくても申し込みは通る。
   */
  campaign?: unknown;
};

/** 確かめ終わった申し込み1件 */
export type KeiriApplication = {
  shop_name: string;
  /**
   * 任意（2026-10-01・kp207）。入れていなければ空の文字。
   * ★null にしない。倉庫の列が「空でもいいが、無いのは許さない」形
   *   （contact_name text not null）なので、null を入れると控えが残らない。
   */
  contact_name: string;
  /** 任意（同上）。入れていなければ空の文字（理由も同上）。 */
  email: string;
  /** 必ず入れていただく（2026-10-01・kp207）。折り返しの唯一の道。 */
  phone: string;
  /** 任意。入れていなければ null */
  note: string | null;
  /**
   * どこから来たか（?from=card など）。無ければ null。
   * ★倉庫の「どこから来たか」の欄（source）は 'form' のままにする。
   *   あの欄は入れてよい中身が 'form' だけに絞られており（RLS）、
   *   ここを変えると**申し込みそのものが断られる**。
   *   合言葉は下の applicationNote() で「ひとこと」に1行として残す。
   */
  campaign: string | null;
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
/**
 * 電話番号らしいか（2026-10-01・kp207）。
 * ★厳密な判定はしない。説明会の立ち話で打つ番号を弾くほうが損なので、
 *   「数字が9個以上あるか」だけを見る（ハイフンあり・なし・+81 のどれでも通る）。
 */
export function looksLikePhone(v: string): boolean {
  return (v.match(/[0-9]/g) ?? []).length >= 9;
}

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
 * 合言葉（?from=card など）を、記録に残せる形に整える。
 *
 * ★掃除のしかたは訪問の数え方（lib/siteVisits.ts）と**同じ1本**を使う。
 *   2026-09-27 に「card`」（末尾に余分な記号）で記録された件があり、
 *   別々に掃除すると訪問と申し込みで数え方がずれる（kp195）。
 */
export function keiriApplyCampaign(raw: unknown): string | null {
  const c = cleanCampaign(raw);
  if (!c) return null;
  return c.slice(0, KEIRI_APPLY_LIMITS.campaign);
}

/** 「ひとこと」の末尾に足す、どこから来たかの1行（合言葉が無ければ空） */
export function campaignNoteMark(campaign: string | null): string {
  return campaign ? `［どこから：${campaign}］` : "";
}

/** 合言葉を「ひとこと」に1行として足した文（何も無ければそのまま） */
export function applicationNote(
  note: string,
  campaign: string | null,
): string | null {
  const joined = [note, campaignNoteMark(campaign)]
    .filter((x) => x !== "")
    .join("\n");
  return joined === "" ? null : joined;
}

/** 「ひとこと」から、こちらで足した1行を外して、店主が書いた文だけに戻す */
export function enteredNote(
  note: string | null,
  campaign: string | null,
): string | null {
  const mark = campaignNoteMark(campaign);
  if (!note || mark === "") return note;
  const rest = note
    .split("\n")
    .filter((line) => line !== mark)
    .join("\n")
    .trim();
  return rest === "" ? null : rest;
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
  const campaign = keiriApplyCampaign(input.campaign);

  const errors: string[] = [];
  if (shopName === "") errors.push("お店の名前を入れてください。");
  else if (shopName.length > KEIRI_APPLY_LIMITS.shopName)
    errors.push(`お店の名前は${KEIRI_APPLY_LIMITS.shopName}文字までです。`);

  // ★2026-10-01（kp207）：必ず入れていただくのは「お店の名前」と「電話番号」の2つだけ。
  //   出店説明会の立ち話でスマホに4つ打つのは重すぎるため、
  //   こちらから折り返せる最小限（店名＋つながる番号）に絞った。
  //   お名前とメールアドレスは、空でも申し込みが通る。
  if (phone === "") errors.push("電話番号を入れてください。");
  else if (phone.length > KEIRI_APPLY_LIMITS.phone)
    errors.push(`電話番号は${KEIRI_APPLY_LIMITS.phone}文字までです。`);
  else if (!looksLikePhone(phone))
    errors.push("電話番号の形が違うようです。もう一度ご確認ください。");

  if (contactName.length > KEIRI_APPLY_LIMITS.contactName)
    errors.push(`お名前は${KEIRI_APPLY_LIMITS.contactName}文字までです。`);

  if (email !== "") {
    if (email.length > KEIRI_APPLY_LIMITS.email)
      errors.push(`メールアドレスは${KEIRI_APPLY_LIMITS.email}文字までです。`);
    else if (!looksLikeEmail(email))
      errors.push("メールアドレスの形が違うようです。もう一度ご確認ください。");
  }

  if (note.length > KEIRI_APPLY_LIMITS.note)
    errors.push(`ひとことは${KEIRI_APPLY_LIMITS.note}文字までです。`);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    spam: false,
    value: {
      shop_name: shopName,
      // ★空の文字のまま渡す（null にしない）。倉庫の列が not null なので、
      //   null を入れると控えが1行も残らない。
      contact_name: contactName,
      email,
      phone,
      // 合言葉は「ひとこと」に1行として残す（倉庫の source は 'form' のまま）
      note: applicationNote(note, campaign),
      campaign,
    },
  };
}

/**
 * 試しの1通だと分かる1行（2026-10-04・kp228）。
 * ★スタッフのLINEグループに出るので、本物と取り違えられない言葉にする。
 */
export const APPLY_TEST_NOTICE =
  "⚠ これはテストです（本物のお申し込みではありません。何もしなくて大丈夫です）";

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
  /**
   * 試しの1通か（2026-10-04・kp228）。
   * true のときは、本文のいちばん上に「これはテストです」を必ず入れる。
   * ★見た人が本物のお申し込みと取り違えないようにするため。文を省けないように、
   *   ここ（文を作る1か所）で付けます。
   */
  test?: boolean;
}): string {
  const { application: a, priceLabel, at = new Date(), test = false } = args;
  const when = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);

  const lines = [
    ...(test ? [APPLY_TEST_NOTICE, ""] : []),
    "【経理パッケージ お申し込みが1件入りました】",
    `受付：${when}`,
    "",
    `お店：${a.shop_name}`,
    `電話：${a.phone}`,
  ];
  // ★お名前とメールは任意（2026-10-01・kp207）。空の行を送らない。
  if (a.contact_name) lines.push(`お名前：${a.contact_name}`);
  if (a.email) lines.push(`メール：${a.email}`);
  if (a.campaign) lines.push(`どこから：${a.campaign}`);
  // ★ひとことには、こちらで足した「どこから」の1行が入っている。
  //   知らせでは上に1行で出しているので、ここでは店主が書いた文だけを出す。
  const written = enteredNote(a.note, a.campaign);
  if (written) lines.push("", `ひとこと：${written}`);
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
  /**
   * どの場面の下書きか（2026-09-19・kp69）。
   * "fallback"（既定）… 自動の受け付けができなかったとき。これを送らないと届かない。
   * "copy" … 受け付けはできたが、倉庫に控えが残らなかったとき。
   *           知らせは LINE で飛んでいるので届いてはいるが、
   *           あとから一覧で見返せる形が1つも無い状態。
   *           そのための「念のための控え」で、送らなくても申し込みは生きている。
   * "hurry" … 受け付けは済んでいて、そのあと本人が急いで連絡してくるとき
   *           （2026-09-20・お申し込み完了の画面の「お急ぎのときは」）。
   *           ★ここが一番あぶない。**すでに申し込んだ人**が、返事を待てずに催促する場面で、
   *             いちばん熱い相手が自分から連絡してくる。
   *             それまで素の宛先1つ（写しなし）だったので、
   *             司令室が毎時間見ている受信箱には1通も届かなかった。
   */
  kind?: "fallback" | "copy" | "hurry";
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

  const kind = args.kind ?? "fallback";
  const head =
    kind === "copy"
      ? "経理パッケージ お申し込みの控え"
      : kind === "hurry"
        ? "経理パッケージ お申し込みのお急ぎのご連絡"
        : "経理パッケージ お申し込み";
  const subject = shopName ? `${head}（${shopName}）` : head;

  const lines = [
    kind === "copy"
      ? "経理パッケージに申し込みました（控えです）。"
      : kind === "hurry"
        ? "経理パッケージに申し込んだ件で、お急ぎでご連絡します。"
        : "経理パッケージに申し込みます。",
    "",
    `お店：${shopName || "（未記入）"}`,
    `お名前：${contactName || "（未記入）"}`,
    `メール：${email || "（未記入）"}`,
  ];
  if (phone) lines.push(`電話：${phone}`);
  if (note) lines.push("", "ひとこと：", note);
  lines.push(
    "",
    kind === "copy"
      ? "（お申し込みフォームからの受け付けは済んでいます。控えとしてお送りしています）"
      : kind === "hurry"
        ? "（お申し込みフォームからの受け付けは済んでいます。急ぎのご連絡です）"
        : "（お申し込みフォームから送れなかったため、メールでお送りしています）",
  );

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

/**
 * 「メールでも受け付けています」の宛先を、下書き付きのリンクにする（2026-09-19・kp72）。
 *
 * ■ なぜ要るのか
 *   紹介ページ（/keiri/case）の申し込み枠には
 *   「メールでも受け付けています：jun@alpha-mj.co.jp」と出している。
 *   フォームに5つ打ち込むより、そのまま1行返すほうが早い店主は必ずいるので、
 *   **これは実際に使われる道**。ところがこの宛先は1か所しか無く、
 *   そこは司令室が読めない受信箱だった。
 *   ＝ここから来た最初の1件は、じゅんが自分で受信箱を見ないかぎり気づけない。
 *   kp63（届かなかったときの下書き）と kp69（控えの下書き）で同じ穴を塞いだのに、
 *   **いちばん人目に付く導線だけが素の mailto のまま残っていた。**
 *
 * ■ やること
 *   写し（CC）に手羽屋の Gmail（司令室が毎時間見ている）を足し、
 *   件名と、書き出しの雛形を入れておく。
 *   雛形があると、店主は空白を埋めるだけでよく、
 *   こちらも折り返すのに要る3つ（お店・お名前・連絡先）が最初から揃う。
 *
 * ★ 特定商取引法のページに出す連絡先は変えない（表示は法律の話・写しは受け取りの話）。
 * ★ ここから誰かにメールを送ることはしない。
 *   店主の画面に立ち上がる下書きの中身を用意するだけ。
 * ★ 写しを付けない環境（cc を無視するメールソフト）でも、
 *   いままでと同じく宛先1つの下書きが開くだけで、悪くなることはない。
 */
export function keiriContactMailto(args: {
  /** 送り先（KEIRI_COMPANY.email） */
  to: string;
  /** 写し（CC）。何も渡さなければ KEIRI_APPLY_COPY_TO。null を渡すと写しを付けない */
  cc?: string | null;
  /**
   * どの窓口から出す下書きか（2026-09-20）。
   * "contact"（既定）… 買う前の問い合わせ（紹介ページ・特商法のページ）
   * "support" … すでに使っているお店からの使い方の質問（困ったときのページ）。
   *   ★ここは「払ったあとの窓口」なので、届かないと商品の約束
   *     （月15,000円に含まれる「聞かれたことに答える窓口」）そのものが成り立たない。
   *     それまで素の宛先1つ（写しなし）だったので、
   *     司令室が毎時間見ている受信箱には1通も届かなかった。
   */
  kind?: "contact" | "support";
}): {
  subject: string;
  body: string;
  url: string;
  to: string;
  cc: string | null;
  recipients: string[];
} {
  const kind = args.kind ?? "contact";
  const subject =
    kind === "support" ? "経理パッケージ 使い方のご質問" : "経理パッケージのお問い合わせ";

  const body = [
    kind === "support"
      ? "経理パッケージの使い方で分からないところがあります。"
      : "経理パッケージについて聞きたいことがあります。",
    "",
    "お店：",
    "お名前：",
    "お電話（任意）：",
    "",
    kind === "support" ? "困っていること：" : "聞きたいこと：",
    "",
  ].join("\n");

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
