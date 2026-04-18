import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("location_id");
  const dayType = req.nextUrl.searchParams.get("day_type");

  try {
    // Get location-specific rates
    let locRates: any[] = [];
    if (locationId) {
      const q = supabase
        .from("achievement_rates")
        .select("hour, rate, sample_count, is_global")
        .eq("location_id", locationId)
        .eq("is_global", false);
      if (dayType) q.eq("day_type", dayType);
      const { data, error } = await q;
      if (error) throw error;
      locRates = data || [];
    }

    // Get global rates as fallback
    const gq = supabase
      .from("achievement_rates")
      .select("hour, rate, sample_count, is_global, day_type")
      .eq("is_global", true);
    if (dayType) gq.eq("day_type", dayType);
    const { data: globalRates, error: gErr } = await gq;
    if (gErr) throw gErr;

    // Merge: use location-specific if available, else global
    const locByHour = new Map<number, any>();
    locRates.forEach((r) => locByHour.set(r.hour, r));

    const globalByHour = new Map<string, any>();
    (globalRates || []).forEach((r) =>
      globalByHour.set(`${r.day_type}|${r.hour}`, r)
    );

    const hours = [11, 13, 15, 17, 19, 20];
    const dt = dayType || "weekday";
    const rates = hours.map((h) => {
      const loc = locByHour.get(h);
      if (loc) {
        return {
          hour: h,
          rate: loc.rate,
          sample_count: loc.sample_count,
          is_global: false,
        };
      }
      const g = globalByHour.get(`${dt}|${h}`);
      if (g) {
        return {
          hour: h,
          rate: g.rate,
          sample_count: g.sample_count,
          is_global: true,
        };
      }
      return { hour: h, rate: null, sample_count: 0, is_global: true };
    });

    return NextResponse.json({ rates });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "failed" },
      { status: 500 }
    );
  }
}
