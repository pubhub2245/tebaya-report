/**
 * 手書きの売上メモの写真から、商品ごとの本数と売上の合計を読み取る窓口。
 * 写真だけの日報（/report/photo）から呼ばれる。2026-11-07 追加。
 *
 * 指示文と読み取り結果の直し方は `lib/photoReport.ts` の1か所だけ。
 * 使うAIの鍵はレシート読み取りと同じ ANTHROPIC_API_KEY（新しい契約は無し）。
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { OCR_MODEL, stripDataUrl, type ReceiptMedia } from "@/lib/receiptOcr";
import { buildMemoPrompt, parseMemoText } from "@/lib/photoReport";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType, productNames } = await req.json();
    if (!image) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }
    const names: string[] = Array.isArray(productNames)
      ? productNames.map((n: unknown) => String(n)).filter(Boolean)
      : [];

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await anthropic.messages.create({
      model: OCR_MODEL,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: ((mediaType as ReceiptMedia) || "image/jpeg") as ReceiptMedia,
                data: stripDataUrl(image),
              },
            },
            { type: "text", text: buildMemoPrompt(names) },
          ],
        },
      ],
    });
    const raw = res.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");
    return NextResponse.json(parseMemoText(raw));
  } catch (err: any) {
    console.error("sales memo OCR error", err);
    return NextResponse.json({ error: err?.message || "ocr failed" }, { status: 500 });
  }
}
