import { createClient } from "@supabase/supabase-js";
import { normalizeLocationName } from "./locationMatcher";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export type MissingLocation = {
  location_name: string;
  staff_hint: string;
};

export type MissingReportSummary = {
  missing: MissingLocation[];
  total: number;
  submitted: number;
};

/**
 * 「シフトはあるのに日報が出ていない店舗」を返す。
 * staff_name 文字列の分割は行わず、店舗ベースで判定するため、
 * 売り子・応援メンバーが連名で記録されているケースでも
 * 「メイン担当が日報を1件出していれば提出済み扱い」になる。
 */
export const getMissingReportLocations = async (
  date: string,
): Promise<MissingReportSummary> => {
  const { data: shifts } = await supabase
    .from("shifts")
    .select("staff_name, locations(name)")
    .eq("date", date)
    .eq("status", "published");

  if (!shifts || shifts.length === 0) {
    return { missing: [], total: 0, submitted: 0 };
  }

  const { data: reports } = await supabase
    .from("daily_reports")
    .select("location")
    .eq("date", date);

  const reportedLocs = new Set(
    (reports || [])
      .map((r: any) => normalizeLocationName(r.location || ""))
      .filter((s) => s.length > 0),
  );

  const missing: MissingLocation[] = [];
  for (const s of shifts) {
    const locName = (s.locations as any)?.name || "不明";
    const normalized = normalizeLocationName(locName);
    if (!reportedLocs.has(normalized)) {
      missing.push({
        location_name: locName,
        staff_hint: (s.staff_name as string) || "未定",
      });
    }
  }

  return {
    missing,
    total: shifts.length,
    submitted: shifts.length - missing.length,
  };
};
