// LINEログ抽出済みJSON（data/extracted-reports.json）から
// daily_reports テーブルへ投入するスクリプト。
//
// 使い方:
//   # dryRun（DB書き込みなし、予定だけ表示）
//   node scripts/insert-line-reports.mjs data/extracted-reports.json
//
//   # 実投入
//   node scripts/insert-line-reports.mjs data/extracted-reports.json --execute
//
// 安全機構:
//   - --execute フラグなしではDBに書き込まない
//   - 既存 daily_reports と date+staff+location 一致は自動スキップ
//   - 解決不能なスタッフ名・店舗名は WARNING ＋スキップ
//   - staff_members 未作成時はハードコードフォールバックで動作

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────────────────────
// 引数処理
// ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const inputPath = args.find((a) => !a.startsWith("--"));
const EXECUTE = args.includes("--execute");

if (!inputPath) {
  console.error(
    "Usage: node scripts/insert-line-reports.mjs <input.json> [--execute]",
  );
  process.exit(1);
}
const absInput = pathResolve(inputPath);
if (!existsSync(absInput)) {
  console.error(`入力ファイルが見つかりません: ${absInput}`);
  process.exit(1);
}

// ────────────────────────────────────────────────────────────
// Supabaseクライアント（.env.local から読む）
// ────────────────────────────────────────────────────────────

const env = readFileSync(".env.local", "utf8");
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const SUPABASE_KEY =
  env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim() ||
  env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Supabase 接続情報が .env.local に見つかりません");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ────────────────────────────────────────────────────────────
// 名寄せ：staff_members → ハードコードフォールバック
// ────────────────────────────────────────────────────────────

const HARDCODED_STAFF = {
  じゅん: { name: "じゅん", unit: 1 },
  川畑潤一郎: { name: "じゅん", unit: 1 },
  イデ: { name: "イデ", unit: 1 },
  井手: { name: "イデ", unit: 1 },
  "idehiro（イデさん）_Fairy": { name: "イデ", unit: 1 },
  かずき: { name: "かずき", unit: 2 },
  なぎさ: { name: "なぎさ", unit: 2 },
  岡田: { name: "岡田", unit: 1 },
  瀬戸口: { name: "瀬戸口", unit: 1 },
  りゅうき: { name: "瀬戸口", unit: 1 },
  "あ　Ryuki": { name: "瀬戸口", unit: 1 },
  "あ Ryuki": { name: "瀬戸口", unit: 1 },
  想生: { name: "想生", unit: 1 },
  さよ: { name: "想生", unit: 1 },
  ゆうと: { name: "ゆうと", unit: null },
  緒方悠斗: { name: "ゆうと", unit: null },
  緒方祐人: { name: "ゆうと", unit: null },
};

async function loadStaffMembers() {
  const { data, error } = await sb
    .from("staff_members")
    .select("name, aliases, unit_number");
  if (error) {
    console.warn(
      `⚠️  staff_members テーブルが利用不可（${error.message.slice(0, 60)}…）→ ハードコードフォールバックを使用`,
    );
    return null;
  }
  return data;
}

function buildResolver(staffMembers) {
  const map = new Map();
  if (staffMembers) {
    for (const s of staffMembers) {
      const u =
        s.unit_number === null || s.unit_number === undefined || s.unit_number === ""
          ? null
          : parseInt(String(s.unit_number), 10);
      const unit = u === 1 || u === 2 ? u : null;
      map.set(s.name.trim(), { name: s.name, unit });
      for (const alias of s.aliases || []) {
        map.set(String(alias).trim(), { name: s.name, unit });
      }
    }
  }
  // ハードコードを補完（DBにない名前のフォールバック）
  for (const [k, v] of Object.entries(HARDCODED_STAFF)) {
    if (!map.has(k)) map.set(k, v);
  }
  return (rawName) => {
    if (!rawName) return null;
    const trimmed = String(rawName).trim();
    return map.get(trimmed) || null;
  };
}

// ────────────────────────────────────────────────────────────
// 店舗名正規化
// ────────────────────────────────────────────────────────────

const LOCATION_CANONICAL = [
  "ながやま 鷹尾店",
  "ながやま 若葉店",
  "ながやま 三股店",
  "ながやま 都北店",
  "ながやま 山田店",
  "ながやま 志比田店",
  "マンガ倉庫",
  "PASIO高城店",
  "PASIO早鈴店",
  "ニクルの朝市",
  "まるまる朝市",
  "BIG OPUS",
  "Aコープ木花",
  "イオンモール",
];

function normalizeLocationName(name) {
  if (!name) return "";
  return String(name)
    .replace(/\s+/g, "")
    .replace(/　/g, "")
    .replace(/店$/, "")
    .toLowerCase();
}

const LOC_LOOKUP = new Map();
for (const c of LOCATION_CANONICAL) LOC_LOOKUP.set(normalizeLocationName(c), c);

function resolveLocation(rawLoc) {
  if (!rawLoc) return null;
  const norm = normalizeLocationName(rawLoc);
  return LOC_LOOKUP.get(norm) || null;
}

// ────────────────────────────────────────────────────────────
// 日時変換：JST "YYYY-MM-DD HH:MM" → UTC ISO
// ────────────────────────────────────────────────────────────

function jstToUtcIso(jstStr) {
  if (!jstStr) return null;
  const m = String(jstStr).match(
    /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/,
  );
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const utc = new Date(
    Date.UTC(+y, +mo - 1, +d, +h - 9, +mi),
  );
  return utc.toISOString();
}

// ────────────────────────────────────────────────────────────
// 既存日報 ロード
// ────────────────────────────────────────────────────────────

async function loadExistingKeys() {
  const { data, error } = await sb
    .from("daily_reports")
    .select("date, staff_name, location");
  if (error) {
    console.warn(`⚠️  既存 daily_reports 取得失敗: ${error.message}`);
    return new Set();
  }
  return new Set(
    (data || []).map(
      (r) => `${r.date}|${(r.staff_name || "").trim()}|${(r.location || "").trim()}`,
    ),
  );
}

// ────────────────────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────────────────────

console.log(`🔍 入力: ${absInput}`);
console.log(`🔧 モード: ${EXECUTE ? "✏️ 実投入（--execute）" : "🛡 dryRun（--executeで本実行）"}`);
console.log("");

const records = JSON.parse(readFileSync(absInput, "utf8"));
console.log(`読み込み: ${records.length}件\n`);

const staffMembers = await loadStaffMembers();
const resolveStaff = buildResolver(staffMembers);
const existingKeys = await loadExistingKeys();
console.log(`既存 daily_reports キー: ${existingKeys.size}件\n`);

const planned = [];
const skippedDup = [];
const errors = [];
const warnings = [];

for (const [i, rec] of records.entries()) {
  const idx = i + 1;
  const errs = [];

  if (!rec.date || !/^\d{4}-\d{2}-\d{2}$/.test(rec.date))
    errs.push(`date不正: ${rec.date}`);
  if (typeof rec.sales_amount !== "number")
    errs.push(`sales_amount不正: ${rec.sales_amount}`);
  if (!rec.staff_name_raw) errs.push("staff_name_raw 欠落");
  if (!rec.location_raw) errs.push("location_raw 欠落");

  if (errs.length > 0) {
    errors.push({ idx, rec, reason: errs.join(", ") });
    continue;
  }

  const staff = resolveStaff(rec.staff_name_raw);
  if (!staff) {
    warnings.push({
      idx,
      kind: "staff",
      reason: `スタッフ未解決: "${rec.staff_name_raw}"`,
      rec,
    });
    continue;
  }

  const location = resolveLocation(rec.location_raw);
  if (!location) {
    warnings.push({
      idx,
      kind: "location",
      reason: `店舗未解決: "${rec.location_raw}"`,
      rec,
    });
    continue;
  }

  const dupKey = `${rec.date}|${staff.name}|${location}`;
  if (existingKeys.has(dupKey)) {
    skippedDup.push({ idx, rec, staff, location, dupKey });
    continue;
  }

  // 経費 jsonb：cost_other があれば1件追加（食材/日当/場代は計算値なので積まない）
  const expenses = [];
  let expensesTotal = 0;
  if (typeof rec.cost_other === "number" && rec.cost_other > 0) {
    expenses.push({
      description: "その他備品（LINE移行）",
      amount: rec.cost_other,
    });
    expensesTotal += rec.cost_other;
  }

  const insertRow = {
    date: rec.date,
    location,
    staff_name: staff.name,
    unit_number: staff.unit,
    sales_amount: rec.sales_amount ?? 0,
    cumulative_sales: rec.cumulative_sales ?? rec.sales_amount ?? 0,
    labor: rec.cost_labor ?? 10000,
    register_total: rec.register_total ?? 0,
    register_ok: rec.register_ok ?? true,
    register_diff: rec.register_diff ?? 0,
    remaining_tebasaki: rec.remaining_tebasaki ?? 0,
    remaining_gyoza: rec.remaining_gyoza ?? 0,
    remaining_potato: rec.remaining_potato ?? 0,
    remaining_tornado: rec.remaining_tornado ?? 0,
    remaining_negishio: rec.remaining_negishio ?? 0,
    expenses,
    expenses_total: expensesTotal,
    handover: rec.handover ?? null,
    line_text: rec.raw_message ?? null,
    created_at:
      jstToUtcIso(rec.line_timestamp) || new Date().toISOString(),
  };

  planned.push({ idx, rec, staff, location, row: insertRow });
}

// ────────────────────────────────────────────────────────────
// レポート出力
// ────────────────────────────────────────────────────────────

const ts = new Date()
  .toISOString()
  .replace(/[:.]/g, "")
  .replace("T", "-")
  .slice(0, 15);
const reportPath = pathResolve(`data/insert-report-${ts}.md`);

const md = [];
md.push(`# 投入レポート (${EXECUTE ? "実投入" : "dryRun"})`);
md.push("");
md.push(
  `処理対象: **${records.length}件** / 投入予定: **${planned.length}件** / 既存重複スキップ: **${skippedDup.length}件** / WARNING: **${warnings.length}件** / エラー: **${errors.length}件**`,
);
md.push("");

console.log("════════════════════════════════════════");
console.log(
  `処理対象: ${records.length}件 / 投入予定: ${planned.length}件 / 重複スキップ: ${skippedDup.length}件 / WARNING: ${warnings.length}件 / エラー: ${errors.length}件`,
);
console.log("════════════════════════════════════════\n");

if (planned.length > 0) {
  md.push("## ✅ 投入予定");
  md.push("| # | 日付 | 担当(raw→正規) | 番隊 | 場所(raw→正規) | 売上 |");
  md.push("|---|------|----------------|------|----------------|------|");
  for (const p of planned) {
    md.push(
      `| ${p.idx} | ${p.rec.date} | ${p.rec.staff_name_raw} → **${p.staff.name}** | ${p.staff.unit ?? "-"} | ${p.rec.location_raw} → **${p.location}** | ¥${(p.rec.sales_amount || 0).toLocaleString()} |`,
    );
    console.log(
      `✅ #${p.idx} ${p.rec.date} | ${p.rec.staff_name_raw}→${p.staff.name}(${p.staff.unit ?? "-"}) | ${p.rec.location_raw}→${p.location} | ¥${(p.rec.sales_amount || 0).toLocaleString()}`,
    );
  }
  md.push("");
}

if (skippedDup.length > 0) {
  md.push("## ⏭️ 既存と重複（スキップ）");
  md.push("| # | キー |");
  md.push("|---|------|");
  for (const s of skippedDup) {
    md.push(`| ${s.idx} | \`${s.dupKey}\` |`);
    console.log(`⏭️  #${s.idx} 重複: ${s.dupKey}`);
  }
  md.push("");
}

if (warnings.length > 0) {
  md.push("## ⚠️ WARNING（解決不能のためスキップ）");
  md.push("| # | 種別 | 理由 | date | staff_raw | location_raw |");
  md.push("|---|------|------|------|-----------|--------------|");
  for (const w of warnings) {
    md.push(
      `| ${w.idx} | ${w.kind} | ${w.reason} | ${w.rec.date} | ${w.rec.staff_name_raw ?? ""} | ${w.rec.location_raw ?? ""} |`,
    );
    console.log(`⚠️  #${w.idx} ${w.reason}`);
  }
  md.push("");
}

if (errors.length > 0) {
  md.push("## ❌ エラー");
  md.push("| # | 理由 | レコード |");
  md.push("|---|------|----------|");
  for (const e of errors) {
    md.push(
      `| ${e.idx} | ${e.reason} | \`${JSON.stringify(e.rec).slice(0, 100)}\` |`,
    );
    console.log(`❌ #${e.idx} ${e.reason}`);
  }
  md.push("");
}

writeFileSync(reportPath, md.join("\n"), "utf8");
console.log(`\n📄 詳細レポート: ${reportPath}`);

// ────────────────────────────────────────────────────────────
// 実投入
// ────────────────────────────────────────────────────────────

if (!EXECUTE) {
  console.log("\n🛡 dryRun完了（DB変更なし）");
  console.log("実投入する場合: --execute フラグを付けて再実行");
  process.exit(0);
}

if (planned.length === 0) {
  console.log("\n投入対象なし");
  process.exit(0);
}

console.log(`\n✏️  ${planned.length}件をDBに投入します…`);
let okCount = 0;
let ngCount = 0;
const insertErrors = [];

for (const p of planned) {
  const { data, error } = await sb
    .from("daily_reports")
    .insert(p.row)
    .select("id")
    .single();
  if (error) {
    ngCount++;
    insertErrors.push({ idx: p.idx, error: error.message, row: p.row });
    console.log(`❌ #${p.idx} INSERT失敗: ${error.message}`);
  } else {
    okCount++;
    console.log(`✅ #${p.idx} INSERT成功 id=${data.id}`);
  }
}

console.log(`\n結果: ${okCount}件成功 / ${ngCount}件失敗`);

// 投入結果も追記
const tail = [
  "",
  "## 📊 実投入結果",
  `成功: ${okCount}件 / 失敗: ${ngCount}件`,
  "",
];
if (insertErrors.length > 0) {
  tail.push("### 失敗詳細");
  for (const e of insertErrors) {
    tail.push(`- #${e.idx}: ${e.error}`);
  }
}
writeFileSync(reportPath, md.join("\n") + "\n" + tail.join("\n"), "utf8");
console.log(`📄 詳細レポート更新: ${reportPath}`);
