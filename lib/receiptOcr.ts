/**
 * レシート写真を読み取る処理の本体。
 *
 * ■ なぜ別ファイルにしたか
 *   同じ読み取りを2か所から使うためです。
 *     ① 日報の入力（/api/ocr）… 新しく撮った写真を読む
 *     ② 過去の読み直し（/api/admin/reocr-receipts）… 昔の写真を読み直す
 *   指示文が2か所にあると、片方だけ直したときに読み取り方が食い違います。
 *   **指示文はこのファイルの1か所だけ**にしてあります。
 *
 * ■ 消費税について（CLAUDE.md 4-12）
 *   品物ごとの金額は**必ず税込**で返させます。
 *   それでも税抜で返ってきたときのために、支払合計と突き合わせて
 *   足りない分（＝消費税）を品物に配り直します（lib/receiptTax.ts）。
 */

import Anthropic from "@anthropic-ai/sdk";

import { reconcileItemsToTotal, type ReconcileResult } from "./receiptTax";

/** 読み取りに使うモデル */
export const OCR_MODEL = "claude-sonnet-4-6";

export type ReceiptMedia = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export type ReadReceiptResult = {
  items: { name: string; amount: number }[];
  /** レシートの支払合計（税込）。読めなければ 0 */
  total: number;
  /** レシートに書かれていた消費税額。読めなければ 0 */
  tax: number;
  /** 合計と品物の合計が合っているか（画面に出すため） */
  check: {
    itemsSum: number;
    adjustedSum: number;
    adjusted: boolean;
    matched: boolean;
    reason: ReconcileResult["reason"];
  };
  /** モデルが返した生の文字（デバッグ用） */
  raw: string;
};

/** 読み取りの指示文。★ここ1か所だけ */
export const OCR_PROMPT = `このレシート画像から、購入した各品目の「商品名」と「金額」、そして「支払合計」を読み取って、必ず以下のJSON形式で返してください。説明文や装飾は一切不要、JSONのみ返してください。

{
  "items": [
    {"name": "商品名1", "amount": 金額1},
    {"name": "商品名2", "amount": 金額2}
  ],
  "total": 支払合計,
  "tax": 消費税額,
  "itemsAreTaxIncluded": true または false
}

【ルール】
- 金額は数値のみ（¥マーク、カンマ不要）
- 商品名が読み取れない場合は「商品名？」と?マークを付ける
- 商品が1つだけでも必ずitems配列に入れる

【消費税について — ここが最重要】
- items の amount は **税込（消費税を含んだ金額）** で返してください。
- 日本のスーパーや業務用のお店のレシートは、品目の値段が
  「本体価格（税抜）」で並び、消費税が下にまとめて書かれていることが多いです。
  その場合は、消費税を各品目に金額の比で割り振って **税込に直してから** 返してください。
  （例：品目の合計10,000円、消費税800円 → 各品目を1.08倍にして返す）
- 品目の値段がもともと税込（内税）で書かれている場合は、そのまま返してください。
- itemsAreTaxIncluded には、レシートの品目欄が
  もともと税込表示だったかどうか（true/false）を入れてください。

【合計について — 必ず入れてください】
- total には、レシートの一番下の「合計」「お買上げ計」など、
  **実際に支払った金額（税込）** を入れてください。
- tax には、レシートに書かれている消費税額を入れてください。
  複数の税率（8%と10%）に分かれている場合は、その合計を入れてください。
  書かれていなければ 0 を入れてください。
- 値引き・割引がある場合は、値引き後の実際の支払額を total にしてください。`;

/** 「¥1,234」のような文字でも数値にする */
export function toAmount(v: unknown): number {
  if (typeof v === "number") return Math.round(v);
  return parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10) || 0;
}

/** data:image/...;base64,XXXX から XXXX の部分だけを取り出す */
export function stripDataUrl(image: string): string {
  return image.includes(",") ? image.split(",")[1] : image;
}

/**
 * レシート写真を1枚読み取る。
 *
 * 読み取れなかったときは items が空の結果を返す（例外は投げない）。
 */
export async function readReceipt(
  image: string,
  mediaType: ReceiptMedia = "image/jpeg",
  client?: Anthropic,
): Promise<ReadReceiptResult> {
  const anthropic =
    client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const res = await anthropic.messages.create({
    model: OCR_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: stripDataUrl(image) },
          },
          { type: "text", text: OCR_PROMPT },
        ],
      },
    ],
  });

  const raw = res.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");

  return parseReceiptText(raw);
}

/**
 * モデルが返した文字を、使える形に直す。
 * ★消費税の配り直しもここで行う（lib/receiptTax.ts）。
 */
export function parseReceiptText(raw: string): ReadReceiptResult {
  const empty: ReadReceiptResult = {
    items: [],
    total: 0,
    tax: 0,
    check: {
      itemsSum: 0,
      adjustedSum: 0,
      adjusted: false,
      matched: false,
      reason: "no_total",
    },
    raw,
  };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return empty;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.items || !Array.isArray(parsed.items)) return empty;

    const items = parsed.items.map((it: any) => ({
      name: String(it.name || "商品名？"),
      amount: toAmount(it.amount),
    }));
    const fixed = reconcileItemsToTotal(items, toAmount(parsed.total));

    return {
      items: fixed.items,
      total: fixed.total,
      tax: toAmount(parsed.tax),
      check: {
        itemsSum: fixed.itemsSum,
        adjustedSum: fixed.adjustedSum,
        adjusted: fixed.adjusted,
        matched: fixed.matched,
        reason: fixed.reason,
      },
      raw,
    };
  } catch {
    return empty;
  }
}
