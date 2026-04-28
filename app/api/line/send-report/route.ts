import { NextRequest, NextResponse } from "next/server";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text は必須です" },
        { status: 400 },
      );
    }

    const ok = await sendLineGroupMessage(text);
    return NextResponse.json({ ok });
  } catch (err: any) {
    console.error("[LINE送信API] エラー:", err?.message || err);
    return NextResponse.json({ ok: false, error: "送信に失敗しました" }, { status: 500 });
  }
}
