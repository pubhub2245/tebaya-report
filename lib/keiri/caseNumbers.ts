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

/** 事例1号：手羽屋の月の実績（単位：万円。小数1桁まで） */
export const CASE_TEBAYA = {
  /** 店の呼び名（本人の許可あり：自社事業） */
  shopName: "屋台「手羽屋」（宮崎・骨なし手羽先の催事販売）",
  /** どの月の数字か */
  month: "2026年8月",
  /** 数字を本番データで確認した日 */
  checkedOn: "2026-09-17",
  /** 出店した回数（日報の件数） */
  days: 34,
  /** 売上高（万円） */
  salesMan: 75.9,
  /** 今月の利益（万円）。発生した経費（給与・外注費・家賃を含む）を引いたあと */
  profitMan: 6.5,
} as const;

/** 無人販売の価格（2026-09-17 じゅん確定）。変えるときは司令室の【要確認】を通す */
export const KEIRI_PRICE = {
  monthlyYenTaxIncluded: 3000,
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

/** 価格の1行表示（「月額3,000円（税込）／1店舗」） */
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
 * 申し込みボタンの飛び先（Stripe の支払いページ）。
 * Vercel の環境変数 NEXT_PUBLIC_KEIRI_PAYMENT_LINK に入れる。
 * 未設定のときは null（画面は「準備中」と出し、偽のリンクを出さない）。
 */
export function paymentLinkUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env.NEXT_PUBLIC_KEIRI_PAYMENT_LINK;
  if (!v || !v.trim()) return null;
  const url = v.trim();
  return url.startsWith("https://") ? url : null;
}
