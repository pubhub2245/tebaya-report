/**
 * 経理パッケージの紹介ページ（/keiri/case）に載せる数字と文言。
 *
 * ★ここに書く数字は「本番データで検算して確認したもの」だけ。推測や見込みの数字は置かない。
 *   数字を更新したら checkedOn（確認した日）も必ず更新する。
 * ★画面（app/keiri/case/page.tsx）はここを読んで並べるだけ。画面の中に数字を直書きしない。
 *
 * 出典：2026-09-17 司令室A が本番データ（Supabase・keiri_reports）で検算した8月の実績
 *       （司令室『経理パッケージ 事例1号：屋台「手羽屋」』）。
 *       docs/keiri.md 5章末尾の「2026年8月の数字」は 9/2 時点のもので、
 *       その後の日報の追加・修正を含む 9/17 時点の値をここでは使う。
 */

/**
 * 事例1号：手羽屋の月の実績（単位：万円。小数1桁まで）
 *
 * ★ここは「倉庫が読めなかったとき」だけ出す控えの数字。ふだんは日報から自動で出す
 *   （lib/keiri/caseStats.ts）。どちらも **手羽屋の日報だけ** を数える。
 *
 * ■ 2026-09-19 訂正（司令室 kp73）
 *   9/17 に入れた「34回・75.9万円」は、同じアプリに入っている **もも屋の日報まで足した**
 *   数字だった。このページは「屋台『手羽屋』の実績」と名乗っているので、別の屋号の売上を
 *   足したままにはできない（送り先は同じ催事に出ている同業なので、出店回数の水増しは
 *   すぐ分かる）。手羽屋だけで数え直した 9/19 の実測値に差し替えた。
 *   出典：2026-09-19 司令室A が本番データを屋号で分けて数え直した値（730,300円・26出店）。
 *
 *   利益は、手羽屋だけで数え直した値をまだ確かめられていないので **null**（分からない）に
 *   してある。**推測で数字を作らない。**画面はこの1枚だけを出さずに詰める。
 *   日報が読めていれば自動の数字が出るので、ふだんこの控えは表に出ない。
 */
export const CASE_TEBAYA = {
  /** 店の呼び名（本人の許可あり：自社事業） */
  shopName: "屋台「手羽屋」（宮崎・骨なし手羽先の催事販売）",
  /** どの月の数字か */
  month: "2026年8月",
  /** 数字を本番データで確認した日 */
  checkedOn: "2026-09-19",
  /** 出店した回数（日報の件数）。手羽屋のぶんだけ */
  days: 26,
  /** 売上高（万円）。手羽屋のぶんだけ（730,300円） */
  salesMan: 73.0,
  /** 今月の利益（万円）。手羽屋だけの値を確かめられていないので null（推測で書かない） */
  profitMan: null,
} as const;

/**
 * 無人販売の価格。変えるときは司令室の【要確認】を通す。
 *
 * ・2026-09-17 じゅん確定：月額 3,000円（税込）
 * ・2026-09-18 じゅん決定：月額 15,000円（税込）に改定（司令室 kp40）。
 *   理由＝3,000円だと月10万円に33軒必要で、営業しない前提では到達しない。
 *   15,000円なら7軒。記帳代行の相場（月1〜3万円）の下側で、会計ソフトより上という位置づけ。
 *   あわせて中身も「道具を貸す」から「毎月の締めまでやる」に広げた（lib/keiri/offer.ts）。
 *   改定した時点の申込は0件なので、既存のお客さんへの影響は無い。
 */
export const KEIRI_PRICE = {
  monthlyYenTaxIncluded: 15000,
  perUnit: "1店舗",
  /** 初期費用（円）。0＝かからない（2026-09-17 じゅん確定の「初期費用なし」を数で持つ） */
  setupFeeYen: 0,
  freeTrial: false,
  cancelAnytime: true,
} as const;

/** 万円の表示。1桁小数まで。整数なら小数を出さない（75.9→「75.9万円」、6→「6万円」） */
export function manYen(man: number): string {
  const rounded = Math.round(man * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}万円`;
}

/** 価格の1行表示（「月額15,000円（税込）／1店舗」） */
export function priceLabel(): string {
  const yen = KEIRI_PRICE.monthlyYenTaxIncluded.toLocaleString("ja-JP");
  return `月額${yen}円（税込）／${KEIRI_PRICE.perUnit}`;
}

/**
 * ページの一番上に出す「30秒で分かる1行」。
 * LINE で URL を開いた店主が、最初の画面で「いくら・やめられるか」を確かめられるようにする。
 * 新しい約束は足さない。下の価格の枠に元から書いてある言葉を、そのまま1行に並べ直すだけ。
 */
export function priceSummaryLine(): string {
  const parts = [priceLabel()];
  if (KEIRI_PRICE.setupFeeYen === 0) parts.push("初期費用なし");
  if (KEIRI_PRICE.cancelAnytime) parts.push("いつでも自分の画面から解約");
  return parts.join("・");
}

/**
 * 申し込みボタンの飛び先（Stripe の支払いページ）を入れる環境変数の名前。
 *
 * ★名前に金額を入れてあるのが肝。
 *   価格を変えたとき、前の金額の支払いリンクが Vercel に残っていても
 *   **自動で使われなくなる**（名前が変わるので見つからない＝「準備中」と出る）。
 *   ページに「月額15,000円」と書いてあるのに押すと3,000円で決済される、という
 *   一番まずい食い違いを作らないため。表示と請求が合わない恐れがあるなら、
 *   ボタンを出さずに「準備中」と正直に出すほうがよい。
 *   例：月15,000円 → NEXT_PUBLIC_KEIRI_PAYMENT_LINK_15000
 *
 * ★この関数を呼ぶのはサーバー側だけ（紹介ページは静的生成・診断はAPI）。
 *   ブラウザ側で読む作りにすると、名前を組み立てる形が使えなくなる。
 */
export function paymentLinkEnvName(): string {
  return `NEXT_PUBLIC_KEIRI_PAYMENT_LINK_${KEIRI_PRICE.monthlyYenTaxIncluded}`;
}

/**
 * 申し込みボタンの飛び先（Stripe の支払いページ）。
 * Vercel の環境変数（名前は paymentLinkEnvName()）に入れる。
 * 未設定のときは null（画面は「準備中」と出し、偽のリンクを出さない）。
 */
export function paymentLinkUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env[paymentLinkEnvName()];
  if (!v || !v.trim()) return null;
  const url = v.trim();
  return url.startsWith("https://") ? url : null;
}
