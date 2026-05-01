import { NextRequest, NextResponse } from "next/server";
import {
  sendCancellationNotification,
  type CancellationNotificationInput,
} from "@/lib/cancellation/notify";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 出店中止のLINE通知を送るAPI。
 * ?dryRun=1 を付けるとLINE実送信せず console.log だけ行う。
 */
export async function POST(req: NextRequest) {
  try {
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
    const body = (await req.json()) as CancellationNotificationInput;

    if (!body?.business_date || !body?.location || !body?.staff_name_raw) {
      return NextResponse.json(
        { ok: false, error: "business_date, location, staff_name_raw は必須" },
        { status: 400 },
      );
    }

    const { sent, message } = await sendCancellationNotification(body, {
      dryRun,
    });

    return NextResponse.json({ ok: true, sent, dryRun, message });
  } catch (e: any) {
    console.error("[cancellation-notify] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
