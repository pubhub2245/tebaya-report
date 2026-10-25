/**
 * 棚の「仕分け表」の見張り（2026-10-25・f3-4）。
 *
 * ■ ここで止めたいこと
 *   よその店のデータが見えないかの見張りは、これまで
 *   「印の欄が無い棚の一覧」に**名前が載っている棚**にだけ効いていました。
 *   一覧に名前が無い棚は、門を掛け忘れても誰も気づけません
 *   （10/21〜10/24 に、1日1つずつ手で見つけて足していたのがこれです）。
 *
 *   そこで **棚を全部 仕分けて、仕分けから漏れた棚があればここで落とします。**
 *   新しい棚を使い始めたら、lib/tenantTables.ts に名前を書くまで `npm test` が通りません。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  NOT_A_LIVE_TABLE,
  TABLES_NOT_IN_SHOP_SCREENS,
  TENANT_SCOPED_TABLES,
  UNSCOPED_READS_WITH_REASON,
  allClassifiedTables,
  classifyTable,
} from "../lib/tenantTables";
import { TABLES_WITHOUT_TENANT_COLUMN } from "../lib/tenantScope";
import { LIVE_TABLES } from "../lib/keiri/copyCandidates";

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

/** コードが実際に読み書きしている棚を、機械で数え上げる */
function tablesUsedByCode(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const dir of ["app", "lib"]) {
    for (const file of sourceFiles(dir)) {
      const rel = file.replace(/\\/g, "/");
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\.from\("([a-z_0-9]+)"\)/g)) {
        const list = out.get(m[1]) || [];
        if (!list.includes(rel)) list.push(rel);
        out.set(m[1], list);
      }
    }
  }
  return out;
}

/** お店の人が合言葉なしで開ける画面か（/admin と /api は合言葉・鍵の内側なので外す） */
function isShopScreen(rel: string): boolean {
  return (
    rel.startsWith("app/") &&
    !rel.startsWith("app/admin/") &&
    !rel.startsWith("app/api/")
  );
}

test("コードが使っている棚は、ぜんぶ仕分け表のどこかに入っている", () => {
  const used = tablesUsedByCode();
  const unknown: string[] = [];
  for (const [table, files] of used) {
    if (classifyTable(table) === null) unknown.push(`${table}（${files.join(" / ")}）`);
  }
  assert.deepEqual(
    unknown.sort(),
    [],
    "仕分けのされていない棚があります。lib/tenantTables.ts の3つの一覧のどれかに名前を書いてください：\n" +
      unknown.join("\n"),
  );
});

test("仕分け表に、1つの棚が2か所に書かれていない", () => {
  const seen = new Map<string, string[]>();
  const add = (table: string, where: string) =>
    seen.set(table, [...(seen.get(table) || []), where]);
  for (const t of TENANT_SCOPED_TABLES) add(t, "印の欄がある");
  for (const t of TABLES_WITHOUT_TENANT_COLUMN) add(t, "印の欄が無い（門で守る）");
  for (const t of Object.keys(TABLES_NOT_IN_SHOP_SCREENS)) add(t, "お店の画面からは触らない");
  for (const t of Object.keys(NOT_A_LIVE_TABLE)) add(t, "棚ではない・もう無い");
  const doubled = [...seen.entries()]
    .filter(([, w]) => w.length > 1)
    .map(([t, w]) => `${t}：${w.join(" と ")}`);
  assert.deepEqual(doubled.sort(), [], `同じ棚が2か所に書かれています：\n${doubled.join("\n")}`);
});

test("写しを探す材料（LIVE_TABLES）の棚も、ぜんぶ仕分けてある", () => {
  /**
   * ★LIVE_TABLES は「コードが読み書きしている棚」を数え上げたもので、
   *   写しの名前を組み立てる材料に使っています（lib/keiri/copyCandidates.ts）。
   *   こちらに名前があって仕分け表に無い棚は、**守り方が決まっていない棚**です。
   */
  const unknown = [...LIVE_TABLES].filter((t) => classifyTable(t) === null);
  assert.deepEqual(
    unknown.sort(),
    [],
    "写しを探す材料にあるのに、守り方が決まっていない棚があります：\n" + unknown.join("\n"),
  );
});

test("仕分け表に、使っていない棚の名前を増やしていない", () => {
  /**
   * 逆向きの見張り。仕分け表にだけ名前があって、コードも写しの材料も知らない棚は、
   * 書き間違いか、消したあとの残りです（残すなら NOT_A_LIVE_TABLE に理由つきで）。
   */
  const used = new Set([...tablesUsedByCode().keys(), ...LIVE_TABLES]);
  const stale = allClassifiedTables().filter(
    (t) => !used.has(t) && !(t in NOT_A_LIVE_TABLE),
  );
  assert.deepEqual(stale.sort(), [], `仕分け表に、どこにも出てこない棚があります：\n${stale.join("\n")}`);
});

/**
 * 置き場所は app/components だが、呼んでいるのは**管理者ページだけ**の部品。
 * ＝ 合言葉の内側なので、お店の人には開けない。
 * ★「管理者ページだけから呼ばれている」ことは、下のテストで実際に数えます
 *   （ほかの画面から呼び始めたら落ちます）。
 */
const ADMIN_ONLY_COMPONENTS = ["app/components/AchievementRateDashboard.tsx"];

test("管理者ページだけの部品は、ほかの画面から呼ばれていない", () => {
  const wrong: string[] = [];
  for (const comp of ADMIN_ONLY_COMPONENTS) {
    const name = comp.replace(/^app\//, "").replace(/\.tsx?$/, "");
    for (const dir of ["app", "lib"]) {
      for (const file of sourceFiles(dir)) {
        const rel = file.replace(/\\/g, "/");
        if (rel === comp) continue;
        const src = readFileSync(file, "utf8");
        if (!src.includes(`@/app/${name}`)) continue;
        if (rel.startsWith("app/admin/")) continue;
        wrong.push(`${comp} ← ${rel}`);
      }
    }
  }
  assert.deepEqual(
    wrong.sort(),
    [],
    "管理者ページだけの部品を、合言葉の外の画面が呼んでいます：\n" + wrong.join("\n"),
  );
});

test("「お店の画面からは触らない」と書いた棚を、本当に画面から触っていない", () => {
  const used = tablesUsedByCode();
  const broken: string[] = [];
  for (const table of Object.keys(TABLES_NOT_IN_SHOP_SCREENS)) {
    for (const rel of used.get(table) || []) {
      if (isShopScreen(rel) && !ADMIN_ONLY_COMPONENTS.includes(rel)) {
        broken.push(`${table} ← ${rel}`);
      }
    }
  }
  assert.deepEqual(
    broken.sort(),
    [],
    "「お店の画面からは触らない」と書いた棚を、画面が読んでいます（門が要ります）：\n" +
      broken.join("\n"),
  );
});

test("「お店の画面からは触らない」棚には、なぜ触らないかの理由が1つずつ書いてある", () => {
  for (const [table, why] of Object.entries(TABLES_NOT_IN_SHOP_SCREENS)) {
    assert.ok(why.trim().length >= 10, `${table} の理由が書かれていません`);
  }
  for (const [table, why] of Object.entries(NOT_A_LIVE_TABLE)) {
    assert.ok(why.trim().length >= 10, `${table} の理由が書かれていません`);
  }
});

test("印の欄がある棚を『絞らずに』読んでいる所は、いま分かっているぶんだけ", () => {
  /**
   * ★2026-10-25（f3-4）。印の欄がある棚は `applyTenantScope` などで絞って読むのが決まり。
   *   絞らずに読んでいる所が増えたら、ここで落ちます。
   *   増えたぶんは「絞る」か「lib/tenantTables.ts に理由を書く」かのどちらかをすること。
   */
  const MARKS = [
    "applyTenantScope",
    "rowsInScope",
    "isTebayaScope(",
    "tenantStamp",
    "scopeShiftsQuery",
    "withShiftTenant",
    "limitedProductInScope",
    "advanceInScope",
    // 印の列を直に書いて絞っている所（applyTenantScope を通さない書き方）
    'is("tenant_id"',
    'eq("tenant_id"',
    // 「印が付いた行だけ」を数える所（f3-4 を外から確かめる窓口。中身は受け取らない）
    'not("tenant_id"',
  ];
  const found: string[] = [];
  for (const dir of ["app", "lib"]) {
    for (const file of sourceFiles(dir)) {
      const rel = file.replace(/\\/g, "/");
      const src = readFileSync(file, "utf8");
      if (MARKS.some((m) => src.includes(m))) continue;
      for (const table of TENANT_SCOPED_TABLES) {
        if (src.includes(`.from("${table}")`)) found.push(rel);
      }
    }
  }
  assert.deepEqual(
    [...new Set(found)].sort(),
    Object.keys(UNSCOPED_READS_WITH_REASON).sort(),
    "印の欄がある棚を、絞らずに読んでいる所が増えました：\n" + found.join("\n"),
  );
});

test("絞らずに読んでいる所には、理由が1つずつ書いてある", () => {
  for (const [file, why] of Object.entries(UNSCOPED_READS_WITH_REASON)) {
    assert.ok(why.trim().length >= 20, `${file} の理由が書かれていません`);
    // 書いたファイルが本当にあること（消したあとに残らないように）
    assert.doesNotThrow(() => readFileSync(file, "utf8"), `${file} が見つかりません`);
  }
});
