/**
 * 外向きページ（経理パッケージ）の絶対URL。
 * Vercel の環境変数 NEXT_PUBLIC_SITE_URL があればそれ、無ければ今の本番URL。
 * 存在しないURLを検索エンジンに渡さないよう、必ず実在する既定値にしておく。
 */
export const PUBLIC_SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://tebaya-report.vercel.app"
).replace(/\/$/, "");
