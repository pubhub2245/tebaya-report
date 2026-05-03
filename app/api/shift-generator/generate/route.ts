import { NextRequest, NextResponse } from "next/server";
import {
  generateMonthlyShift,
  generateMonthlyShiftFromParsed,
} from "@/lib/shift-engine";

export const runtime = "nodejs";
// PDF解析(60秒前後) + エンジン処理を吸収（旧フロー互換）。
// parsed 経由なら数秒で終わるが、互換のため上限は維持。
export const maxDuration = 120;

/**
 * 受付フォーマット：
 *   - application/json (新フロー):
 *       body: { year, month, parsed: { schedule, confirmed, warnings, parserSelfCheck, meta } }
 *       → 既にパース済みのため Claude API を再呼出しせずに自動生成
 *   - multipart/form-data (旧フロー):
 *       fields: pdf, year, month
 *       → サーバ側で PDF パース → 自動生成
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      const year = parseInt(String(body?.year ?? ""));
      const month = parseInt(String(body?.month ?? ""));
      const parsed = body?.parsed;

      if (!Number.isFinite(year) || year < 2020 || year > 2030) {
        return NextResponse.json(
          { success: false, error: "年が不正です（2020〜2030）" },
          { status: 400 },
        );
      }
      if (!Number.isFinite(month) || month < 1 || month > 12) {
        return NextResponse.json(
          { success: false, error: "月が不正です（1〜12）" },
          { status: 400 },
        );
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !parsed.schedule ||
        !parsed.confirmed ||
        !parsed.meta
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "parsed が不正です（schedule / confirmed / meta が必要）",
          },
          { status: 400 },
        );
      }

      const result = await generateMonthlyShiftFromParsed(
        {
          schedule: parsed.schedule,
          confirmed: parsed.confirmed,
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
          meta: parsed.meta,
        },
        year,
        month,
      );
      return NextResponse.json({ success: true, data: result });
    }

    // 旧フロー: PDF を直接受け取る
    const formData = await request.formData();
    const pdfFile = formData.get("pdf") as File | null;
    const yearStr = formData.get("year");
    const monthStr = formData.get("month");
    const year = parseInt((yearStr as string) ?? "");
    const month = parseInt((monthStr as string) ?? "");

    if (!pdfFile) {
      return NextResponse.json(
        { success: false, error: "PDFファイルが必要です" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(year) || year < 2020 || year > 2030) {
      return NextResponse.json(
        { success: false, error: "年が不正です（2020〜2030）" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { success: false, error: "月が不正です（1〜12）" },
        { status: 400 },
      );
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await generateMonthlyShift(buffer, year, month);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[shift-generator/generate]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "シフト生成に失敗しました",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
