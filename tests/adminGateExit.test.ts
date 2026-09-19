/**
 * 管理者ログイン画面の「出口」を固定する（kp89）。
 *
 * ■ なぜ要るか
 *   /keiri は経理パッケージの入口でもあるので、**これから申し込むかもしれない店主**が開く。
 *   それまで出口は「← トップに戻る」（＝手羽屋の業務メニュー）1つだけで、
 *     ・ご案内やお試し版にたどり着けず、そこで終わっていた
 *     ・よその店の人を、手羽屋の内側の画面へ案内してしまっていた
 *   の2つが起きていた。
 *
 * ■ ここが壊れたら困ること（この2つを固定する）
 *   ① /keiri の出口に、ご案内（/keiri/case）とお試し版（/keiri/demo）があること
 *   ② **手羽屋専用の画面（/admin・/cash・/shifts など）は今までどおり**であること
 *      ＝ allowShops を付けているのは /keiri だけ、という状態を守る
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf-8");

test("経理の入口（allowShops）には、ご案内とお試し版の出口がある", () => {
  const gate = read("app/components/AdminGate.tsx");
  assert.ok(gate.includes("allowShops ?"), "出口を allowShops で切り替えていること");
  assert.ok(gate.includes('href="/keiri/case"'), "ご案内への出口があること");
  assert.ok(gate.includes('href="/keiri/demo"'), "お試し版への出口があること");
});

test("手羽屋専用の画面の出口は、今までどおり「← トップに戻る」", () => {
  const gate = read("app/components/AdminGate.tsx");
  assert.ok(gate.includes("← トップに戻る"), "手羽屋側の出口を消していないこと");
  assert.ok(gate.includes('href="/"'), "手羽屋側はトップへ戻ること");
});

/** app 配下の page.tsx / layout.tsx を全部集める */
function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(new URL(dir, root))) {
    const p = `${dir}/${name}`;
    if (statSync(new URL(p, root)).isDirectory()) pages(p, out);
    else if (name === "page.tsx" || name === "layout.tsx") out.push(p);
  }
  return out;
}

test("お店も入れる画面（allowShops）は /keiri だけ", () => {
  const found = pages("app").filter((p) => read(p).includes("allowShops"));
  assert.deepEqual(
    found,
    ["app/keiri/page.tsx"],
    "手羽屋の画面に allowShops が付くと、よその店の合言葉で手羽屋の数字が見えてしまう",
  );
});
