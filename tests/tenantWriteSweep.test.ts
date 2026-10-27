/**
 * 「印の無い棚への書き込みが増えていないか」を固定する試験（2026-10-27・f3-4）。
 *
 * ■ この試験が落ちたときに読むもの
 *   答えにそのまま「どのファイルの、どの棚か」と「次に何をするか」が出ます。
 *   中身は lib/tenantWriteSweep.ts の describeFindings() です。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  ALLOWED_UNSCOPED,
  SCOPED_TABLES,
  describeFindings,
  findTableWrites,
  isAllowed,
  sweepFiles,
} from "../lib/tenantWriteSweep";

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

test("倉庫ぜんぶを数えて、印の無い棚への新しい書き込みが0件", () => {
  const files: { path: string; source: string }[] = [];
  for (const root of ROOTS) collect(root, files);
  // 数えるファイルが極端に少ないときは、歩き方が壊れている（0件＝合格と取り違えない）
  assert.ok(files.length > 200, `数えたファイルが ${files.length} 枚しかありません`);
  const findings = sweepFiles(files);
  assert.deepEqual(findings, [], describeFindings(findings));
});

test("許してある一覧は、1件ずつ理由を持っている", () => {
  for (const a of ALLOWED_UNSCOPED) {
    assert.ok(a.why.trim().length >= 4, `${a.path} → ${a.table} に理由がありません`);
    assert.ok(
      !SCOPED_TABLES.includes(a.table),
      `${a.table} は印の欄がある棚なので、許す一覧に書く必要はありません`,
    );
  }
  // 同じ組を2回 書いていない
  const keys = ALLOWED_UNSCOPED.map((a) => `${a.path}:${a.table}`);
  assert.equal(new Set(keys).size, keys.length, "同じ組が2回 書かれています");
});

test("書き込みだけを拾う（読むだけの所は拾わない）", () => {
  const read = 'db.from("setup_checks").select("id").eq("date", d);';
  assert.deepEqual(findTableWrites(read), []);
  const write = 'db.from("setup_checks").insert({ date: d });';
  assert.deepEqual(findTableWrites(write), [{ table: "setup_checks", op: "insert" }]);
});

test("すぐ下の別の文の書き込みを、前の棚のものと取り違えない", () => {
  const src = [
    'const a = await db.from("setup_checks").select("id");',
    'const b = await db.from("interim_reports").insert({ x: 1 });',
  ].join("\n");
  assert.deepEqual(findTableWrites(src), [{ table: "interim_reports", op: "insert" }]);
});

test("写真の置き場（storage）は棚として数えない", () => {
  const src = 'await db.storage.from("receipts").upload(path, file);';
  assert.deepEqual(findTableWrites(src), []);
});

test("印の欄がある棚は数えない。許してある組だけ通す", () => {
  assert.equal(isAllowed("app/anywhere.tsx", "daily_reports"), true);
  assert.equal(
    isAllowed("app/api/setup-check/create/route.ts", "setup_checks"),
    true,
  );
  // 同じ棚でも、別のファイルからの書き込みは通さない
  assert.equal(isAllowed("app/api/new-door/route.ts", "setup_checks"), false);
});

test("新しい裏口ができたら、ファイルの名前と棚の名前を出して落ちる", () => {
  const findings = sweepFiles([
    { path: "app/api/new-door/route.ts", source: 'db.from("setup_checks").insert({});' },
  ]);
  assert.equal(findings.length, 1);
  const text = describeFindings(findings);
  assert.match(text, /app\/api\/new-door\/route\.ts/);
  assert.match(text, /setup_checks/);
  assert.match(text, /f3-4/);
});

test("何も無ければ、そう言う", () => {
  assert.match(describeFindings([]), /ありません/);
});
