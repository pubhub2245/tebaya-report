import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeLocationName } from "@/lib/locationMatcher";
import { runBackup, serviceClient } from "@/lib/backup";

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

  // この関数全体の制限時間は maxDuration（60秒）。
  // バックアップは**本来の集計が終わったあと**、残り時間の範囲だけで動かす。
  //
  // ★ 2026-08-28 の事故：以前はバックアップを先に走らせていた。
  //   日報にレシート写真が埋め込まれていて18MBあり、コピーに時間を使い切った結果、
  //   本来の達成率計算まで到達せず、8/27の夜は1日ぶん丸ごと実行されなかった。
  //   「相乗りさせた処理が、本来の処理を道連れにしない」ことを最優先にする。
  const startedAt = Date.now();
  let backup: unknown = { ok: false, skipped: "未実行" };

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
    const locMap = new Map<string, number>();
    (locs || []).forEach((l: any) => locMap.set(normalizeLocationName(l.name), Number(l.id)));

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
      locationId: number;
      dayType: "weekday" | "weekend";
      hour: number;
      rate: number;
    };

    const entries: RateEntry[] = [];
    let matchedCount = 0;
    let unmatchedLocations = new Set<string>();
    let noLocationIdCount = 0;

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
      if (locationId === undefined) {
        noLocationIdCount++;
        console.log(`[到達率計算] location_id未発見: "${ir.location}" (正規化: "${normalizedLoc}")`);
        return;
      }

      entries.push({
        locationId,
        dayType: getDayType(dateStr),
        hour: ir.report_hour,
        rate,
      });
    });

    console.log(`[到達率計算] entries数: ${entries.length}, マッチ数: ${matchedCount}, locationId未発見: ${noLocationIdCount}`);

    // 5. Group by location × dayType × hour
    type GroupKey = string;
    const groups = new Map<
      GroupKey,
      { locationId: number; dayType: string; hour: number; rates: number[] }
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

    groups.forEach((g, key) => {
      const avg =
        g.rates.reduce((s, r) => s + r, 0) / g.rates.length;
      console.log(`[到達率計算] グループ ${key}: samples=${g.rates.length}, avg=${Math.round(avg * 10000) / 10000}`);
      upsertRows.push({
        location_id: g.locationId,
        day_type: g.dayType,
        hour: g.hour,
        rate: Math.round(avg * 10000) / 10000,
        sample_count: g.rates.length,
        is_global: false,
        calculated_at: now,
      });
    });

    // 8. Upsert to achievement_rates
    let ratesUpdated = 0;
    let upsertError: string | null = null;
    console.log(`[到達率計算] upsert対象: ${upsertRows.length}件`);

    if (upsertRows.length > 0) {
      // 1件ずつupsertして個別のエラーをキャッチ
      for (const row of upsertRows) {
        const { error: upsErr } = await supabase
          .from("achievement_rates")
          .upsert(row, {
            onConflict: "location_id,day_type,hour",
            ignoreDuplicates: false,
          });
        if (upsErr) {
          console.error(`[到達率計算] UPSERT失敗 (loc=${row.location_id}, day=${row.day_type}, hour=${row.hour}):`, upsErr);
          upsertError = upsErr.message;
        } else {
          ratesUpdated++;
        }
      }
    }

    // ログ: マッチング結果
    console.log(`[到達率計算] マッチしたペア数: ${matchedCount}`);
    console.log(`[到達率計算] マッチしなかった中間報告の店舗名:`, [...unmatchedLocations]);
    console.log(`[到達率計算] 更新成功: ${ratesUpdated}/${upsertRows.length}`);

    // 9. Log the calculation
    const notesDetail = [
      `interims=${(interims || []).length}`,
      `dailies=${(dailies || []).length}`,
      `matched=${matchedCount}`,
      `entries=${entries.length}`,
      `groups=${groups.size}`,
      `upsert_target=${upsertRows.length}`,
      `updated=${ratesUpdated}`,
      `noLocId=${noLocationIdCount}`,
      `unmatched=[${[...unmatchedLocations].join(",")}]`,
      upsertError ? `upsert_err=${upsertError}` : null,
    ].filter(Boolean).join(", ");

    const { error: logErr } = await supabase
      .from("achievement_rate_calculations")
      .insert({
        calculated_at: now,
        data_count: entries.length,
        rates_updated: ratesUpdated,
        triggered_by: triggeredBy,
        notes: notesDetail,
      });
    if (logErr) console.error("Log insert error:", logErr);

    // ---------- ここから毎日のバックアップ ----------
    // Vercelの自動実行（cron）は本数に上限があるため、専用の枠を増やさず相乗りさせている。
    // 上の集計はすでに終わって記録済みなので、ここで時間切れになっても道連れにはならない。
    // 60秒の上限に対して5秒の余裕を残す。
    try {
      const db = serviceClient();
      if (!db) {
        backup = { ok: false, skipped: "SUPABASE_SERVICE_ROLE_KEY 未設定" };
      } else {
        const budgetMs = 55_000 - (Date.now() - startedAt);
        backup =
          budgetMs > 2_000
            ? await runBackup(db, { budgetMs })
            : { ok: false, skipped: "集計に時間がかかったため今回は見送り" };
      }
    } catch (e: any) {
      backup = { ok: false, error: e?.message || String(e) };
    }

    return NextResponse.json({
      success: true,
      data_count: entries.length,
      rates_updated: ratesUpdated,
      total_interims: (interims || []).length,
      matched_count: matchedCount,
      groups_count: groups.size,
      upsert_target: upsertRows.length,
      unmatched_locations: [...unmatchedLocations],
      upsert_error: upsertError,
      backup,
    });
  } catch (err: any) {
    console.error("Achievement rate calc error:", err);
    // 集計が失敗した場合、バックアップはまだ動いていない（順番を入れ替えたため）。
    // その旨が分かるよう backup の中身をそのまま返す。
    return NextResponse.json(
      { error: err?.message || "calculation failed", backup },
      { status: 500 }
    );
  }
}
