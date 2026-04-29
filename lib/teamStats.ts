import { supabase } from "./supabase";
import { normalizeLocationName } from "./locationMatcher";

export type UnitKey = 1 | 2 | null;

export type TeamStats = {
  unit: UnitKey;
  unitLabel: string;
  totalSales: number;
  reportCount: number;
  averageSalesPerReport: number;
  totalTarget: number;
  achievementRate: number;
};

export type StaffStats = {
  staffName: string;
  unit: UnitKey;
  unitLabel: string;
  totalSales: number;
  reportCount: number;
  averageSalesPerReport: number;
};

export type LocationStats = {
  locationName: string;
  primaryUnit: UnitKey;
  primaryUnitLabel: string;
  totalSales: number;
  reportCount: number;
  totalTarget: number;
  achievementRate: number;
};

export type TeamLocationCell = {
  totalSales: number;
  reportCount: number;
};

export type TeamLocationCross = {
  locationName: string;
  totalTarget: number; // 1出店あたり目標（locationsテーブルの target）
  cells: Record<"1" | "2" | "null", TeamLocationCell>;
  total: TeamLocationCell;
};

const UNIT_LABEL: Record<string, string> = {
  "1": "1番隊",
  "2": "2番隊",
  null: "応援・その他",
};

const labelOf = (unit: UnitKey): string =>
  unit === null ? UNIT_LABEL.null : UNIT_LABEL[String(unit)];

const unitKey = (raw: number | string | null | undefined): UnitKey => {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (n === 1) return 1;
  if (n === 2) return 2;
  return null;
};

type ReportRow = {
  date: string;
  location: string;
  staff_name: string;
  sales_amount: number;
  unit_number: number | string | null;
};

type LocationRow = {
  name: string;
  target: number | null;
};

async function fetchReportsAndLocations(startDate: string, endDate: string) {
  const [r, l] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("date, location, staff_name, sales_amount, unit_number")
      .gte("date", startDate)
      .lte("date", endDate),
    supabase.from("locations").select("name, target"),
  ]);
  if (r.error) throw r.error;
  if (l.error) throw l.error;
  return {
    reports: (r.data as ReportRow[]) || [],
    locations: (l.data as LocationRow[]) || [],
  };
}

function buildTargetLookup(locations: LocationRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const loc of locations) {
    const t = loc.target ?? 0;
    if (t > 0) map.set(normalizeLocationName(loc.name), t);
  }
  return map;
}

/** 番隊別集計（必ず3カテゴリ：1, 2, null を返す） */
export const getTeamStatsForPeriod = async (
  startDate: string,
  endDate: string,
): Promise<TeamStats[]> => {
  const { reports, locations } = await fetchReportsAndLocations(
    startDate,
    endDate,
  );
  const targetLookup = buildTargetLookup(locations);

  const init = (unit: UnitKey): TeamStats => ({
    unit,
    unitLabel: labelOf(unit),
    totalSales: 0,
    reportCount: 0,
    averageSalesPerReport: 0,
    totalTarget: 0,
    achievementRate: 0,
  });
  const buckets: Record<string, TeamStats> = {
    "1": init(1),
    "2": init(2),
    null: init(null),
  };

  for (const r of reports) {
    const unit = unitKey(r.unit_number);
    const k = unit === null ? "null" : String(unit);
    const b = buckets[k];
    b.totalSales += r.sales_amount || 0;
    b.reportCount += 1;
    const t = targetLookup.get(normalizeLocationName(r.location));
    if (t && t > 0) b.totalTarget += t;
  }

  for (const k of Object.keys(buckets)) {
    const b = buckets[k];
    b.averageSalesPerReport =
      b.reportCount > 0 ? Math.round(b.totalSales / b.reportCount) : 0;
    b.achievementRate =
      b.totalTarget > 0
        ? Math.round((b.totalSales / b.totalTarget) * 1000) / 10
        : 0;
  }

  return [buckets["1"], buckets["2"], buckets["null"]];
};

/** スタッフ別集計（管理者用） */
export const getStaffStatsForPeriod = async (
  startDate: string,
  endDate: string,
): Promise<StaffStats[]> => {
  const { reports } = await fetchReportsAndLocations(startDate, endDate);

  const map = new Map<string, StaffStats>();
  for (const r of reports) {
    const cur = map.get(r.staff_name) || {
      staffName: r.staff_name,
      unit: unitKey(r.unit_number),
      unitLabel: labelOf(unitKey(r.unit_number)),
      totalSales: 0,
      reportCount: 0,
      averageSalesPerReport: 0,
    };
    cur.totalSales += r.sales_amount || 0;
    cur.reportCount += 1;
    map.set(r.staff_name, cur);
  }
  for (const v of map.values()) {
    v.averageSalesPerReport =
      v.reportCount > 0 ? Math.round(v.totalSales / v.reportCount) : 0;
  }
  return [...map.values()].sort((a, b) => b.totalSales - a.totalSales);
};

/** 店舗別集計（管理者用） */
export const getLocationStatsForPeriod = async (
  startDate: string,
  endDate: string,
): Promise<LocationStats[]> => {
  const { reports, locations } = await fetchReportsAndLocations(
    startDate,
    endDate,
  );
  const targetLookup = buildTargetLookup(locations);

  type Bucket = {
    locationName: string;
    totalSales: number;
    reportCount: number;
    totalTarget: number;
    unitVotes: Map<UnitKey, number>;
  };
  const map = new Map<string, Bucket>();
  for (const r of reports) {
    const cur = map.get(r.location) || {
      locationName: r.location,
      totalSales: 0,
      reportCount: 0,
      totalTarget: 0,
      unitVotes: new Map<UnitKey, number>(),
    };
    cur.totalSales += r.sales_amount || 0;
    cur.reportCount += 1;
    const t = targetLookup.get(normalizeLocationName(r.location));
    if (t && t > 0) cur.totalTarget += t;
    const u = unitKey(r.unit_number);
    cur.unitVotes.set(u, (cur.unitVotes.get(u) || 0) + 1);
    map.set(r.location, cur);
  }

  const result: LocationStats[] = [];
  for (const b of map.values()) {
    let primary: UnitKey = null;
    let max = -1;
    for (const [u, v] of b.unitVotes) {
      if (v > max) {
        max = v;
        primary = u;
      }
    }
    result.push({
      locationName: b.locationName,
      primaryUnit: primary,
      primaryUnitLabel: labelOf(primary),
      totalSales: b.totalSales,
      reportCount: b.reportCount,
      totalTarget: b.totalTarget,
      achievementRate:
        b.totalTarget > 0
          ? Math.round((b.totalSales / b.totalTarget) * 1000) / 10
          : 0,
    });
  }
  return result.sort((a, b) => b.totalSales - a.totalSales);
};

/** 番隊×店舗 クロス集計 */
export const getTeamLocationCrossForPeriod = async (
  startDate: string,
  endDate: string,
): Promise<TeamLocationCross[]> => {
  const { reports, locations } = await fetchReportsAndLocations(
    startDate,
    endDate,
  );
  const targetLookup = buildTargetLookup(locations);

  const empty = (): TeamLocationCell => ({ totalSales: 0, reportCount: 0 });
  const map = new Map<string, TeamLocationCross>();
  for (const r of reports) {
    const cur =
      map.get(r.location) ||
      ({
        locationName: r.location,
        totalTarget:
          targetLookup.get(normalizeLocationName(r.location)) || 0,
        cells: { "1": empty(), "2": empty(), null: empty() },
        total: empty(),
      } as TeamLocationCross);
    const u = unitKey(r.unit_number);
    const k = (u === null ? "null" : String(u)) as "1" | "2" | "null";
    cur.cells[k].totalSales += r.sales_amount || 0;
    cur.cells[k].reportCount += 1;
    cur.total.totalSales += r.sales_amount || 0;
    cur.total.reportCount += 1;
    map.set(r.location, cur);
  }
  return [...map.values()].sort((a, b) => b.total.totalSales - a.total.totalSales);
};

/** YYYY-MM → 開始日・終了日 */
export const monthRange = (ym: string): { start: string; end: string } => {
  const [y, m] = ym.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
};

/** 現在のYYYY-MM（JST基準） */
export const currentYM = (): string => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** YYYY-MM の前月 */
export const prevYM = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const labelYM = (ym: string): string => {
  const [y, m] = ym.split("-");
  return `${y}年${parseInt(m, 10)}月`;
};
