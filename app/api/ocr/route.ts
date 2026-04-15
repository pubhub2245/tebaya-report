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
      max_tokens: 64,
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
              text: "このレシートの合計金額を数字のみで返してください。カンマや円マーク、説明文は不要です。数字だけ。",
            },
          ],
        },
      ],
    });

    const text = res.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");
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
