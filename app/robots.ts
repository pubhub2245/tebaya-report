import type { MetadataRoute } from "next";

import { KEIRI_PUBLIC_PAGES } from "@/app/keiri/components/nav";
import { PUBLIC_SITE_URL } from "@/lib/keiri/siteUrl";

/**
 * 検索エンジンに「どこを読んでよいか」を伝える。
 *
 * ★方針：**経理パッケージの外向きページだけを許し、それ以外は全部ことわる。**
 *   手羽屋の業務画面（日報・シフト・レジ・管理者・経理の中身）は、
 *   お店の中の数字が出る場所なので、検索結果に載る道理が無い。
 *   これまで robots.txt が無く、既定では全部読まれてよいことになっていた。
 * ★読みに来ないようにするだけで、鍵にはならない。鍵は今までどおり画面側の仕組み。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: KEIRI_PUBLIC_PAGES.map((p) => p.path),
        disallow: "/",
      },
    ],
    sitemap: `${PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
