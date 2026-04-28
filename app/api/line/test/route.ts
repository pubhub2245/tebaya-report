import { NextRequest, NextResponse } from "next/server";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";

export const runtime = "nodejs";

/** テスト送信エンドポイント（CRON_SECRET で認証） */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const success = await sendLineGroupMessage(
    "🧪 テスト送信です\n\n手羽屋業務連絡Botが正常に動作しています！\n" +
      new Date().toLocaleString("ja-JP"),
  );

  return NextResponse.json({ success });
}
