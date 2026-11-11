/**
 * 「印のある棚を、絞らずに読む所が増えていないか」を固定する試験（2026-11-11・f3-4）。
 *
 * ■ この試験が落ちたときに読むもの
 *   答えにそのまま「どのファイルの何行目か」と「次に何をするか」が出ます。
 *   中身は lib/tenantReadSweep.ts の describeReadFindings() です。
 *
 * ■ これまでの見張りとの違い（なぜ足したか）
 *   読む所の見張りは tests/tenantTables.test.ts にもありますが、そちらは
 *   **ファイル単位**です（lib/tenantTables.ts にその事実が書いてあります）。
 *   ＝ 1か所でも絞っている大きなファイルに、絞り忘れた読みを1つ足しても通ります。
 *   この試験は **読む所を1か所ずつ**数えるので、そこを塞ぎます。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  ALLOWED_UNSCOPED_READS,
  describeReadFindings,
  findTableReads,
  isAllowedRead,
  sweepReads,
} from "../lib/tenantReadSweep";

/** 読む所（app・lib・components のソースぜんぶ） */
const ROOTS = ["app", "lib", "components"];

function collect(dir: string, out: { path: string; source: string }[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collect(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    out.push({ path: full.split("\\").join("/"), source: readFileSync(full, "utf8") });
  }
}

test("倉庫ぜんぶを数えて、印のある棚を絞らずに読む所が0件", () => {
  const files: { path: string; source: string }[] = [];
  for (const root of ROOTS) collect(root, files);
  // 数えるファイルが極端に少ないときは、歩き方が壊れている（0件＝合格と取り違えない）
  assert.ok(files.length > 200, `数えたファイルが ${files.length} 枚しかありません`);
  const findings = sweepReads(files);
  assert.deepEqual(findings, [], describeReadFindings(findings));
});

test("許してある読みには、ぜんぶ理由が書いてある", () => {
  for (const a of ALLOWED_UNSCOPED_READS) {
    assert.ok(a.why.trim().length >= 10, `${a.path} → ${a.table} の理由が短すぎます`);
  }
});

test("許してある読みの一覧に、もう無いファイルが残っていない", () => {
  for (const a of ALLOWED_UNSCOPED_READS) {
    const src = readFileSync(a.path, "utf8");
    assert.ok(
      src.includes(`"${a.table}"`),
      `${a.path} は もう ${a.table} を読んでいません（一覧から外してください）`,
    );
  }
});

test("1か所ずつ数える＝同じファイルで絞っている読みがあっても、絞り忘れを見つける", () => {
  // ★これまでの「ファイル単位」の見張りが見落としていた形そのもの
  const source = [
    'const a = applyTenantScope(supabase.from("locations").select("name"), scope);',
    'const b = supabase.from("staff_members").select("name").order("name");',
  ].join("\n");
  const hits = findTableReads(source);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].table, "locations");
  assert.equal(hits[0].scoped, true);
  assert.equal(hits[1].table, "staff_members");
  assert.equal(hits[1].scoped, false);
  assert.equal(hits[1].line, 2);
});

test("書き込みは数えない（書き込みの見張りは tenantWriteSweep の仕事）", () => {
  const source = 'await supabase.from("locations").insert({ name: "x" }).select("id");';
  assert.deepEqual(findTableReads(source), []);
});

test("写真の置き場（storage）は棚として数えない", () => {
  const source = 'supabase.storage.from("receipts").select("x");';
  assert.deepEqual(findTableReads(source), []);
});

test("経理の棚は、お店ごとの合い札（business_type_code）で引いていれば絞っている", () => {
  const source =
    'supabase.from("keiri_settings").select("memo").eq("business_type_code", code).maybeSingle();';
  const hits = findTableReads(source);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].scoped, true);
});

test("印の無い棚の読みは、この道具では数えない（別の見張りの仕事）", () => {
  assert.equal(isAllowedRead("app/x.tsx", "event_plans"), true);
  assert.equal(isAllowedRead("app/x.tsx", null), true);
  assert.equal(isAllowedRead("app/x.tsx", "locations"), false);
});
