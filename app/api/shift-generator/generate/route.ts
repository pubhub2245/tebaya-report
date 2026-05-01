import { NextRequest, NextResponse } from "next/server";
import { generateMonthlyShift } from "@/lib/shift-engine";

export const runtime = "nodejs";
// PDF解析(60秒前後) + エンジン処理を吸収
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
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
