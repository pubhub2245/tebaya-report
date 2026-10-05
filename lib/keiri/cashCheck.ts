/**
 * 金庫を数えた記録と、計算上の現金を突き合わせるところ。**計算だけ**（倉庫は触らない）。
 *
 * ■ なぜ要るのか（2026-10-05・kp233・f1-4）
 *   いままで「今の現金」は、期首残高に売上を足して経費と日当を引いた**計算上の値**しか
 *   ありませんでした。実際に金庫を数えた記録を置く場所がどこにも無く、
 *   最後の実測は 2026-09-10 の145,000円（経理の設定の起点）1回だけ。
 *   しかも売上の現金を銀行に入れた記録も無いので、計算上の現金は**増え続ける一方**でした。
 *   ＝「合っているか」を確かめる相手がそもそも存在しない状態。
 *
 * ■ どう直すか
 *   ① 金庫を数えた日と金額を1行 記録する（kind='count'）
 *   ② 売上の現金を銀行に入れたら1行 記録する（kind='deposit'）
 *      ★これは**経費ではありません**。利益は1円も変わらず、現金だけが減ります。
 *   ③ 「数えた日の時点の計算上の残高」と「その日に数えた金額」を比べる。
 *      今日の計算上の残高を2週間前の実測と比べると、必ずズレて意味がないため、
 *      **突き合わせは必ず数えた日に揃えます**。
 *   ④ 差が出ても黙って合わせません。何が足りていないかを言葉で出し、人が直します。
 *
 * ■ 画面に出す言葉
 *   B2 が置いた材料（司令室 meta/keiri-material-kinko-kotoba・2026-10-04 13:55）を
 *   そのまま使っています。1,000円・30日の線も材料のとおり。
 */

/** 金庫を数えた／銀行に入れた の1行（倉庫 keiri_cash_events の1行） */
export type CashEvent = {
  kind: "count" | "deposit";
  /** その記録の日（YYYY-MM-DD） */
  happened_on: string;
  /** count＝数えた残高／deposit＝入れた金額 */
  amount: number;
  actor?: string | null;
  note?: string | null;
};

/** 「ほぼ合っている」とみなす幅（おつりの誤差の範囲） */
export const NEAR_ENOUGH_YEN = 1000;
/** 「久しく数えていない」とみなす日数 */
export const STALE_DAYS = 30;

/** 倉庫から来た行を、計算に使える形にそろえる。おかしな行は捨てる */
export function normalizeCashEvents(rows: unknown[]): CashEvent[] {
  const out: CashEvent[] = [];
  for (const raw of rows ?? []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const kind = String(r.kind ?? "");
    if (kind !== "count" && kind !== "deposit") continue;
    const on = String(r.happened_on ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    out.push({
      kind,
      happened_on: on,
      amount: Math.round(amount),
      actor: typeof r.actor === "string" ? r.actor : null,
      note: typeof r.note === "string" ? r.note : null,
    });
  }
  return out;
}

/** 銀行に入れた記録だけを、現金の計算に渡せる形で返す */
export function depositsOf(events: CashEvent[]): { date: string; amount: number }[] {
  return events
    .filter((e) => e.kind === "deposit")
    .map((e) => ({ date: e.happened_on, amount: e.amount }));
}

/** いちばん新しい「数えた」記録。無ければ null */
export function latestCount(events: CashEvent[]): CashEvent | null {
  const counts = events
    .filter((e) => e.kind === "count")
    .slice()
    .sort((a, b) =>
      a.happened_on === b.happened_on ? 0 : a.happened_on < b.happened_on ? 1 : -1,
    );
  return counts[0] ?? null;
}

/** 日付の差（日数）。おかしな値なら null */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00+09:00`);
  const b = Date.parse(`${to}T00:00:00+09:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

export type CashReconcile = {
  /** まだ1回も数えていないか */
  neverCounted: boolean;
  /** 数えた日の時点の計算上の残高 */
  computed: number | null;
  /** その日に実際に数えた金額 */
  counted: number | null;
  countedOn: string | null;
  /** 計算 − 実測。プラス＝金庫のほうが少ない */
  diff: number | null;
  /** 最後に数えてから何日たったか */
  daysSince: number | null;
  /** 差の言い方（人が読む1文） */
  verdict: string;
  /** 「久しく数えていません」の一言（当てはまらなければ null） */
  stale: string | null;
};

/** 円の書き方（画面と同じ3桁区切り） */
function yen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

/** 「◯月◯日」 */
export function monthDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/**
 * 突き合わせる。
 *
 * @param computedAtCount 数えた日の時点の計算上の残高（calcCashPosition の asOf で出す）
 */
export function reconcileCash(params: {
  events: CashEvent[];
  computedAtCount: number | null;
  /** 今日（YYYY-MM-DD） */
  today: string;
}): CashReconcile {
  const { events, computedAtCount, today } = params;
  const last = latestCount(events);

  if (!last) {
    return {
      neverCounted: true,
      computed: null,
      counted: null,
      countedOn: null,
      diff: null,
      daysSince: null,
      verdict: "金庫を1回数えて入れると、ここから先の現金を追いかけられます。",
      stale: null,
    };
  }

  const daysSince = daysBetween(last.happened_on, today);
  const stale =
    daysSince !== null && daysSince >= STALE_DAYS
      ? `最後に数えたのは ${monthDay(last.happened_on)} です。金庫を数えて入れると、ここが合っているか分かります。`
      : null;

  if (computedAtCount === null) {
    return {
      neverCounted: false,
      computed: null,
      counted: last.amount,
      countedOn: last.happened_on,
      diff: null,
      daysSince,
      verdict: "計算上の現金が出せませんでした（お店の設定が読めていません）。",
      stale,
    };
  }

  const diff = Math.round(computedAtCount - last.amount);
  const gap = Math.abs(diff);
  const verdict =
    diff === 0
      ? "ぴったり合っています。"
      : gap < NEAR_ENOUGH_YEN
        ? "ほぼ合っています（おつりの誤差の範囲です）。"
        : diff > 0
          ? `金庫のほうが ${yen(gap)} 少ないです。書き忘れた現金の支払い、または銀行に入れた分が無いか見てください。`
          : `金庫のほうが ${yen(gap)} 多いです。書き忘れた売上、または金庫に足したお金が無いか見てください。`;

  return {
    neverCounted: false,
    computed: Math.round(computedAtCount),
    counted: last.amount,
    countedOn: last.happened_on,
    diff,
    daysSince,
    verdict,
    stale,
  };
}

/** 突き合わせの3行（材料の言い方のまま） */
export function reconcileLines(r: CashReconcile): string[] {
  if (r.neverCounted || r.computed === null || r.counted === null) return [];
  return [
    `計算上の現金　${yen(r.computed)}（${r.countedOn ? monthDay(r.countedOn) : ""}の時点）`,
    `実際に数えた現金　${yen(r.counted)}（${r.countedOn ? monthDay(r.countedOn) : ""}）`,
    `差　${yen(r.diff ?? 0)}`,
  ];
}
