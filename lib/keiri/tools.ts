/**
 * 無料の計算ツール（/keiri/tools）の計算だけを集めた場所。
 *
 * ★画面の中で計算を書かない（CLAUDE.md 4-1 と同じ考え方）。
 *   ここに書いて tests/keiriTools.test.ts で固定する。
 * ★入力はすべてブラウザの中だけで完結する。どこにも送らない・保存しない。
 * ★税務の判断はしない。出すのは「割り算の答え」だけ。
 */

/** 数字として使えない入力（空・マイナス・文字）を 0 に寄せる */
export function toNumber(input: unknown): number {
  const n = typeof input === "number" ? input : Number(String(input ?? "").replace(/[,\s円%]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** 百分率（小数1桁）。売上が0なら null（0で割れないため） */
export function ratePercent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export type FlResult = {
  /** 原価率（％） */
  foodRate: number | null;
  /** 人件費率（％） */
  laborRate: number | null;
  /** FL比率＝原価率＋人件費率（％） */
  flRate: number | null;
  /** 原価と人件費を引いたあとに残る金額（円） */
  remainYen: number;
};

/**
 * 原価率・人件費率・FL比率。
 * FL比率は「食材（Food）＋人件費（Labor）が売上の何％か」という飲食店で広く使われる見方。
 */
export function calcFl(salesYen: number, foodYen: number, laborYen: number): FlResult {
  const sales = toNumber(salesYen);
  const food = toNumber(foodYen);
  const labor = toNumber(laborYen);
  const foodRate = ratePercent(food, sales);
  const laborRate = ratePercent(labor, sales);
  const flRate = foodRate === null || laborRate === null ? null : Math.round((foodRate + laborRate) * 10) / 10;
  return { foodRate, laborRate, flRate, remainYen: sales - food - labor };
}

export type BreakEvenInput = {
  /** 毎月かならず出ていくお金の合計（円）：家賃・固定の人件費・水道光熱・通信・リースなど */
  fixedCostYen: number;
  /** 売上に連れて増えるお金の割合（％）：食材原価など。0〜100未満 */
  variableRatePercent: number;
  /** 月に何日営業するか（1〜31）。0なら1日あたりは出さない */
  openDays: number;
  /** 客単価（円）。0なら必要な客数は出さない */
  averageSpendYen: number;
};

export type BreakEvenResult = {
  /** トントンになる月の売上（円）。原価率が100%以上なら null（何円売っても届かない） */
  monthlySalesYen: number | null;
  /** 1営業日あたりに必要な売上（円） */
  dailySalesYen: number | null;
  /** 1営業日あたりに必要な客数（人） */
  dailyCustomers: number | null;
  /** 100%以上のときの理由 */
  impossibleReason: string | null;
};

/**
 * 赤字にならない売上（損益分岐点）。
 *
 * 考え方：売上 − 売上×変動費率 − 固定費 = 0 → 売上 = 固定費 ÷ (1 − 変動費率)
 * 変動費率が100%以上だと、売っただけ赤字が増えるので答えが出ない（そこを黙って丸めない）。
 */
export function calcBreakEven(input: BreakEvenInput): BreakEvenResult {
  const fixed = toNumber(input.fixedCostYen);
  const ratePct = toNumber(input.variableRatePercent);
  const days = Math.min(31, Math.round(toNumber(input.openDays)));
  const spend = toNumber(input.averageSpendYen);

  if (ratePct >= 100) {
    return {
      monthlySalesYen: null,
      dailySalesYen: null,
      dailyCustomers: null,
      impossibleReason:
        "売上に対して出ていくお金の割合が100%以上になっています。この状態だと売れば売るほど赤字が増えるので、売上を増やしても黒字になりません。先に原価か売価を見直す必要があります。",
    };
  }

  const monthly = Math.ceil(fixed / (1 - ratePct / 100));
  const daily = days > 0 ? Math.ceil(monthly / days) : null;
  const customers = daily !== null && spend > 0 ? Math.ceil(daily / spend) : null;

  return { monthlySalesYen: monthly, dailySalesYen: daily, dailyCustomers: customers, impossibleReason: null };
}

/** 円の表示（1,234円） */
export function yen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

// ------------------------------------------------------------------
// 出した答えを、そのまま1本のリンクで渡せるようにする（kp37）
//
// ねらい：店主どうしが LINE で「うちはこうだった」と結果を貼り合えると、
//         外からのリンクが増える。ページを増やしても検索に載らないので、
//         「そのページにしか無い中身」と「貼りたくなる理由」で当てにいく。
//
// ★数字はぜんぶ URL の中（＝お客さんのブラウザ）だけで運ぶ。
//   うちのサーバーは受け取らないし、保存もしない。
// ------------------------------------------------------------------

/** URL の ?… から、決めた欄の値だけを取り出す（無ければ既定値のまま） */
export function readShareParams(
  search: string,
  defaults: Record<string, string>,
): Record<string, string> {
  const out = { ...defaults };
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of Object.keys(defaults)) {
    const raw = q.get(key);
    if (raw === null) continue;
    // 数字として読めない値は捨てる（他人が作ったURLで画面が壊れないように）
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    out[key] = String(n);
  }
  return out;
}

/** 入れた数字を URL の ?… の形に直す（空欄と0は載せない＝短いリンクにする） */
export function buildShareQuery(values: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    const n = toNumber(value);
    if (n <= 0) continue;
    q.set(key, String(n));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** 赤字ラインの答えを、そのまま貼れる文章にする */
export function breakEvenShareText(input: BreakEvenInput, result: BreakEvenResult, url: string): string {
  const lines = [
    "【赤字にならない売上（トントンのライン）】",
    `毎月かならず出ていくお金：${yen(toNumber(input.fixedCostYen))}`,
    `原価率：${toNumber(input.variableRatePercent)}％／月の営業日数：${Math.round(toNumber(input.openDays))}日`,
  ];
  if (result.impossibleReason) {
    lines.push("→ 原価率が100%以上なので、売上を増やしても黒字になりません");
  } else {
    lines.push(`→ 月にこれだけ売ればトントン：${yen(result.monthlySalesYen ?? 0)}`);
    if (result.dailySalesYen !== null) lines.push(`→ 1営業日あたり：${yen(result.dailySalesYen)}`);
    if (result.dailyCustomers !== null) {
      lines.push(`→ 1営業日あたりのお客さん：${result.dailyCustomers.toLocaleString("ja-JP")}人`);
    }
  }
  lines.push("", url);
  return lines.join("\n");
}

/** 原価率・FL比率の答えを、そのまま貼れる文章にする */
export function flShareText(
  salesYen: number,
  foodYen: number,
  laborYen: number,
  result: FlResult,
  url: string,
): string {
  const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}％`);
  return [
    "【原価率とFL比率】",
    `売上：${yen(toNumber(salesYen))}／食材：${yen(toNumber(foodYen))}／人件費：${yen(toNumber(laborYen))}`,
    `→ FL比率：${pct(result.flRate)}（原価率 ${pct(result.foodRate)}＋人件費率 ${pct(result.laborRate)}）`,
    `→ 食材と人件費を引いて残る額：${yen(result.remainYen)}`,
    "",
    url,
  ].join("\n");
}
