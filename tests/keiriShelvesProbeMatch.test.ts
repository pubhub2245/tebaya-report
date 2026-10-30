/**
 * 貼り紙を1回 貼ったら、本当に「13 ぜんぶ ある」に変わるかを、名前の突き合わせで縛るテスト。
 *
 * ■ なぜ要るか（2026-10-30・B／f1-4・f3-4・f5-4）
 *   仕上げの残り3つは、じゅんが貼り紙（/keiri/sql）を1回 貼る2分を待っている。
 *   ところが「貼ったあと 13 ぜんぶが『ある』に変わるか」は、どこでも機械的に
 *   確かめていなかった。確かめているのは2つに分かれていて、
 *     ・貼り紙の中身（SQL が最後まで通るか）… tools/check-shelves-sql.sh（空の倉庫で下見）
 *     ・コード側が何を見に行くか          … lib/keiri/shelvesProbe.ts
 *   この2つの**名前が1文字でもずれると**、貼り紙は通るのに画面は「0／13」のまま出る。
 *   気づくのは じゅんが2分 使ったあとで、しかも「貼り紙が失敗した」と誤解する。
 *   ここで、見に行く名前が貼り紙の中に必ずあることを固定する。
 *
 * ■ 見ているのは3つ（ぜんぶ名前だけ。倉庫にはつながない・1行も書き込まない）
 *   ① コード側が直に読む棚と欄（probeShelf("棚","欄")）が、貼り紙の中にある
 *   ② コード側が呼ぶ倉庫の窓口（RPC）が、貼り紙の中で作られている
 *   ③ その窓口が **anon（ブラウザに配られている公開の鍵）に渡してある**
 *      … 窓口は公開の鍵で呼んで確かめる（lib/keiri/shelfScope.ts の askWindow）ので、
 *        渡し忘れると、貼ったあとも「まだ締めていない」と出続ける
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PENDING_SHELVES } from "../lib/keiri/shelfScope";
import { TENANT_READ_WINDOW } from "../lib/keiri/tenantReadGuard";

const SHEET = "supabase/migrations/keiri_shelves_20261005.sql";
const sql = readFileSync(SHEET, "utf8");
const probeSrc = readFileSync("lib/keiri/shelvesProbe.ts", "utf8");

/**
 * コード側が直に読む「棚と欄」を、読む所の書き方から拾う。
 * ★わざと書き写さない：ここに一覧を書くと、片方だけ直したときに気づけない。
 */
function directProbeTargets(): { table: string; column: string }[] {
  const found: { table: string; column: string }[] = [];
  const re = /probeShelf\(\s*"([A-Za-z0-9_]+)"\s*,\s*"([A-Za-z0-9_]+)"\s*\)/g;
  for (const m of probeSrc.matchAll(re)) found.push({ table: m[1]!, column: m[2]! });
  return found;
}

test("コード側が直に読む棚と欄は、6つとも貼り紙の中にある", () => {
  const targets = directProbeTargets();
  // ①②③④⑤⑨ の6つ。減っていたら読む所の書き方が変わったということなので、先に気づく
  assert.equal(targets.length, 6, `読む所が6つではありません（${targets.length}）`);
  for (const t of targets) {
    assert.ok(
      sql.includes(t.table),
      `貼り紙に「${t.table}」がありません（貼っても「まだ無い」と出続けます）`,
    );
    assert.ok(
      sql.includes(t.column),
      `貼り紙に「${t.table}」の欄「${t.column}」がありません（貼っても「まだ無い」と出続けます）`,
    );
  }
});

test("コード側が呼ぶ倉庫の窓口は、ぜんぶ貼り紙の中で作られている", () => {
  const windows = [TENANT_READ_WINDOW, ...PENDING_SHELVES.map((p) => p.window)];
  assert.ok(windows.length >= 10, `窓口が10未満です（${windows.length}）`);
  for (const w of new Set(windows)) {
    assert.ok(
      sql.includes(`create or replace function public.${w}(`),
      `貼り紙が窓口「${w}」を作っていません（締まったと言えないままになります）`,
    );
  }
});

test("窓口はぜんぶ、公開の鍵（anon）で呼べるように渡してある", () => {
  const windows = [TENANT_READ_WINDOW, ...PENDING_SHELVES.map((p) => p.window)];
  for (const w of new Set(windows)) {
    const at = sql.indexOf(`grant execute on function public.${w}(`);
    assert.ok(at > 0, `貼り紙に窓口「${w}」を渡す所がありません`);
    // 渡す相手は同じ文の中にある（改行をはさむので、少し先まで見る）
    const line = sql.slice(at, at + 240);
    assert.ok(
      /to[\s\S]*\banon\b/.test(line),
      `窓口「${w}」が公開の鍵（anon）に渡されていません（貼っても「まだ締めていない」と出続けます）`,
    );
  }
});
