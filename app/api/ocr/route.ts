import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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
              text: `このレシート画像から、購入した各品目の「商品名」と「金額」を読み取って、必ず以下のJSON形式で返してください。説明文や装飾は一切不要、JSONのみ返してください。

{
  "items": [
    {"name": "商品名1", "amount": 金額1},
    {"name": "商品名2", "amount": 金額2}
  ],
  "total": 合計金額
}

【ルール】
- 金額は数値のみ（¥マーク、カンマ不要）
- 商品名が読み取れない場合は「商品名？」と?マークを付ける
- 税金や割引などの明細行は含めない（あくまで購入した商品のみ）
- 商品が1つだけでも必ずitems配列に入れる
- 合計金額も必ずtotalに入れる`,
            },
          ],
        },
      ],
    });

    const text = res.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");

    // Try to parse as JSON with items
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.items && Array.isArray(parsed.items)) {
          return NextResponse.json({
            items: parsed.items.map((it: any) => ({
              name: String(it.name || "商品名？"),
              amount: typeof it.amount === "number" ? it.amount : parseInt(String(it.amount).replace(/[^0-9]/g, ""), 10) || 0,
            })),
            total: typeof parsed.total === "number" ? parsed.total : parseInt(String(parsed.total).replace(/[^0-9]/g, ""), 10) || 0,
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
