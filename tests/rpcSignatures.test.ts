/**
 * 倉庫の「窓口」の名前と引数が、アプリの呼び方と合っているかの見張り
 *                                        （2026-11-02・B／f5-4・f3-4）
 *
 * ■ なぜ これが要るのか（やさしい説明）
 *   よその店が自分の数字を読む道は「窓口」（倉庫の中の小さな受付）です。
 *   窓口の中身は **じゅんが1回 貼る貼り紙**（supabase/migrations/keiri_shelves_20261005.sql）に
 *   書いてあり、呼ぶ側は **アプリのコード**に書いてあります。
 *   この2つは別のファイルなので、**片方だけ名前を直すと黙ってすれ違います。**
 *
 *   すれ違ったときに何が起きるか：倉庫の受付は「そんな窓口はありません」と答え、
 *   アプリはその答えを **「貼り紙がまだ流れていない」** という意味に取ります
 *   （lib/keiri/tenantAccess.ts の isMissingFunction）。
 *   ＝ **じゅんが2分で貼ったのに、画面は貼る前とまったく同じ答えを返し続けます。**
 *   エラーも出ないので、人では気づけません。気づくのは次の日です。
 *
 *   同じ形の見落とし（じゅんの2分の直前に止まる所が見つかる）を
 *   10/14・10/17・10/28・11/02 と4回やっています。だから機械で見張ります。
 *
 * ■ 何を見るか
 *   ① アプリが呼んでいる窓口の名前が、貼り紙（supabase/ の .sql）にあるか
 *   ② 渡している引数の名前が、貼り紙の引数にあるか（p_test_mark など）
 *   ③ 貼り紙が「必ず渡してください」と言っている引数を、渡し忘れていないか
 *   ④ 名前を直に書かずに変数で呼んでいる所（windowName・plan.window）は、
 *      その変数に入りうる名前（*_WINDOW の決まり）をぜんぶ ①②③で見る
 *
 * ■ この見張りは倉庫につながりません（読むのはこのリポジトリのファイルだけ）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

type Param = { name: string; hasDefault: boolean };

/** 貼り紙（supabase/ の .sql）に書いてある窓口の名前と引数を読み取る */
function readSqlFunctions(): Map<string, Param[]> {
  const out = new Map<string, Param[]>();
  for (const f of walk(path.join(ROOT, "supabase")).filter((f) => f.endsWith(".sql"))) {
    const sql = fs.readFileSync(f, "utf8");
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(([^)]*)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      const params = m[2]
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => ({
          name: (x.match(/^([a-z0-9_]+)\b/i) ?? [, x])[1] as string,
          hasDefault: /\bdefault\b/i.test(x),
        }));
      out.set(m[1], params);
    }
  }
  return out;
}

const tsFiles = [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "app"))].filter((f) =>
  /\.tsx?$/.test(f),
);

/** `const X = "..."` の形で書かれた名前の決まりを集める */
function readStringConsts(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of tsFiles) {
    const src = fs.readFileSync(f, "utf8");
    const re = /const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*"([a-z0-9_]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.set(m[1], m[2]);
  }
  return out;
}

/** 窓口の名前が入りうる決まり（*_WINDOW）の値をぜんぶ集める */
function readWindowNames(consts: Map<string, string>): string[] {
  const names = new Set<string>();
  for (const [k, v] of consts) if (/_WINDOW$/.test(k)) names.add(v);
  return [...names].sort();
}

/**
 * 名前を変数で渡している所（windowName・plan.window）に、実際に入りうる名前。
 *
 * 棚ごとの窓口は「どの棚にも同じ形」（合言葉と期間だけ渡す）なので、
 * 呼ぶ所は1か所にまとめてあり、名前だけが変わります。入りうる名前は
 *   ① 棚の一覧（shelfScope.ts の `window: ○○_WINDOW`）
 *   ② まとめた呼び口に渡している名前（readTenantShelfViaWindow(db, ○○_WINDOW, …)）
 * の2通りから集めます。**ぜんぶの *_WINDOW を当てはめない**のは、
 * テストの店を覗く窓口（引数が1つだけ）がここには渡らないためです。
 */
function readShelfWindowNames(consts: Map<string, string>): string[] {
  const names = new Set<string>();
  for (const f of tsFiles) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bwindow:\s*([A-Z][A-Z0-9_]*_WINDOW)\b/g)) {
      const v = consts.get(m[1]);
      if (v) names.add(v);
    }
    for (const m of src.matchAll(
      /readTenantShelfViaWindow\(\s*[^,]+,\s*([A-Z][A-Z0-9_]*_WINDOW)\b/g,
    )) {
      const v = consts.get(m[1]);
      if (v) names.add(v);
    }
  }
  return [...names].sort();
}

type Call = { loc: string; names: string[]; keys: string[] };

function readRpcCalls(consts: Map<string, string>, dynamicNames: string[]): Call[] {
  const calls: Call[] = [];
  for (const f of tsFiles) {
    const src = fs.readFileSync(f, "utf8");
    const re = /\.rpc\(\s*([A-Za-z0-9_."]+)\s*(?:,\s*(\{[\s\S]{0,600}?\})\s*)?\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const tok = m[1];
      const loc = `${path.relative(ROOT, f)}:${src.slice(0, m.index).split("\n").length}`;
      let names: string[];
      if (/^"/.test(tok)) names = [tok.replace(/"/g, "")];
      else if (consts.has(tok)) names = [consts.get(tok)!];
      // 変数で呼んでいる所（windowName・plan.window）は、入りうる名前をぜんぶ見る
      else names = dynamicNames;
      const body = m[2] ?? "{}";
      const keys = [...body.matchAll(/(?:^|[{,\s])([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((x) => x[1]);
      calls.push({ loc, names, keys });
    }
  }
  return calls;
}

test("アプリが呼ぶ窓口は、ぜんぶ貼り紙に書いてある（名前のすれ違いが無い）", () => {
  const fns = readSqlFunctions();
  const consts = readStringConsts();
  const windowNames = readWindowNames(consts);
  assert.ok(windowNames.length >= 11, `窓口の決まり（*_WINDOW）が少なすぎます：${windowNames.length}`);
  const shelfWindows = readShelfWindowNames(consts);
  assert.ok(shelfWindows.length >= 9, `棚の窓口が少なすぎます：${shelfWindows.length}`);
  // 決まりとして書いてある窓口は、変数で呼ぶ所に現れなくても貼り紙にあること
  const missingConst = windowNames.filter((n) => !fns.has(n));
  assert.deepEqual(missingConst, [], "貼り紙に無い窓口の名前が決まりに書かれています");
  const calls = readRpcCalls(consts, shelfWindows);
  assert.ok(calls.length >= 13, `呼んでいる所が少なすぎます：${calls.length}`);
  const bad: string[] = [];
  for (const c of calls) {
    for (const n of c.names) if (!fns.has(n)) bad.push(`${c.loc} → 貼り紙に窓口 ${n} がありません`);
  }
  assert.deepEqual(bad, []);
});

test("渡している引数の名前が、貼り紙の引数と合っている", () => {
  const fns = readSqlFunctions();
  const consts = readStringConsts();
  const shelfWindows = readShelfWindowNames(consts);
  const bad: string[] = [];
  for (const c of readRpcCalls(consts, shelfWindows)) {
    for (const n of c.names) {
      const params = fns.get(n);
      if (!params) continue;
      const declared = new Set(params.map((p) => p.name));
      for (const k of c.keys) {
        if (!declared.has(k)) bad.push(`${c.loc} → 窓口 ${n} に ${k} という引数はありません`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("必ず渡す引数（既定の値が無いもの）を、渡し忘れていない", () => {
  const fns = readSqlFunctions();
  const consts = readStringConsts();
  const shelfWindows = readShelfWindowNames(consts);
  const bad: string[] = [];
  for (const c of readRpcCalls(consts, shelfWindows)) {
    // 変数で呼んでいる所は「どの窓口にも同じ形」で渡すので、
    // 入りうる名前のうち、その形で足りないものだけを名指しする
    for (const n of c.names) {
      const params = fns.get(n);
      if (!params) continue;
      for (const p of params) {
        if (!p.hasDefault && !c.keys.includes(p.name)) {
          bad.push(`${c.loc} → 窓口 ${n} は ${p.name} を必ず要ります`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("貼り紙の最後に『窓口の一覧を作り直して』の合図がある（貼った瞬間から効くように）", () => {
  const sheet = fs.readFileSync(
    path.join(ROOT, "supabase/migrations/keiri_shelves_20261005.sql"),
    "utf8",
  );
  const lines = sheet.split("\n").filter((l) => /^notify pgrst, 'reload schema';\s*$/.test(l));
  assert.equal(lines.length, 1, "合図が1行ありません（貼っても窓口が見えないことがあります）");
  // 合図は、窓口をぜんぶ作ったあと＝いちばん最後に置くこと
  const lastWindow = sheet.lastIndexOf("create or replace function public.keiri_tenant_");
  assert.ok(
    sheet.indexOf("\nnotify pgrst, 'reload schema';") > lastWindow,
    "合図が窓口より前に置かれています（作る前に作り直させても意味がありません）",
  );
});
