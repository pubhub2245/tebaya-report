import { serverClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { probeShiftsTenantState, scopeShiftsQuery } from "@/lib/shiftScope";
import { TEBAYA_SCOPE } from "@/lib/tenantScope";

export const runtime = "nodejs";

const supabase = serverClient();

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") ?? "");
  const month = parseInt(searchParams.get("month") ?? "");

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json(
      { exists: false, count: 0, error: "year/month は整数で指定してください" },
      { status: 400 },
    );
  }

  const startDate = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  // 手羽屋のぶんだけ（印が空＝手羽屋。欄がまだ無い倉庫では何も足さない。lib/shiftScope.ts）
  const { data, error } = await scopeShiftsQuery<any>(
    supabase
      .from("shifts")
      .select("date")
      .eq("status", "draft")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true }) as any,
    TEBAYA_SCOPE,
    await probeShiftsTenantState(supabase),
  );

  if (error) {
    return NextResponse.json(
      { exists: false, count: 0, error: error.message },
      { status: 500 },
    );
  }

  const count = data?.length ?? 0;
  if (count === 0) {
    return NextResponse.json({ exists: false, count: 0 });
  }

  return NextResponse.json({
    exists: true,
    count,
    dateRange: {
      earliest: data![0].date,
      latest: data![data!.length - 1].date,
    },
  });
}
