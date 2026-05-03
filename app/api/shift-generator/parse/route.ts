import { NextRequest, NextResponse } from "next/server";
import { parseNagayamaPDF } from "@/lib/nagayama-parser";

export const runtime = "nodejs";
// PDF解析（Claude API）に60秒前後かかるので Vercel タイムアウトを延長
export const maxDuration = 120;

/**
 * PDF をパースして schedule + confirmed + parserSelfCheck を返す。
 * 自動生成は別エンドポイント (/api/shift-generator/generate) で実施する。
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const pdfFile = formData.get("pdf") as File | null;
    const yearStr = formData.get("year");
    const year = parseInt((yearStr as string) ?? "");

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

    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsed = await parseNagayamaPDF(buffer, { year });

    return NextResponse.json({
      success: true,
      data: {
        schedule: parsed.schedule,
        confirmed: parsed.confirmed,
        warnings: parsed.warnings,
        parserSelfCheck: parsed.parserSelfCheck,
        meta: {
          detectedYear: parsed.meta.detectedYear,
          detectedMonths: parsed.meta.detectedMonths,
          detectedStores: parsed.meta.detectedStores,
          // rawJson はサイズが大きいので省略
        },
      },
    });
  } catch (error) {
    console.error("[shift-generator/parse]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "PDF解析に失敗しました",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
