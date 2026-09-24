/**
 * 経理パッケージの「リンクを貼ったときに出る絵」を作り直す道具。
 *
 * ■ いつ動かすか
 *   tools/ogp/card.html の言葉を直したときだけ。ふだんのビルドでは動かない。
 *   （出来上がった PNG を倉庫に置いてあるので、本番のビルドは絵を作らない＝失敗しない）
 *
 * ■ 動かし方
 *   node tools/ogp/make.mjs
 *   ヘッドレスの Chrome（Playwright が置いている物か、システムの Chrome）で
 *   card.html を 1200×630 で撮って public/keiri/ogp.png に保存する。
 *   外のサービスには一切つながない。お金もかからない。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const html = resolve(here, "card.html");
const out = resolve(root, "public", "keiri", "ogp.png");

const candidates = [
  process.env.CHROME_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].filter(Boolean);

const chrome = candidates.find((p) => existsSync(p));
if (!chrome) {
  console.error("Chrome が見つかりません。CHROME_PATH に場所を入れてください。");
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
execFileSync(
  chrome,
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1200,630",
    `--screenshot=${out}`,
    `file://${html}`,
  ],
  { stdio: "inherit" },
);
console.log("できました:", out);
