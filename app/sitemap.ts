import type { MetadataRoute } from "next";

import { KEIRI_PUBLIC_PAGES } from "@/app/keiri/components/nav";
import { PUBLIC_SITE_URL } from "@/lib/keiri/siteUrl";

/**
 * 検索エンジンに知らせるページの一覧。
 *
 * ★ここに載せるのは **経理パッケージの外向きページだけ**。
 *   手羽屋の業務画面（日報・シフト・レジ・管理者）は載せない。載せる意味が無く、
 *   むしろ検索結果に出てしまうのは困るため（robots.ts でも読みに来ないようにしてある）。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return KEIRI_PUBLIC_PAGES.map((p) => ({
    url: `${PUBLIC_SITE_URL}${p.path}`,
    changeFrequency: "weekly",
    priority: p.path === "/keiri/case" ? 1 : 0.7,
  }));
}
