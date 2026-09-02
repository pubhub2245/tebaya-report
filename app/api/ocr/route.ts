/**
 * レシート写真から金額を読み取る処理。
 *
 * ★2026-09 修正：以前は「品物の値段だけ」を拾っていたため、
 *   品物が税抜（本体価格）で書かれているレシートでは
 *   消費税ぶん（8〜10%）が毎回まるごと抜けていました。
 *   いまは「支払合計（税込）」も読み取り、足りない分を品物に割り振ります。
 *   計算は lib/receiptTax.ts（テストで固定してあります）。
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { reconcileItemsToTotal } from "@/lib/receiptTax";

export const runtime = "nodejs";
export const maxDuration = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();
    if (!image) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }

    const base64 = image.includes(",") ? image.split(",")[1] : image;
    const media: "image/jpeg" | "image/png" | "image/webp" | "image/gif" =
      (mediaType as any) || "image/jpeg";

    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: media, data: base64 },
            },
            {
              type: "text",
              text: `このレシート画像から、購入した各品目の「商品名」と「金額」、そして「支払合計」を読み取って、必ず以下のJSON形式で返してください。説明文や装飾は一切不要、JSONのみ返してください。

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
- 値引き・割引がある場合は、値引き後の実際の支払額を total にしてください。`,
            },
          ],
        },
      ],
    });

    const text = res.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");

    const toAmount = (v: any): number =>
      typeof v === "number"
        ? Math.round(v)
        : parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10) || 0;

    // Try to parse as JSON with items
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.items && Array.isArray(parsed.items)) {
          const items = parsed.items.map((it: any) => ({
            name: String(it.name || "商品名？"),
            amount: toAmount(it.amount),
          }));
          const total = toAmount(parsed.total);

          // ★消費税の取りこぼしを直す。
          //   品物の合計が支払合計より少なく、その差が消費税で説明できるなら、
          //   足りない分を品物に割り振って税込にする（lib/receiptTax.ts）。
          const fixed = reconcileItemsToTotal(items, total);

          return NextResponse.json({
            items: fixed.items,
            total: fixed.total,
            tax: toAmount(parsed.tax),
            // 画面が「合計と合っているか」を出すための情報
            check: {
              itemsSum: fixed.itemsSum,
              adjustedSum: fixed.adjustedSum,
              adjusted: fixed.adjusted,
              matched: fixed.matched,
              reason: fixed.reason,
            },
            raw: text,
          });
        }
      }
    } catch {}

    // Fallback: extract digits as total amount
    const digits = text.replace(/[^0-9]/g, "");
    const amount = digits ? parseInt(digits, 10) : 0;
    return NextResponse.json({ amount, raw: text });
  } catch (err: any) {
    console.error("OCR error", err);
    return NextResponse.json(
      { error: err?.message || "ocr failed" },
      { status: 500 }
    );
  }
}
