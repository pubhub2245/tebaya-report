/**
 * ながやまグループの催事スケジュールPDFを Claude API で解析するモジュール。
 *
 * Python 版では pdfplumber で表抽出していたが、JS 版では Claude API に
 * PDFを直接渡して構造化JSONで受け取る方式を採用。
 *
 * モデル: claude-opus-4-7（表構造の認識精度優先）
 *   月1回運用なのでコスト差は許容（PDF1枚あたり数円）。
 *
 * SDK 0.32.1 のメインスコープには document ブロックの型がまだ無いため、
 * content 配列を `as any` でキャストしている（PDF入力はGA済み）。
 */

import Anthropic from "@anthropic-ai/sdk";
import { NAGAYAMA_TARGETS } from "./shift-config";

const MODEL = "claude-opus-4-7";
// 11店舗 × 約61日（5月+6月）× JSON 1行 で約4000トークン超に膨らむため、
// 月落ちプロンプトの切り替えで出力量が増えた。安全マージン込みで32K。
const MAX_TOKENS = 32000;

export type NagayamaSchedule = {
  [storeName: string]: {
    [dateISO: string]: string | null;
  };
};

export interface NagayamaParseResult {
  schedule: NagayamaSchedule;
  /** 店舗 → ISO日付（"2026-05-01" 等）の配列。「手羽屋」と書かれた確定済み出店日 */
  confirmed: Record<string, string[]>;
  meta: {
    detectedYear: number;
    detectedMonths: number[];
    detectedStores: string[];
    rawJson: string;
  };
}

/**
 * schedule から「手羽屋」表記の確定日を店舗別に抽出。
 * "手羽屋 / 他業者" のような複合表記にも対応するため includes で判定する。
 */
function extractTebayaConfirmedDays(
  schedule: NagayamaSchedule,
): Record<string, string[]> {
  const confirmed: Record<string, string[]> = {};
  for (const [store, dates] of Object.entries(schedule)) {
    const confirmedDates: string[] = [];
    for (const [dateISO, vendor] of Object.entries(dates)) {
      if (vendor && vendor.includes("手羽屋")) {
        confirmedDates.push(dateISO);
      }
    }
    confirmedDates.sort();
    confirmed[store] = confirmedDates;
  }
  return confirmed;
}

// ---------------------------------------------------------------------------
// 店舗名の正規化
// ---------------------------------------------------------------------------

/**
 * Claude が PDF 表記そのまま返してくる店舗名を、shift-engine が扱う統一形へ。
 * マップ未登録の店舗名はそのまま保持して後段で扱えるようにする。
 */
const STORE_NORMALIZE: Record<string, string> = {
  志比田: "志比田",
  "若葉（店頭）": "若葉店",
  "若葉(店頭)": "若葉店",
  "山田（店頭）": "山田店",
  "山田(店頭)": "山田店",
  "鷹尾（店頭）": "鷹尾店",
  "鷹尾(店頭)": "鷹尾店",
  "三股（店頭）": "三股店",
  "三股(店頭)": "三股店",
  "都北（店頭）": "都北店",
  "都北(店頭)": "都北店",
};

function stripWhitespace(s: string): string {
  return s.replace(/[\s　\r\n\t]+/g, "");
}

function normalizeStoreName(raw: string): string {
  if (!raw) return raw;
  const stripped = stripWhitespace(raw);
  // 直接マッチ
  if (STORE_NORMALIZE[stripped]) return STORE_NORMALIZE[stripped];
  // マップ側のキーもホワイトスペース除去して再マッチ
  for (const [k, v] of Object.entries(STORE_NORMALIZE)) {
    if (stripWhitespace(k) === stripped) return v;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// プロンプト
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  "あなたはPDFから表データを正確に抽出して構造化JSONで返すアシスタントです。",
  "余計な説明は一切付けず、JSONのみを返してください。",
].join("\n");

function buildInstructionText(year: number): string {
  return [
    "このPDFは「ながやま」グループの催事スケジュール表です。",
    "店舗ごとに、各日付にどの出店者が予約しているかが書かれています。",
    "",
    "【極めて重要：PDFの構造を必ず理解すること】",
    "このPDFには、複数の月の表が縦に並んでいる可能性が非常に高いです。",
    "具体例：ページの上半分に5月の表（5/1〜5/31）、下半分に6月の表（6/1〜6/30）。",
    "各表は完全に独立した別の表として扱われています。",
    "1つ目の表を読み終えたら、必ずページをスクロールダウンして",
    "「次の月の表」が無いか最後まで確認してください。",
    "1つの月だけ抽出して終わりにすることは絶対にしないでください。",
    "",
    "以下のルールでJSON形式で抽出してください：",
    "",
    `1. PDF内の全ての表を見つけて、それぞれを完全に抽出する`,
    `2. 各表の最上段に日付（例: "5/1"〜"5/31" や "6/1"〜"6/30"）が並んでいる`,
    `3. 表の左端に店舗名がある（例: "三股（店頭）", "鷹尾（店頭）", "若葉（店頭）", "山田（店頭）", "志比田", "都北（店頭）"）`,
    "4. 店舗名は改行や全角括弧などの揺れがあるが、できるだけPDFの表記そのまま抽出",
    "5. 各セルに出店者名が書かれていれば、その名前を文字列で記録（改行は空白に置換）",
    "6. セルが空欄の場合は null を記録",
    `7. 同じ日に複数の出店者が並んでいる場合は " / " で結合した1つの文字列にする`,
    "",
    "【出力フォーマット】",
    "{",
    `  "year": ${year},`,
    `  "months": [5, 6],`,
    `  "schedule": {`,
    `    "店舗名1": {`,
    `      "${year}-05-01": "山田商店",`,
    `      "${year}-05-02": null,`,
    `      ...`,
    `      "${year}-05-31": "鈴木屋",`,
    `      "${year}-06-01": null,`,
    `      ...`,
    `      "${year}-06-30": "田中屋"`,
    `    },`,
    `    "店舗名2": { ... }`,
    "  }",
    "}",
    "",
    "【出力前の自己チェック手順】（必ず守ること）",
    "- PDFに何個の表があったか数える",
    "- 各表が何月の表だったか確認する",
    "- months 配列に列挙したすべての月について、schedule の各店舗に",
    "  その月の全日付（1日〜末日）のエントリが含まれているか確認する",
    "- 例えば months: [5, 6] と宣言したら、schedule の各店舗には",
    `  "${year}-05-01" 〜 "${year}-05-31" と "${year}-06-01" 〜 "${year}-06-30" の両方が`,
    "  入っていなければならない",
    "- もし months に書いたのに schedule にデータがない月があれば、",
    "  もう一度PDFをスキャンしてその月の表を探すこと",
    "",
    "【注意】",
    `- 年は year=${year} を使用すること`,
    "- JSON以外の説明文・コードフェンス・前置きは一切含めない",
    "- JSONとして必ずパース可能な形式で返す",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// バリデーションヘルパー
// ---------------------------------------------------------------------------

function getLastDayOfMonth(year: number, month: number): string {
  // month は 1-indexed (5月=5)、Date 構築では month に 0-indexed を渡す。
  // new Date(year, month, 0) は前月の末日 = month 月の末日。
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * months で宣言された月のデータが、実際に schedule に含まれているかチェック。
 * 月初・月末・15日のいずれかが見つかればOKとする緩めの判定（1日休館等の保険）。
 */
function validateMonthsCoverage(parsed: {
  year: number;
  months: number[];
  schedule: Record<string, Record<string, unknown>>;
}): void {
  const { year, months, schedule } = parsed;
  const allDates = new Set<string>();
  for (const storeData of Object.values(schedule)) {
    for (const dateKey of Object.keys(storeData)) {
      allDates.add(dateKey);
    }
  }

  for (const month of months) {
    const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = getLastDayOfMonth(year, month);

    if (!allDates.has(firstDay) && !allDates.has(lastDay)) {
      throw new Error(
        `バリデーションエラー: months に ${month} 月が含まれているが、` +
          `schedule に ${month} 月のデータが見つかりません。` +
          `PDFの解析が不完全な可能性があります。`,
      );
    }

    const midDay = `${year}-${String(month).padStart(2, "0")}-15`;
    if (!allDates.has(midDay)) {
      console.warn(
        `警告: ${year}年${month}月15日のデータが schedule に見つかりません。` +
          `部分的な抽出の可能性あり。`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

/**
 * ながやま催事スケジュールPDFを解析する
 *
 * @param pdfBuffer - PDFのバイナリBuffer
 * @param hint - 年月のヒント（PDFは月日のみで年情報を持たないことがあるため）
 */
export async function parseNagayamaPDF(
  pdfBuffer: Buffer,
  hint?: { year?: number },
): Promise<NagayamaParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が環境変数に設定されていません");
  }
  const year = hint?.year ?? new Date().getFullYear();
  const base64 = pdfBuffer.toString("base64");
  const client = new Anthropic({ apiKey });

  // SDK 0.32.1 の stable types に document ブロックが無いので as any。
  // API 自体は PDF GA 済みのため動作する。
  const userContent: any = [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64,
      },
    },
    {
      type: "text",
      text: buildInstructionText(year),
    },
  ];

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = message.content.find((b: any) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!textBlock) {
    throw new Error("Claude APIレスポンスにテキストブロックがありません");
  }

  const cleaned = textBlock.text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(
      `Claude APIレスポンスのJSONパースに失敗: ${e?.message}\n--- raw (先頭500文字) ---\n${cleaned.slice(0, 500)}`,
    );
  }

  // ----- バリデーション -----
  if (typeof parsed.year !== "number") {
    throw new Error(`year が数値ではありません (got: ${typeof parsed.year})`);
  }
  if (
    !Array.isArray(parsed.months) ||
    parsed.months.length === 0 ||
    !parsed.months.every(
      (m: any) => Number.isInteger(m) && m >= 1 && m <= 12,
    )
  ) {
    throw new Error(
      `months が不正です（1〜12の整数の非空配列が必要）: ${JSON.stringify(parsed.months)}`,
    );
  }
  if (
    !parsed.schedule ||
    typeof parsed.schedule !== "object" ||
    Array.isArray(parsed.schedule) ||
    Object.keys(parsed.schedule).length === 0
  ) {
    throw new Error("schedule が空、またはオブジェクトではありません");
  }
  for (const [store, dates] of Object.entries(parsed.schedule)) {
    if (!dates || typeof dates !== "object" || Array.isArray(dates)) {
      throw new Error(`schedule[${store}] がオブジェクトではありません`);
    }
    for (const dateKey of Object.keys(dates)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        throw new Error(
          `schedule[${store}] の日付キーがYYYY-MM-DD形式ではありません: ${dateKey}`,
        );
      }
    }
  }

  // months と schedule の整合性チェック（複数月PDFで月落ちを検知）
  validateMonthsCoverage({
    year: parsed.year,
    months: parsed.months,
    schedule: parsed.schedule,
  });

  // ----- 店舗名の正規化 -----
  const normalizedSchedule: NagayamaSchedule = {};
  for (const rawName of Object.keys(parsed.schedule)) {
    const norm = normalizeStoreName(rawName);
    const datesRaw = parsed.schedule[rawName] as Record<string, unknown>;
    const datesNorm: Record<string, string | null> = {};
    for (const [dk, v] of Object.entries(datesRaw)) {
      if (v === null || v === undefined) {
        datesNorm[dk] = null;
      } else {
        const s = String(v).replace(/[\r\n]+/g, " ").trim();
        datesNorm[dk] = s.length > 0 ? s : null;
      }
    }
    // 同一の正規化名が複数の生キーから出る場合はマージ
    if (normalizedSchedule[norm]) {
      Object.assign(normalizedSchedule[norm], datesNorm);
    } else {
      normalizedSchedule[norm] = datesNorm;
    }
  }

  // ----- ながやまターゲットが少なくとも1つ含まれるか（部分一致）-----
  const scheduleKeys = Object.keys(normalizedSchedule);
  const hit = NAGAYAMA_TARGETS.some((target) => {
    const core = target.replace(/店$/, ""); // 「鷹尾店」→「鷹尾」
    return scheduleKeys.some((k) => k.includes(core));
  });
  if (!hit) {
    throw new Error(
      `PDFの解析に失敗した可能性があります（NAGAYAMA_TARGETS店舗が1つも見つかりません）。検出店舗: ${scheduleKeys.join(", ")}`,
    );
  }

  return {
    schedule: normalizedSchedule,
    confirmed: extractTebayaConfirmedDays(normalizedSchedule),
    meta: {
      detectedYear: parsed.year,
      detectedMonths: parsed.months as number[],
      detectedStores: scheduleKeys,
      rawJson: cleaned,
    },
  };
}
