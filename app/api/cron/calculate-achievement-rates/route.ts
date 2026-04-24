import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeLocationName } from "@/lib/locationMatcher";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getDayType(dateStr: string): "weekday" | "weekend" {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  return dow === 0 || dow === 6 ? "weekend" : "weekday";
}

export async function GET(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const triggeredBy =
    req.nextUrl.searchParams.get("triggered_by") || "cron";

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Get 60 days of interim reports
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sinceDate = sixtyDaysAgo.toISOString().slice(0, 10);

    const { data: interims, error: intErr } = await supabase
      .from("interim_reports")
      .select("id, created_at, location, report_hour, current_sales")
      .gte("created_at", sinceDate + "T00:00:00");
    if (intErr) throw intErr;

    // 2. Get all daily reports for the same period (final sales)
    const { data: dailies, error: dayErr } = await supabase
      .from("daily_reports")
      .select("date, location, sales_amount")
      .gte("date", sinceDate);
    if (dayErr) throw dayErr;

    // 3. Get locations for name -> id mapping
    const { data: locs, error: locErr } = await supabase
      .from("locations")
      .select("id, name");
    if (locErr) throw locErr;

    // locations テーブルから正規化名 → id のマッピングを構築
    const locMap = new Map<string, string>();
    (locs || []).forEach((l: any) => locMap.set(normalizeLocationName(l.name), String(l.id)));

    // Build daily sales lookup: "date|normalizedLocation" -> sales_amount
    // 正規化した店舗名をキーにすることで表記揺れを吸収
    const dailyLookup = new Map<string, number>();
    (dailies || []).forEach((d: any) => {
      const key = `${d.date}|${normalizeLocationName(d.location)}`;
      dailyLookup.set(key, d.sales_amount);
    });

    // ログ: 店舗名のユニーク値一覧（デバッグ用）
    const dailyLocations = [...new Set((dailies || []).map((d: any) => d.location))];
    const interimLocations = [...new Set((interims || []).map((ir: any) => ir.location))];
    console.log("[到達率計算] daily_reports の店舗名:", dailyLocations);
    console.log("[到達率計算] interim_reports の店舗名:", interimLocations);
    console.log("[到達率計算] locations テーブルの店舗名:", (locs || []).map((l: any) => l.name));

    // 4. Calculate rates for each interim report
    type RateEntry = {
      locationId: string;
      dayType: "weekday" | "weekend";
      hour: number;
      rate: number;
    };

    const entries: RateEntry[] = [];
    let matchedCount = 0;
    let unmatchedLocations = new Set<string>();

    (interims || []).forEach((ir: any) => {
      const dateStr = ir.created_at.slice(0, 10);
      const normalizedLoc = normalizeLocationName(ir.location);
      const key = `${dateStr}|${normalizedLoc}`;
      const finalSales = dailyLookup.get(key);
      if (!finalSales || finalSales <= 0) {
        unmatchedLocations.add(ir.location);
        return;
      }
      if (!ir.current_sales || ir.current_sales <= 0) return;

      matchedCount++;
      const rate = Math.min(1, ir.current_sales / finalSales);
      const locationId = locMap.get(normalizedLoc);
      if (!locationId) return;

      entries.push({
        locationId,
        dayType: getDayType(dateStr),
        hour: ir.report_hour,
        rate,
      });
    });

    // 5. Group by location × dayType × hour
    type GroupKey = string;
    const groups = new Map<
      GroupKey,
      { locationId: string; dayType: string; hour: number; rates: number[] }
    >();

    entries.forEach((e) => {
      const key = `${e.locationId}|${e.dayType}|${e.hour}`;
      const g = groups.get(key) || {
        locationId: e.locationId,
        dayType: e.dayType,
        hour: e.hour,
        rates: [],
      };
      g.rates.push(e.rate);
      groups.set(key, g);
    });

    // 6. Get existing global rates as fallback
    const { data: globalRates } = await supabase
      .from("achievement_rates")
      .select("*")
      .eq("is_global", true);
    const globalMap = new Map<string, any>();
    (globalRates || []).forEach((r: any) => {
      globalMap.set(`${r.day_type}|${r.hour}`, r);
    });

    // 7. Build upsert records
    const now = new Date().toISOString();
    const upsertRows: any[] = [];

    groups.forEach((g) => {
      if (g.rates.length >= 3) {
        const avg =
          g.rates.reduce((s, r) => s + r, 0) / g.rates.length;
        upsertRows.push({
          location_id: g.locationId,
          day_type: g.dayType,
          hour: g.hour,
          rate: Math.round(avg * 10000) / 10000,
          sample_count: g.rates.length,
          is_global: false,
          calculated_at: now,
        });
      }
      // If < 3 samples, global fallback is used automatically at read time
    });

    // 8. Upsert to achievement_rates
    let ratesUpdated = 0;
    if (upsertRows.length > 0) {
      const { error: upsErr } = await supabase
        .from("achievement_rates")
        .upsert(upsertRows, {
          onConflict: "location_id,day_type,hour",
          ignoreDuplicates: false,
        });
      if (upsErr) throw upsErr;
      ratesUpdated = upsertRows.length;
    }

    // ログ: マッチング結果
    console.log(`[到達率計算] マッチしたペア数: ${matchedCount}`);
    console.log(`[到達率計算] マッチしなかった中間報告の店舗名:`, [...unmatchedLocations]);

    // 9. Log the calculation
    const { error: logErr } = await supabase
      .from("achievement_rate_calculations")
      .insert({
        calculated_at: now,
        data_count: entries.length,
        rates_updated: ratesUpdated,
        triggered_by: triggeredBy,
        notes: `Processed ${(interims || []).length} interim reports, ${matchedCount} matched with daily sales (normalized), updated ${ratesUpdated} rates`,
      });
    if (logErr) console.error("Log insert error:", logErr);

    return NextResponse.json({
      success: true,
      data_count: entries.length,
      rates_updated: ratesUpdated,
      total_interims: (interims || []).length,
      matched_count: matchedCount,
      unmatched_locations: [...unmatchedLocations],
    });
  } catch (err: any) {
    console.error("Achievement rate calc error:", err);
    return NextResponse.json(
      { error: err?.message || "calculation failed" },
      { status: 500 }
    );
  }
}
