/**
 * 「送る1枚」（/keiri/send）が**配っている中身**に、送り先8軒の呼び名が入らないことを固定する（kp172）。
 *
 * ■ なぜこの戻り止めが要るか（やさしい説明）
 *   kp162 で「この1枚には送り先8軒の呼び名を出さない」と決め、
 *   これまでの戻り止めは「**画面に書いた文字**に呼び名が出ていないか」だけを見ていました。
 *   ところが 2026-09-25 に実際に起きたのは、その手前の抜けでした：
 *   ブラウザに配られる部品（"use client" の付いたもの）が、呼び名の入ったファイルを
 *   まるごと取り込んでいたため、**画面には1文字も出ないのに、配られている中身を読めば
 *   呼び名が分かる**形になっていました。/keiri/send は合言葉の要らない住所＝誰でも開けます。
 *
 * ■ この検算がやっていること
 *   /keiri/send のページから「取り込んでいるファイル」を1本ずつたどって（孫・ひ孫まで）、
 *   そのどれにも呼び名の文字が入っていないことを確かめます。
 *   ＝ ここに1つも入っていなければ、組み立てた結果（配られる中身）にも入りません。
 *   呼び名は「じゅんの端末にだけ出る帯」1か所だけが取り込みます。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OUTREACH_SHOP_ORDER } from "../lib/keiri/outreachShops";
import { OUTREACH_SHOP_LABELS } from "../lib/keiri/outreachShopLabels";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** そのファイルが取り込んでいる「この倉庫の中のファイル」の場所 */
function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs = new Set<string>();
  for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) specs.add(m[1]);
  for (const m of src.matchAll(/import\s+["']([^"']+)["']/g)) specs.add(m[1]);

  const out: string[] = [];
  for (const spec of specs) {
    let base: string | null = null;
    if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(file), spec);
    if (!base) continue; // react・next などの外の部品は見ない
    const found = resolve(base);
    if (found) out.push(found);
  }
  return out;
}

function resolve(base: string): string | null {
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(cand) && !cand.endsWith(path.sep)) {
      try {
        if (readFileSync(cand).length >= 0 && /\.(ts|tsx)$/.test(cand)) return cand;
      } catch {}
    }
  }
  return null;
}

/** そのファイルから、たどれる全部のファイル（自分を含む） */
function reachableFrom(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of importsOf(file)) if (!seen.has(next)) queue.push(next);
  }
  return [...seen];
}

const SEND_ENTRIES = [
  path.join(root, "app/keiri/send/page.tsx"),
  path.join(root, "app/keiri/send/SendActions.tsx"),
  path.join(root, "app/keiri/send/SendProgress.tsx"),
];

test("送る1枚からたどれるファイルに、送り先8軒の呼び名が1つも入っていない", () => {
  const files = reachableFrom(SEND_ENTRIES);
  assert.ok(files.length >= 4, "たどれたファイルが少なすぎる（たどり方が壊れている）");

  const labels = Object.values(OUTREACH_SHOP_LABELS);
  assert.equal(labels.length, 8);

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const label of labels) {
      assert.ok(
        !src.includes(label),
        `${path.relative(root, file)} に送り先の呼び名「${label}」が入っている。` +
          "呼び名は lib/keiri/outreachShopLabels.ts に置き、/keiri/send からは取り込まないこと（kp172）",
      );
    }
  }
});

test("呼び名のファイルそのものが、送る1枚からたどれない", () => {
  const files = reachableFrom(SEND_ENTRIES).map((f) => path.relative(root, f));
  assert.ok(
    !files.includes(path.join("lib", "keiri", "outreachShopLabels.ts")),
    "/keiri/send が呼び名のファイルを取り込んでいる（取り込むと、配られる中身に呼び名が入る）",
  );
});

test("並び順のファイル（outreachShops.ts）には、呼び名を書かない", () => {
  const src = readFileSync(path.join(root, "lib/keiri/outreachShops.ts"), "utf8");
  for (const label of Object.values(OUTREACH_SHOP_LABELS)) {
    assert.ok(!src.includes(label), `outreachShops.ts に呼び名「${label}」が入っている`);
  }
  // 並び順と呼び名は、同じ8軒・同じ id でそろっていること
  assert.deepEqual(
    OUTREACH_SHOP_ORDER.map((s) => s.id),
    Object.keys(OUTREACH_SHOP_LABELS),
  );
});

test("共通のファイル（outreach.ts）にも呼び名を書かない（誰が取り込んでも安全にする）", () => {
  const src = readFileSync(path.join(root, "lib/keiri/outreach.ts"), "utf8");
  for (const label of Object.values(OUTREACH_SHOP_LABELS)) {
    assert.ok(!src.includes(label), `outreach.ts に呼び名「${label}」が入っている`);
  }
});

test("呼び名を取り込んでよいのは、じゅんの端末にだけ出る帯だけ", () => {
  const banner = readFileSync(
    path.join(root, "app/components/OwnerOutreachNudge.tsx"),
    "utf8",
  );
  assert.ok(
    banner.includes('from "@/lib/keiri/outreachShopLabels";'),
    "帯は呼び名のファイルから読むこと（帯は管理者パスワードを入れた端末にだけ出る）",
  );
});
