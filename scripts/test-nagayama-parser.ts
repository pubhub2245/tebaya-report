/**
 * lib/nagayama-parser.ts のCLI動作確認スクリプト。
 *
 * 実行例:
 *   npx tsx scripts/test-nagayama-parser.ts fixtures/nagayama_schedule_2026_04_21.pdf.pdf
 *
 * 引数省略時は fixtures/nagayama_schedule_2026_04_21.pdf.pdf を使う。
 *
 * .env.local を手動で読み込んで ANTHROPIC_API_KEY を process.env に流し込む。
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// --- .env.local 読み込み（プロセス起動時に） -------------------------------
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const envText = readFileSync(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim();
    }
  }
}

async function main(): Promise<void> {
  const { parseNagayamaPDF } = await import("../lib/nagayama-parser");
  const { NAGAYAMA_TARGETS } = await import("../lib/shift-config");

  // --- 入力PDF ------------------------------------------------------------
  const pdfPath =
    process.argv[2] ?? "fixtures/nagayama_schedule_2026_04_21.pdf.pdf";
  if (!existsSync(pdfPath)) {
    console.error(`PDFが見つかりません: ${pdfPath}`);
    process.exit(1);
  }

  const pdfBuffer = readFileSync(pdfPath);
  const yearHint = Number(process.env.YEAR_HINT) || new Date().getFullYear();

  console.log("=== ながやまPDF解析 ===");
  console.log(
    `ファイル: ${pdfPath} (${pdfBuffer.length.toLocaleString()} bytes)`,
  );
  console.log(`year hint: ${yearHint}`);
  console.log("Claude API 呼び出し中...");

  const t0 = Date.now();
  const result = await parseNagayamaPDF(pdfBuffer, { year: yearHint });
  const elapsedMs = Date.now() - t0;
  console.log(`応答時間: ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log("");

  // --- サマリー表示 -------------------------------------------------------
  console.log("=== ながやまPDF解析結果 ===");
  console.log(`検出年: ${result.meta.detectedYear}`);
  console.log(`検出月: [${result.meta.detectedMonths.join(", ")}]`);
  console.log(`検出店舗（${result.meta.detectedStores.length}件）:`);
  for (const s of result.meta.detectedStores) {
    console.log(`  - ${s}`);
  }
  console.log("");

  // NAGAYAMA_TARGETS と検出店舗のマッチング
  const targetMatch: Record<string, string | null> = {};
  for (const t of NAGAYAMA_TARGETS) {
    const core = t.replace(/店$/, "");
    const hit =
      result.meta.detectedStores.find((s) => s === t) ??
      result.meta.detectedStores.find((s) => s.includes(core)) ??
      null;
    targetMatch[t] = hit;
  }

  const unknownStores = result.meta.detectedStores.filter(
    (s) =>
      !Object.values(targetMatch).includes(s) &&
      !NAGAYAMA_TARGETS.includes(s as (typeof NAGAYAMA_TARGETS)[number]),
  );

  if (unknownStores.length > 0) {
    console.log("【NAGAYAMA_TARGETS に無い店舗】");
    for (const s of unknownStores) console.log(`  - ${s}`);
    console.log("");
  }

  // --- 月ごとの空き日数集計 -----------------------------------------------
  for (const month of result.meta.detectedMonths) {
    console.log(`--- ${result.meta.detectedYear}年${month}月 ---`);
    for (const target of NAGAYAMA_TARGETS) {
      const matched = targetMatch[target];
      if (!matched) {
        console.log(`${target}: （PDFに該当店舗が見つかりません）`);
        continue;
      }
      const dates = result.schedule[matched] || {};
      const monthPrefix = `${result.meta.detectedYear}-${String(month).padStart(2, "0")}-`;
      const monthDates = Object.entries(dates).filter(([k]) =>
        k.startsWith(monthPrefix),
      );
      const emptyDates = monthDates
        .filter(([, v]) => v === null)
        .map(([k]) => k);
      const emptyDays = emptyDates
        .map((d) => d.slice(8))
        .map((d) => `${month}/${parseInt(d, 10)}`);
      console.log(
        `${target}${matched !== target ? ` (PDF: ${matched})` : ""}: 空き ${emptyDates.length}日 / 全${monthDates.length}日`,
      );
      if (emptyDays.length > 0) {
        console.log(`  → ${emptyDays.join(", ")}`);
      }
    }
    console.log("");
  }

  console.log("=== 完了 ===");
}

main().catch((e) => {
  console.error("エラー:", e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
