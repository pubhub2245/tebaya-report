import { serverClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { transformWithCurrentCharacter } from "@/lib/formatters/characterTransform";

export const runtime = "nodejs";
export const maxDuration = 60;

// 都城市の緯度経度
const MIYAKONOJO_LAT = 31.7194;
const MIYAKONOJO_LON = 131.0617;

const supabase = serverClient();

type TargetDayType = "today" | "tomorrow";

/** JSTの「今日」または「明日」をYYYY-MM-DD形式で返す */
function targetDateJST(dayType: TargetDayType): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (dayType === "tomorrow") {
    jst.setUTCDate(jst.getUTCDate() + 1);
  }
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

  // クエリパラメータ
  const targetDayParam = req.nextUrl.searchParams.get("targetDay");
  const targetDayType: TargetDayType =
    targetDayParam === "today" ? "today" : "tomorrow";
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const targetDate = targetDateJST(targetDayType);

  try {
    // 重複チェック（dryRun時はスキップ）
    if (!dryRun) {
      const { data: existing, error: existingErr } = await supabase
        .from("weather_alerts")
        .select("id")
        .eq("target_date", targetDate)
        .eq("target_day_type", targetDayType)
        .limit(1);

      if (existingErr) {
        console.error("[notify-weather] 重複チェックエラー:", existingErr);
      }

      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: true,
          skipped: true,
          message: `${targetDate} (${targetDayType}) の天気予報は通知済みです`,
        });
      }
    }

    // OpenWeatherMap 5日間/3時間予報API
    const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${MIYAKONOJO_LAT}&lon=${MIYAKONOJO_LON}&appid=${apiKey}&units=metric&lang=ja`;
    const res = await fetch(apiUrl);

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

    // 対象日（JST）のデータだけ抽出
    const targetDayEntries = (data.list || []).filter((entry: any) => {
      const dt = entry.dt_txt as string;
      const utcDate = new Date(dt.replace(" ", "T") + "Z");
      const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
      const jstDateStr = jstDate.toISOString().slice(0, 10);
      return jstDateStr === targetDate;
    });

    if (targetDayEntries.length === 0) {
      return NextResponse.json({
        success: false,
        error: `${targetDate} (${targetDayType}) の予報データが見つかりません`,
      });
    }

    // 各指標を集計
    let tempMin = Infinity;
    let tempMax = -Infinity;
    let windSpeedMax = 0;
    let windSpeedSum = 0;
    let gustMax = 0;
    let precipProbMax = 0;
    const weatherCounts = new Map<string, number>();
    let mainWeather = "";
    let mainDesc = "";

    for (const entry of targetDayEntries) {
      const temp = entry.main;
      if (temp.temp_min < tempMin) tempMin = temp.temp_min;
      if (temp.temp_max > tempMax) tempMax = temp.temp_max;

      const speed = entry.wind?.speed || 0;
      // gust が欠損していれば speed をフォールバック
      const gust = entry.wind?.gust ?? speed;
      if (speed > windSpeedMax) windSpeedMax = speed;
      windSpeedSum += speed;
      if (gust > gustMax) gustMax = gust;

      const pop = (entry.pop || 0) * 100;
      if (pop > precipProbMax) precipProbMax = pop;

      const w = entry.weather?.[0];
      if (w) {
        const count = (weatherCounts.get(w.main) || 0) + 1;
        weatherCounts.set(w.main, count);
      }
    }

    const windSpeedAvg = windSpeedSum / targetDayEntries.length;
    // 持続風と突風の高い方で判定
    const effectiveWind = Math.max(windSpeedMax, gustMax);

    // 最頻出の天気を選ぶ
    let maxCount = 0;
    for (const [key, count] of weatherCounts) {
      if (count > maxCount) {
        maxCount = count;
        mainWeather = key;
      }
    }
    mainDesc = weatherDescJa(mainWeather, mainWeather);

    // 強風判定（effectiveWind ベース）
    const isCancelLevel = effectiveWind >= 18;
    const isStrongWind = effectiveWind >= 12 && !isCancelLevel;
    const alertLevel: "normal" | "caution" | "cancel" = isCancelLevel
      ? "cancel"
      : isStrongWind
        ? "caution"
        : "normal";

    // 表示用の値
    const [, m, d] = targetDate.split("-");
    const monthDay = `${parseInt(m)}/${parseInt(d)}`;
    const icon = weatherIcon(mainWeather);
    const gustDisp = Math.round(gustMax);
    const windMaxDisp = Math.round(windSpeedMax);
    const windAvgDisp = Math.round(windSpeedAvg);
    const effDisp = Math.round(effectiveWind);

    // 出店判断
    let judgmentText: string;
    if (isCancelLevel) {
      judgmentText = `🚨 出店不可の可能性大\n   最大瞬間風速 ${effDisp}m/s予報`;
    } else if (isStrongWind) {
      judgmentText = `⚠️ 要注意（最大瞬間風速 ${effDisp}m/s）`;
    } else {
      judgmentText = "✅ 出店OK（風速 良好）";
    }

    // 見出し
    const headline =
      targetDayType === "tomorrow"
        ? "🌤️ 明日の天気予報"
        : "🌤️ 今日の天気予報";

    // メッセージ組み立て
    let message = `${headline}\n\n`;
    message += `📅 ${monthDay}（都城市）\n`;
    message += `${icon} ${mainDesc}\n`;
    message += `🌡️ 気温：${Math.round(tempMin)}℃〜${Math.round(tempMax)}℃\n`;
    message += `☔ 降水確率：${Math.round(precipProbMax)}%\n`;
    message += `💨 最大瞬間風速：${gustDisp}m/s\n`;
    message += `　 持続風（最大）：${windMaxDisp}m/s\n`;
    message += `　 持続風（平均）：${windAvgDisp}m/s\n`;
    message += "\n━━━━━━━━━━━━━━━\n";
    message += `${judgmentText}\n`;
    message += "━━━━━━━━━━━━━━━";

    // 追加の警告メッセージ
    const warnings: string[] = [];

    if (isCancelLevel) {
      warnings.push(
        "⛔ 出店可否を必ず確認してください。\nテント・のぼり等の屋外設置は危険です。",
      );
    } else if (isStrongWind) {
      warnings.push(
        "⚠️ テント・のぼりの対策をお願いします！\n固定具の確認をお忘れなく。",
      );
    }

    const hasThunderstorm = targetDayEntries.some(
      (f: any) => f.weather?.[0]?.main === "Thunderstorm",
    );
    if (hasThunderstorm) {
      warnings.push(
        "⚡ 雷雨予報です。雷の音が聞こえたら避難してください。",
      );
    }

    if (precipProbMax >= 70 && !hasThunderstorm) {
      warnings.push("☔ 雨対策をお願いします。");
    }

    if (warnings.length > 0) {
      message += "\n\n" + warnings.join("\n\n");
    }

    // forecastデータ
    const forecast = {
      weather: mainDesc,
      tempMin: Math.round(tempMin),
      tempMax: Math.round(tempMax),
      precipProbMax: Math.round(precipProbMax),
      windSpeedAvg: Math.round(windSpeedAvg * 10) / 10,
      windSpeedMax: Math.round(windSpeedMax * 10) / 10,
      gustMax: Math.round(gustMax * 10) / 10,
      effectiveWind: Math.round(effectiveWind * 10) / 10,
      alertLevel,
      isStrongWind,
      isCancelLevel,
    };

    // dryRun: LINE送信 & DB INSERT をスキップ
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        target_date: targetDate,
        target_day_type: targetDayType,
        forecast,
        message,
      });
    }

    // LINE送信
    const decorated = transformWithCurrentCharacter(message, {
      context: "weather",
      isEmergency: isCancelLevel,
    });
    const sent = await sendLineGroupMessage(decorated);

    // 通知履歴をDBに保存（エラーハンドリングあり）
    try {
      const { error: insertErr } = await supabase
        .from("weather_alerts")
        .insert({
          target_date: targetDate,
          target_day_type: targetDayType,
          alert_level: alertLevel,
          weather: mainDesc,
          temp_min: Math.round(tempMin * 10) / 10,
          temp_max: Math.round(tempMax * 10) / 10,
          precip_prob_max: Math.round(precipProbMax * 10) / 10,
          wind_speed_avg: Math.round(windSpeedAvg * 100) / 100,
          wind_speed_max: Math.round(windSpeedMax * 100) / 100,
          wind_gust_max: Math.round(gustMax * 100) / 100,
          effective_wind: Math.round(effectiveWind * 100) / 100,
          is_strong_wind: isStrongWind,
          is_cancel_level: isCancelLevel,
          line_sent: sent,
        });

      if (insertErr) {
        if (insertErr.code === "23505") {
          // UNIQUE違反は重複時の正常動作として無視
          console.warn(
            "[notify-weather] 重複INSERTを検出（無視）:",
            insertErr.message,
          );
        } else {
          console.error("[notify-weather] INSERTエラー:", insertErr);
        }
      }
    } catch (e) {
      console.error("[notify-weather] INSERT例外:", e);
    }

    return NextResponse.json({
      success: sent,
      forecast,
      target_date: targetDate,
      target_day_type: targetDayType,
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
