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
  cancelled: number;
};

/**
 * 「シフトはあるのに日報も中止記録も無い店舗」を返す。
 *
 * 提出済み判定：
 *   - daily_reports に該当(date,location)のレコードがあれば「提出済み」
 *   - 上記が無くても daily_cancellations に該当(date,location,staff)のレコードがあれば「中止扱い＝催促不要」
 *   - どちらも無ければ「未提出」として missing に追加
 *
 * staff_name 文字列の分割は store-scoped で行わないが、shifts.staff_name に
 * 「じゅん&かずき」等の連名が入っている場合は「&」で分割し、いずれかが
 * 中止記録に一致すれば中止扱いにする（連名のうち一方だけ中止登録という運用に対応）。
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
    return { missing: [], total: 0, submitted: 0, cancelled: 0 };
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

  // 中止記録：(business_date, location, staff_name_raw) を照合キーとする
  const { data: cancellations } = await supabase
    .from("daily_cancellations")
    .select("location, staff_name_raw")
    .eq("business_date", date);

  const cancelledLocs = new Set<string>();
  const cancelledLocStaff = new Set<string>();
  for (const c of (cancellations || []) as any[]) {
    const normLoc = normalizeLocationName(c.location || "");
    if (!normLoc) continue;
    cancelledLocs.add(normLoc);
    const normStaff = (c.staff_name_raw || "").trim();
    cancelledLocStaff.add(`${normLoc}|${normStaff}`);
  }

  const missing: MissingLocation[] = [];
  let submitted = 0;
  let cancelled = 0;

  for (const s of shifts) {
    const locName = (s.locations as any)?.name || "不明";
    const normalized = normalizeLocationName(locName);

    if (reportedLocs.has(normalized)) {
      submitted++;
      continue;
    }

    // 中止記録チェック：shiftに記録された担当者（連名は&で分割）のいずれか1人でも
    // 同じ(date,location,staff)で中止記録があれば中止扱い
    const staffParts = ((s.staff_name as string) || "")
      .split("&")
      .map((n) => n.trim())
      .filter(Boolean);

    const matchesCancellation =
      staffParts.length === 0
        ? cancelledLocs.has(normalized)
        : staffParts.some((p) =>
            cancelledLocStaff.has(`${normalized}|${p}`),
          );

    if (matchesCancellation) {
      cancelled++;
      continue;
    }

    missing.push({
      location_name: locName,
      staff_hint: (s.staff_name as string) || "未定",
    });
  }

  return {
    missing,
    total: shifts.length,
    submitted,
    cancelled,
  };
};
