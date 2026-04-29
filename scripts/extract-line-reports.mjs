// LINEログから過去の手羽屋日報を抽出してJSON＋Markdownサマリーを出力する
//
// 使い方:
//   node scripts/extract-line-reports.mjs <input.txt>
//
// 出力:
//   data/extracted-reports.json   構造化された日報データ配列
//   data/extracted-reports-summary.md  人間可読サマリー
//
// このスクリプトはDBに一切書き込みません（読み取り専用）。
// DB投入は別スクリプトで行います（staff_members 作成後）。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

// ────────────────────────────────────────────────────────────
// ユーティリティ
// ────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");

/** "2026/4/1" / "2026/4/01" / "2026年4月1日" → "2026-04-01" */
function normalizeDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/(\d{4})[\/年\-.](\d{1,2})[\/月\-.](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
}

/** "¥36,000" / "￥3600" / "￥9,000（売上の25%）" → 36000 / 3600 / 9000 */
function numFromYen(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw)
    .replace(/[¥￥,，円\s]/g, "")
    .replace(/[（(].*$/, ""); // 「（売上の25%）」のような注釈を除去
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** 本文から1パターン抽出 */
function matchOne(body, regex) {
  const m = body.match(regex);
  return m ? m[1].trim() : null;
}

// ────────────────────────────────────────────────────────────
// LINEログ → メッセージレコード列
// ────────────────────────────────────────────────────────────

/**
 * LINEテキストエクスポートを行ベースで走査して、
 * 日付ヘッダ／メッセージヘッダ（時刻\t送信者\t本文）を判定し、
 * 多行メッセージは継続行を本文に連結する。
 */
function* iterateMessages(text) {
  const lines = text.split(/\r?\n/);
  let currentDate = null;
  let current = null;

  const emit = function* () {
    if (current) {
      // 外側のダブルクォートを剥がす（末尾改行を考慮）
      let body = current.body;
      const trimmed = body.replace(/\s+$/, "");
      if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
        body = trimmed.slice(1, -1);
      } else {
        body = trimmed;
      }
      current.body = body;
      yield current;
      current = null;
    }
  };

  for (const line of lines) {
    // 日付ヘッダ："2026/04/01(水)" 等
    const dateMatch = line.match(
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})\([日月火水木金土]\)\s*$/,
    );
    if (dateMatch) {
      yield* emit();
      currentDate = `${dateMatch[1]}-${pad(dateMatch[2])}-${pad(dateMatch[3])}`;
      continue;
    }

    // メッセージヘッダ："22:03\tSender\tBody"
    const msgMatch = line.match(/^(\d{1,2}:\d{2})\t([^\t]+)\t(.*)$/);
    if (msgMatch) {
      yield* emit();
      current = {
        time: msgMatch[1],
        sender: msgMatch[2],
        body: msgMatch[3],
        line_date: currentDate,
      };
      continue;
    }

    // 継続行
    if (current) {
      current.body += "\n" + line;
    }
  }
  yield* emit();
}

// ────────────────────────────────────────────────────────────
// 日報の判定とパース
// ────────────────────────────────────────────────────────────

function isReportMessage(body) {
  return /営業後\s*日報/.test(body) || /【\s*🧾[^】]*日報\s*】/.test(body);
}

function parseHandover(body) {
  // 「📦 引き継ぎ」「🔄 引き継ぎ」「引き継ぎ事項」などをマーカーに、
  // 次の区切り（━━ / 📅 / EOF）まで取得
  const m = body.match(
    /(?:📦|🔄|🤝|📝)?\s*引[き継]継?ぎ事?項?[：:]\s*\n?([\s\S]*?)(?:\n━|\n📅|\n\[写真\]|$)/,
  );
  if (!m) return null;
  let t = m[1].trim();
  t = t.replace(/\[写真\]/g, "").trim();
  return t || null;
}

function parseRegister(body) {
  // 「レジ合計：￥30,000(確認OK)」「レジ合計：￥30,500(差異+500円)」
  const lineMatch = body.match(/レジ合計[：:]\s*(.*?)(?:\n|$)/);
  if (!lineMatch) return { total: null, ok: null, diff: null };
  const lineText = lineMatch[1];
  const total = numFromYen(lineText);
  if (/確認OK/.test(lineText) || /合致/.test(lineText)) {
    return { total, ok: true, diff: 0 };
  }
  const diffMatch = lineText.match(/差異\s*([+\-−ー]?[\d,，]+)/);
  if (diffMatch) {
    const cleaned = diffMatch[1]
      .replace(/[,，]/g, "")
      .replace(/[−ー]/g, "-")
      .replace(/[+]/g, "");
    const diff = parseInt(cleaned, 10);
    return { total, ok: false, diff: Number.isFinite(diff) ? diff : null };
  }
  return { total, ok: null, diff: null };
}

function parseInventory(body) {
  // ・手羽  30本 / ・手羽ギョーザ 0 / ・ポテト×2 等
  const tebasaki = matchOne(
    body,
    /(?:^|\n)\s*[・･]\s*手羽(?:先)?(?!ギ|餃)\s*[xX×]?\s*(\d+)/,
  );
  const gyoza = matchOne(
    body,
    /(?:^|\n)\s*[・･]\s*手羽(?:ギョーザ|餃子)\s*[xX×]?\s*(\d+)/,
  );
  const potato = matchOne(
    body,
    /(?:^|\n)\s*[・･]\s*ポテト\s*[xX×]?\s*(\d+)/,
  );
  const tornado = matchOne(
    body,
    /(?:^|\n)\s*[・･]\s*トルネード\s*[xX×]?\s*(\d+)/,
  );
  const negishio = matchOne(
    body,
    /(?:^|\n)\s*[・･]\s*ねぎ塩\s*[xX×]?\s*(\d+)/,
  );
  const toInt = (v) => (v === null ? null : parseInt(v, 10));
  return {
    remaining_tebasaki: toInt(tebasaki),
    remaining_gyoza: toInt(gyoza),
    remaining_potato: toInt(potato),
    remaining_tornado: toInt(tornado),
    remaining_negishio: toInt(negishio),
  };
}

function parseReport(msg) {
  const body = msg.body;
  const errors = [];

  const dateRaw = matchOne(body, /📅\s*日付\s*[：:]\s*(.+)/);
  const date = normalizeDate(dateRaw);
  if (!date) errors.push(`日付パース失敗: "${dateRaw}"`);

  const location_raw = matchOne(body, /📍\s*場所\s*[：:]\s*(.+)/);
  const staff_name_raw = matchOne(body, /👤\s*担当\s*[：:]\s*(.+)/);

  const sales_amount = numFromYen(
    matchOne(body, /本日売上\s*[：:]\s*(.+)/),
  );
  const cumulative_sales = numFromYen(
    matchOne(body, /累計売上\s*[：:]\s*(.+)/),
  );

  const cost_food = numFromYen(
    matchOne(body, /原価概算\s*[（(][^）)]*[）)]\s*[：:]\s*(.+)/),
  );
  const cost_labor = numFromYen(
    matchOne(body, /日当\s*[（(][^）)]*[）)]\s*[：:]\s*(.+)/),
  );
  const cost_rent = numFromYen(
    matchOne(body, /場代\s*[（(][^）)]*[）)]\s*[：:]\s*(.+)/),
  );
  const cost_other = numFromYen(
    matchOne(body, /その他(?:備品|経費)\s*[：:]\s*(.+)/),
  );
  const expenses_total = numFromYen(
    matchOne(body, /経費合計\s*[：:]\s*(.+)/),
  );

  const reg = parseRegister(body);
  const inv = parseInventory(body);
  const handover = parseHandover(body);

  if (!sales_amount && sales_amount !== 0) errors.push("売上抽出失敗");

  return {
    date,
    location_raw,
    staff_name_raw,
    sales_amount,
    cumulative_sales,
    cost_food,
    cost_labor,
    cost_rent,
    cost_other,
    expenses_total,
    register_total: reg.total,
    register_ok: reg.ok,
    register_diff: reg.diff,
    ...inv,
    handover,
    raw_message: body,
    line_timestamp: msg.line_date
      ? `${msg.line_date} ${msg.time}`
      : msg.time,
    line_sender: msg.sender,
    parse_errors: errors.length > 0 ? errors : undefined,
  };
}

// ────────────────────────────────────────────────────────────
// サマリー生成
// ────────────────────────────────────────────────────────────

function buildSummary(reports) {
  const total = reports.length;
  const errCount = reports.filter((r) => r.parse_errors).length;

  const byMonth = new Map();
  const byStaff = new Map();
  const byLoc = new Map();
  for (const r of reports) {
    const ym = r.date ? r.date.slice(0, 7) : "(日付不明)";
    byMonth.set(ym, (byMonth.get(ym) || 0) + 1);
    const s = r.staff_name_raw || "(不明)";
    byStaff.set(s, (byStaff.get(s) || 0) + 1);
    const l = r.location_raw || "(不明)";
    byLoc.set(l, (byLoc.get(l) || 0) + 1);
  }

  // 内部重複チェック（date+staff+locationが同じレコード）
  const dupKeys = new Map();
  for (const r of reports) {
    const k = `${r.date}|${r.staff_name_raw}|${r.location_raw}`;
    if (!dupKeys.has(k)) dupKeys.set(k, []);
    dupKeys.get(k).push(r);
  }
  const internalDups = [...dupKeys.entries()].filter(([, v]) => v.length > 1);

  const lines = [];
  lines.push("# LINEログ抽出サマリー");
  lines.push("");
  lines.push(`総件数: **${total}件**（うちパースエラー: ${errCount}件）`);
  lines.push("");

  lines.push("## 月別件数");
  lines.push("| 月 | 件数 |");
  lines.push("|----|------|");
  for (const [k, v] of [...byMonth.entries()].sort()) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");

  lines.push("## スタッフ別件数（生のテキスト）");
  lines.push("| 担当 | 件数 |");
  lines.push("|------|------|");
  for (const [k, v] of [...byStaff.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");

  lines.push("## 場所別件数（生のテキスト）");
  lines.push("| 場所 | 件数 |");
  lines.push("|------|------|");
  for (const [k, v] of [...byLoc.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");

  if (errCount > 0) {
    lines.push("## ⚠️ パース失敗の日報");
    lines.push("");
    for (const r of reports.filter((r) => r.parse_errors)) {
      lines.push(
        `- ${r.date ?? "?"} / ${r.staff_name_raw ?? "?"} / ${r.location_raw ?? "?"} → ${r.parse_errors.join(", ")}`,
      );
    }
    lines.push("");
  }

  if (internalDups.length > 0) {
    lines.push("## ⚠️ 内部重複候補（同じdate+staff+locationが複数件）");
    lines.push("");
    for (const [k, v] of internalDups) {
      lines.push(`- ${k} → ${v.length}件`);
    }
    lines.push("");
  }

  lines.push("## DB既存7件との重複候補");
  lines.push("");
  lines.push(
    "DB照合は別タスク（投入スクリプト実行時）に行います。投入時に `date+staff_name+location` の一致を再確認してから INSERT してください。",
  );

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────────────────────

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/extract-line-reports.mjs <input.txt>");
  process.exit(1);
}
const absInput = pathResolve(inputPath);
if (!existsSync(absInput)) {
  console.error(`入力ファイルが見つかりません: ${absInput}`);
  process.exit(1);
}

const text = readFileSync(absInput, "utf8");
const reports = [];
for (const msg of iterateMessages(text)) {
  if (!isReportMessage(msg.body)) continue;
  reports.push(parseReport(msg));
}

const outJson = pathResolve("data/extracted-reports.json");
const outMd = pathResolve("data/extracted-reports-summary.md");
writeFileSync(outJson, JSON.stringify(reports, null, 2), "utf8");
writeFileSync(outMd, buildSummary(reports), "utf8");

console.log(`✅ 抽出完了: ${reports.length}件`);
console.log(`   → ${outJson}`);
console.log(`   → ${outMd}`);
const errCount = reports.filter((r) => r.parse_errors).length;
if (errCount > 0) {
  console.log(`⚠️ パースエラー: ${errCount}件（summary.md で詳細確認）`);
}
