import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/**
 * IndexNow（更新をこちらから知らせる仕組み）の鍵ファイルだけは読ませる。
 * 「このサイトの持ち主が送っている」ことを確かめるために、検索エンジンが
 * `/<鍵>.txt` を取りに来る。上の Disallow: / に当たると取れず、送信が弾かれる。
 * 鍵の名前は public/<鍵>.txt が唯一の正なので、ここでは名前を書かずに探す。
 * 見つからなくてもビルドは止めない（何も許さないだけ）。
 */
function indexNowKeyPaths(): string[] {
  try {
    const dir = join(process.cwd(), "public");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => {
        const m = name.match(/^([0-9a-zA-Z-]{8,128})\.txt$/);
        if (!m) return false;
        return readFileSync(join(dir, name), "utf8").trim() === m[1];
      })
      .map((name) => `/${name}`);
  } catch {
    return [];
  }
}

/**
 * 検索エンジン（Google）の「このサイトはあなたのものですね」の確認ファイルも読ませる。
 * Google Search Console は `/google<コード>.html` を取りに来て、中身が
 * `google-site-verification: <ファイル名>` になっているかを見る。
 * 上の Disallow: / に当たると取りに来られず、確認が通らない。
 * ファイル名は public/ の中身が唯一の正なので、ここでは名前を書かずに探す。
 * 見つからなくてもビルドは止めない（何も許さないだけ）。
 */
function googleVerificationPaths(): string[] {
  try {
    const dir = join(process.cwd(), "public");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => {
        if (!/^google[0-9a-z]+\.html$/.test(name)) return false;
        return (
          readFileSync(join(dir, name), "utf8").trim() ===
          `google-site-verification: ${name}`
        );
      })
      .map((name) => `/${name}`);
  } catch {
    return [];
  }
}

/**
 * 検索エンジンに「必ず」読ませる、ページ一覧まわりの2つ。
 *
 * ★ここが今回の直し（2026-09-19）。
 *   ページ一覧（sitemap.xml）そのものが、下の「原則ぜんぶことわる」に当たっていた。
 *   ページ一覧は「どのページが在るか」を検索エンジンに渡す紙なので、
 *   これが読めないと、Search Console に出しても中身を見てもらえない。
 *   ＝売り場を16ページ許していても、その一覧だけ届かない状態だった。
 *   robots.txt 自身は仕様上いつでも読まれるが、書いておくほうが誤解が無い。
 */
const ALWAYS_ALLOWED = ["/sitemap.xml", "/robots.txt"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          ...ALWAYS_ALLOWED,
          ...KEIRI_PUBLIC_PAGES.map((p) => p.path),
          ...indexNowKeyPaths(),
          ...googleVerificationPaths(),
        ],
        disallow: "/",
      },
    ],
    sitemap: `${PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
