/**
 * 「合否を測る窓口は、ためた答えで答えない」を見張る（f1-4・f1-2・f3-3・f3-4）。
 *
 * ■ なぜ要るのか（2026-11-10・B）
 *   経理の月の数字を読む所（lib/keiri/loadMonthServer.ts の loadKeiriMonthServer）には、
 *   「ためた答えを使わず毎回 倉庫へ取りに行く」印（fresh）があります。
 *   ところが **つなぐもの（db）を一緒に渡すと、そちらが使われて fresh は効きません**。
 *
 *   そのせいで、2026-11-10 の朝に11月の日報が4枚 入ったあとも
 *     ・/api/keiri/cashcount（金庫の合否・f1-4）… 「日報は10月31日まで・10日 空き」
 *     ・/api/keiri/readpaths（読み方が同じか・f1-2／f3-4）… fresh と書いてあるのに ためた答え
 *   と答え続けていました。同じ読み方をする /api/keiri/selfcheck は 4枚 見えていました。
 *   **金庫の合否を古い日報で答えると、じゅんが金庫を数える1分がそのまま無駄になります。**
 *
 *   「ためた答えで古い合否が出る」は 11/06・11/09・11/10 と**3回**起きています。
 *   そのたびに最優先の仕事が1つ立って、手が止まりました。だから試験で止めます。
 *
 * ■ 決まり
 *   経理の月の数字を読む窓口（app/api/keiri 配下で loadKeiriMonthServer を呼ぶもの）は、
 *   **つなぐものを `serverClient({ fresh: true })` で作る**。
 *   `serverClient()`（印なし）で作ったものを渡してはいけない。
 *
 * ★この試験は倉庫に1回も聞きません（ファイルの中身を読むだけ）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "app/api/keiri";

/** app/api/keiri の下にある route.ts をぜんぶ集める */
function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...routeFiles(path));
      continue;
    }
    if (name === "route.ts") out.push(path);
  }
  return out;
}

const LOADER = "loadKeiriMonthServer({";

test("経理の月の数字を読む窓口は、ためた答えを使わない", () => {
  const files = routeFiles(ROOT).filter((f) =>
    readFileSync(f, "utf-8").includes(LOADER),
  );
  assert.ok(files.length >= 5, `窓口が見つかりません（${files.length}本）`);

  for (const f of files) {
    const src = readFileSync(f, "utf-8");
    assert.ok(
      !/serverClient\(\s*\)/.test(src),
      `${f} が印なしの serverClient() でつないでいます。` +
        "合否を測る窓口は serverClient({ fresh: true }) でつないでください" +
        "（db を渡すと loadKeiriMonthServer の fresh は効きません）。",
    );
    assert.ok(
      src.includes("serverClient({ fresh: true })") || !src.includes("serverClient("),
      `${f} に fresh の印がありません`,
    );
  }
});

test("金庫の合否・読み方くらべ・お店の月の数字の3本は、名指しで fresh が付いている", () => {
  // ★ここは名指しで固定する（上の網の目をすり抜けても落ちるように）
  for (const f of [
    "app/api/keiri/cashcount/route.ts",
    "app/api/keiri/readpaths/route.ts",
    "app/api/keiri/month/route.ts",
  ]) {
    const src = readFileSync(f, "utf-8");
    assert.ok(src.includes(LOADER), `${f} が月の数字を読まなくなっています`);
    assert.ok(
      src.includes("serverClient({ fresh: true })"),
      `${f} の fresh が外れています`,
    );
  }
});

test("fresh の説明に『db を渡すと効かない』と書いてある", () => {
  // ★次に同じ取り違えをしないための注意書き。消したら落ちる
  const src = readFileSync("lib/keiri/loadMonthServer.ts", "utf-8");
  assert.ok(
    src.includes("を渡したときは、そちらが使われます"),
    "loadMonthServer.ts の fresh の説明に『db を渡すと効かない』の注意書きがありません",
  );
});
