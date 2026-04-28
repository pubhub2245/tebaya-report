import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";

export const runtime = "nodejs";
export const maxDuration = 60;

// 都城市の緯度経度
const MIYAKONOJO_LAT = 31.7194;
const MIYAKONOJO_LON = 131.0617;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/** 日本時間の「明日」をYYYY-MM-DD形式で返す */
function tomorrowJST(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setUTCDate(jst.getUTCDate() + 1);
  return jst.toISOString().slice(0, 10);
}

/** 天気アイコン変換 */
function weatherIcon(main: string): string {
  const icons: Record<string, string> = {
    Clear: "☀️",
    Clouds: "☁️",
    Rain: "🌧️",
    Drizzle: "🌦️",
    Thunderstorm: "⛈️",
    Snow: "❄️",
    Mist: "🌫️",
    Fog: "🌫️",
    Haze: "🌫️",
  };
  return icons[main] || "🌤️";
}

/** 天気の日本語変換 */
function weatherDescJa(main: string, description: string): string {
  const map: Record<string, string> = {
    Clear: "晴れ",
    Clouds: "曇り",
    Rain: "雨",
    Drizzle: "小雨",
    Thunderstorm: "雷雨",
    Snow: "雪",
    Mist: "霧",
    Fog: "霧",
    Haze: "もや",
  };
  return map[main] || description;
}

export async function GET(req: NextRequest) {
  // 認証チェック
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "OPENWEATHER_API_KEY が未設定です" },
      { status: 500 },
    );
  }

  const targetDate = tomorrowJST();

  try {
    // 重複チェック
    const { data: existing } = await supabase
      .from("weather_alerts")
      .select("id")
      .eq("target_date", targetDate)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: `${targetDate} の天気予報は通知済みです`,
      });
    }

    // OpenWeatherMap 5日間/3時間予報API
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${MIYAKONOJO_LAT}&lon=${MIYAKONOJO_LON}&appid=${apiKey}&units=metric&lang=ja`;
    const res = await fetch(url);

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json(
        {
          success: false,
          error: `OpenWeatherMap APIエラー (${res.status})`,
          details: errBody,
        },
        { status: 502 },
      );
    }

    const data = await res.json();

    // 翌日のデータだけ抽出（3時間ごとのデータ）
    const tomorrowEntries = (data.list || []).filter((entry: any) => {
      const dt = entry.dt_txt as string; // "2026-04-29 03:00:00" (UTC)
      // UTCのdt_txtを日本時間に変換して翌日かチェック
      const utcDate = new Date(dt.replace(" ", "T") + "Z");
      const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
      const jstDateStr = jstDate.toISOString().slice(0, 10);
      return jstDateStr === targetDate;
    });

    if (tomorrowEntries.length === 0) {
      return NextResponse.json({
        success: false,
        error: `${targetDate} の予報データが見つかりません`,
      });
    }

    // 各指標を集計
    let tempMin = Infinity;
    let tempMax = -Infinity;
    let windSpeedMax = 0;
    let windSpeedSum = 0;
    let precipProbMax = 0;
    const weatherCounts = new Map<string, number>();
    let mainWeather = "";
    let mainDesc = "";

    for (const entry of tomorrowEntries) {
      const temp = entry.main;
      if (temp.temp_min < tempMin) tempMin = temp.temp_min;
      if (temp.temp_max > tempMax) tempMax = temp.temp_max;

      const wind = entry.wind?.speed || 0;
      if (wind > windSpeedMax) windSpeedMax = wind;
      windSpeedSum += wind;

      const pop = (entry.pop || 0) * 100;
      if (pop > precipProbMax) precipProbMax = pop;

      const w = entry.weather?.[0];
      if (w) {
        const count = (weatherCounts.get(w.main) || 0) + 1;
        weatherCounts.set(w.main, count);
      }
    }

    const windSpeedAvg = windSpeedSum / tomorrowEntries.length;

    // 最頻出の天気を選ぶ
    let maxCount = 0;
    for (const [key, count] of weatherCounts) {
      if (count > maxCount) {
        maxCount = count;
        mainWeather = key;
      }
    }
    mainDesc = weatherDescJa(mainWeather, mainWeather);

    // 強風判定
    const isStrongWind = windSpeedMax >= 12;
    const isCancelLevel = windSpeedMax >= 18;

    // メッセージ作成
    const [y, m, d] = targetDate.split("-");
    const monthDay = `${parseInt(m)}/${parseInt(d)}`;
    const icon = weatherIcon(mainWeather);

    let message = "";

    if (isCancelLevel) {
      message += "🚨 明日は出店中止レベルの暴風予報！\n\n";
    } else if (isStrongWind) {
      message += "🌬️ 明日は強風注意！\n\n";
    } else {
      message += "🌤️ 明日の天気予報\n\n";
    }

    message += `📅 ${monthDay}（都城市）\n`;
    message += `${icon} ${mainDesc}\n`;
    message += `🌡️ 気温：${Math.round(tempMin)}℃〜${Math.round(tempMax)}℃\n`;
    message += `☔ 降水確率：${Math.round(precipProbMax)}%\n`;
    message += `💨 風速：${Math.round(windSpeedAvg)}m/s（最大${Math.round(windSpeedMax)}m/s）\n`;

    if (isCancelLevel) {
      message +=
        "\n⛔ 出店可否を必ず確認してください。\nテント・のぼり等の屋外設置は危険です。";
    } else if (isStrongWind) {
      message +=
        "\n⚠️ テント・のぼりの固定を強化してください。\n状況次第で出店中止の判断も検討を。";
    }

    // LINE送信
    const sent = await sendLineGroupMessage(message);

    // 通知履歴をDBに保存
    const forecast = {
      weather: mainDesc,
      tempMin: Math.round(tempMin),
      tempMax: Math.round(tempMax),
      precipProbMax: Math.round(precipProbMax),
      windSpeedAvg: Math.round(windSpeedAvg),
      windSpeedMax: Math.round(windSpeedMax),
      isStrongWind,
      isCancelLevel,
    };

    await supabase.from("weather_alerts").insert({
      target_date: targetDate,
      weather: mainDesc,
      temp_min: Math.round(tempMin),
      temp_max: Math.round(tempMax),
      precip_prob_max: Math.round(precipProbMax),
      wind_speed_avg: Math.round(windSpeedAvg * 10) / 10,
      wind_speed_max: Math.round(windSpeedMax * 10) / 10,
      is_strong_wind: isStrongWind,
      is_cancel_level: isCancelLevel,
      line_sent: sent,
    });

    return NextResponse.json({
      success: sent,
      forecast,
      target_date: targetDate,
      error: sent ? undefined : "LINE送信に失敗しました",
    });
  } catch (e: any) {
    console.error("[notify-weather] エラー:", e);
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
