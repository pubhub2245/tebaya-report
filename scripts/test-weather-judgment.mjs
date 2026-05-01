// route.ts の判定ロジック・LINE文面組み立てを抜き出したものを、
// モックの3時間ごとエントリで動かすユニットテスト。

function weatherIcon(main) {
  const icons = {
    Clear: "☀️", Clouds: "☁️", Rain: "🌧️", Drizzle: "🌦️",
    Thunderstorm: "⛈️", Snow: "❄️", Mist: "🌫️", Fog: "🌫️", Haze: "🌫️",
  };
  return icons[main] || "🌤️";
}

function weatherDescJa(main, description) {
  const map = {
    Clear: "晴れ", Clouds: "曇り", Rain: "雨", Drizzle: "小雨",
    Thunderstorm: "雷雨", Snow: "雪", Mist: "霧", Fog: "霧", Haze: "もや",
  };
  return map[main] || description;
}

// route.ts の集計＋判定＋メッセージ組み立て と完全に同じロジック
function runJudgment(targetDayEntries, targetDayType, targetDate) {
  let tempMin = Infinity;
  let tempMax = -Infinity;
  let windSpeedMax = 0;
  let windSpeedSum = 0;
  let gustMax = 0;
  let precipProbMax = 0;
  const weatherCounts = new Map();
  let mainWeather = "";
  let mainDesc = "";

  for (const entry of targetDayEntries) {
    const temp = entry.main;
    if (temp.temp_min < tempMin) tempMin = temp.temp_min;
    if (temp.temp_max > tempMax) tempMax = temp.temp_max;

    const speed = entry.wind?.speed || 0;
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
  const effectiveWind = Math.max(windSpeedMax, gustMax);

  let maxCount = 0;
  for (const [key, count] of weatherCounts) {
    if (count > maxCount) {
      maxCount = count;
      mainWeather = key;
    }
  }
  mainDesc = weatherDescJa(mainWeather, mainWeather);

  const isCancelLevel = effectiveWind >= 18;
  const isStrongWind = effectiveWind >= 12 && !isCancelLevel;
  const alertLevel = isCancelLevel ? "cancel" : isStrongWind ? "caution" : "normal";

  const [, m, d] = targetDate.split("-");
  const monthDay = `${parseInt(m)}/${parseInt(d)}`;
  const icon = weatherIcon(mainWeather);
  const gustDisp = Math.round(gustMax);
  const windMaxDisp = Math.round(windSpeedMax);
  const windAvgDisp = Math.round(windSpeedAvg);
  const effDisp = Math.round(effectiveWind);

  let judgmentText;
  if (isCancelLevel) {
    judgmentText = `🚨 出店不可の可能性大\n   最大瞬間風速 ${effDisp}m/s予報`;
  } else if (isStrongWind) {
    judgmentText = `⚠️ 要注意（最大瞬間風速 ${effDisp}m/s）`;
  } else {
    judgmentText = "✅ 出店OK（風速 良好）";
  }

  const headline = targetDayType === "tomorrow" ? "🌤️ 明日の天気予報" : "🌤️ 今日の天気予報";

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

  const warnings = [];
  if (isCancelLevel) {
    warnings.push("⛔ 出店可否を必ず確認してください。\nテント・のぼり等の屋外設置は危険です。");
  } else if (isStrongWind) {
    warnings.push("⚠️ テント・のぼりの対策をお願いします！\n固定具の確認をお忘れなく。");
  }
  const hasThunderstorm = targetDayEntries.some((f) => f.weather?.[0]?.main === "Thunderstorm");
  if (hasThunderstorm) warnings.push("⚡ 雷雨予報です。雷の音が聞こえたら避難してください。");
  if (precipProbMax >= 70 && !hasThunderstorm) warnings.push("☔ 雨対策をお願いします。");
  if (warnings.length > 0) message += "\n\n" + warnings.join("\n\n");

  return {
    forecast: {
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
    },
    message,
  };
}

// ========== モック生成ヘルパー ==========
// 1日分（8スロット）のエントリを、指定したピーク値で生成する。
// 1スロットだけピーク値、残りはピークの半分くらいの値にする。
function makeDayEntries({ peakSpeed, peakGust, baseSpeed = 3, baseGust = 5 }) {
  const slots = [
    "00:00:00", "03:00:00", "06:00:00", "09:00:00",
    "12:00:00", "15:00:00", "18:00:00", "21:00:00",
  ];
  return slots.map((t, i) => ({
    dt_txt: `2026-05-02 ${t}`,
    main: { temp_min: 15 + i * 0.2, temp_max: 22 + i * 0.2 },
    wind: {
      speed: i === 4 ? peakSpeed : baseSpeed,
      gust: i === 4 ? peakGust : baseGust,
    },
    pop: 0.2,
    weather: [{ main: "Clouds", description: "曇り" }],
  }));
}

// ========== テストケース ==========
const cases = [
  {
    name: "ケース1: gust=15, speed=8 → caution（突風が閾値超え）",
    entries: makeDayEntries({ peakSpeed: 8, peakGust: 15 }),
    expected: { alertLevel: "caution", gustMax: 15, windSpeedMax: 8, effectiveWind: 15 },
  },
  {
    name: "ケース2: gust=20, speed=10 → cancel（突風が中止級）",
    entries: makeDayEntries({ peakSpeed: 10, peakGust: 20 }),
    expected: { alertLevel: "cancel", gustMax: 20, windSpeedMax: 10, effectiveWind: 20 },
  },
  {
    name: "ケース3: gust=5, speed=5 → normal（穏やか）",
    entries: makeDayEntries({ peakSpeed: 5, peakGust: 5, baseSpeed: 2, baseGust: 3 }),
    expected: { alertLevel: "normal", gustMax: 5, windSpeedMax: 5, effectiveWind: 5 },
  },
  {
    name: "ケース4: gust欠損 → speedにフォールバック（speed=13でcaution）",
    entries: (() => {
      const e = makeDayEntries({ peakSpeed: 13, peakGust: 0 });
      // gustフィールドそのものを削除
      e.forEach(x => { delete x.wind.gust; });
      return e;
    })(),
    expected: { alertLevel: "caution", gustMax: 13, windSpeedMax: 13, effectiveWind: 13 },
  },
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  console.log("\n" + "=".repeat(60));
  console.log(c.name);
  console.log("=".repeat(60));
  const result = runJudgment(c.entries, "tomorrow", "2026-05-02");
  const f = result.forecast;
  let ok = true;
  for (const [k, v] of Object.entries(c.expected)) {
    const got = f[k];
    const match = got === v;
    console.log(`  ${match ? "✓" : "✗"} ${k}: 期待=${v} 実際=${got}`);
    if (!match) ok = false;
  }
  console.log("--- 生成LINE文面 ---");
  console.log(result.message);
  console.log("--- forecast JSON ---");
  console.log(JSON.stringify(f, null, 2));
  if (ok) passed++; else failed++;
}

console.log("\n" + "=".repeat(60));
console.log(`結果: ${passed}件 PASS / ${failed}件 FAIL`);
console.log("=".repeat(60));
process.exit(failed === 0 ? 0 : 1);
