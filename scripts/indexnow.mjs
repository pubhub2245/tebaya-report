/**
 * 更新したURLを検索エンジンに知らせる（IndexNow）。
 *
 * ★送るのは **経理パッケージの外向きページだけ**（ページ一覧＝sitemap に載っているものだけ）。
 *   手羽屋の業務画面（日報・シフト・レジ・管理者）は sitemap に載っていないので、
 *   この処理からも絶対に出て行かない。
 *
 * 使い方
 *   npm run indexnow -- --dry-run   … 送らずに、送る予定のURLだけ数えて見せる
 *   npm run indexnow                … ページ一覧のURLを知らせる
 *
 * ビルドのあと（postbuild）に自動で走る。ただし **Vercel の本番ビルドのときだけ**
 * （`VERCEL_ENV=production`）。プレビューや手元のビルドでは何も送らない。
 *
 * 大事な約束：**この処理でビルドを失敗させない。** 送信に失敗しても記録を出して終了コード0で終わる。
 * 検索エンジンへの通知が遅れることより、サイトが出ないことのほうが困るため。
 * 日報・シフト・LINE の仕組みには一切さわらない。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENDPOINT = "https://api.indexnow.org/indexnow";
/** 1回で送る上限。IndexNow の仕様は1万件だが、無駄に大きく送らない */
const MAX = 2000;

/**
 * 鍵は public/<鍵>.txt が唯一の正。
 * 鍵は秘密ではない（公開前提の仕組み）。ファイル名と中身が同じでなければ送信は弾かれるので、
 * ここで両方そろっているかを確かめる。
 */
function findKey() {
  const dir = "public";
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir)) {
    const m = name.match(/^([0-9a-zA-Z-]{8,128})\.txt$/);
    if (!m) continue;
    const body = readFileSync(join(dir, name), "utf8").trim();
    if (body === m[1]) return m[1];
  }
  return null;
}

/** ビルドで出来た sitemap.xml から <loc> を読む */
function sitemapUrls() {
  const candidates = [".next/server/app/sitemap.xml.body", ".next/server/app/sitemap.xml"];
  const path = candidates.find((p) => existsSync(p));
  if (!path) return [];
  const xml = readFileSync(path, "utf8");
  const urls = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) urls.push(m[1]);
  return [...new Set(urls)];
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
/** postbuild から呼ばれたときは、本番ビルド以外では何もしない */
const fromBuild = argv.includes("--from-build");

async function main() {
  if (fromBuild && process.env.VERCEL_ENV !== "production") {
    console.log("[indexnow] 本番ビルドではないので何も送りません");
    return;
  }

  const key = findKey();
  if (!key) {
    console.log("[indexnow] public/<鍵>.txt が見つからない（か中身が鍵と違う）ので送りません");
    return;
  }

  const urls = sitemapUrls().slice(0, MAX);
  if (urls.length === 0) {
    console.log("[indexnow] ページ一覧（sitemap）が読めなかったので送りません");
    return;
  }

  const site = new URL(urls[0]);
  const body = {
    host: site.host,
    key,
    keyLocation: `${site.origin}/${key}.txt`,
    urlList: urls,
  };

  if (dryRun) {
    console.log(`[indexnow] 送る予定 ${urls.length} 件（--dry-run なので送っていません）`);
    console.log(`           鍵の置き場 ${body.keyLocation}`);
    for (const u of urls) console.log("  ", u);
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  console.log(`[indexnow] ${urls.length} 件を送りました（返事 ${res.status}）`);
}

main().catch((err) => {
  // 失敗してもビルドは止めない
  console.log(`[indexnow] 送れませんでした：${err instanceof Error ? err.message : String(err)}`);
});
