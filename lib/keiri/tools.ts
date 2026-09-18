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
