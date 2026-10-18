/**
 * イベント・お祭りの段取り（/events）の決まりを置く、ただ1か所のファイル。
 *
 * ■ 何をするか（やさしい説明）
 *   「売上はいくらくらいになりそうか」を入れると、
 *   ・手羽先を何本（何袋）頼むか
 *   ・どのフライヤーを使うか（ガスか電気か）
 *   ・いつ発注して、いつ骨抜きするか
 *   のおすすめを出し、スタッフのLINEに貼る文章を組み立てます。
 *
 * ■ 数字の根拠（変えるときはここだけ直し、tests/eventPlan.test.ts も直す）
 *   ・1本あたりの売上 230円 …… 2026-10-18 じゅん決定。手羽先200円・手羽餃子300円を、
 *     手羽先のほうがよく売れることを踏まえて平均した値。
 *     「売上の想定 ÷ 230」が必要な手羽先の本数（それを袋の単位に切り上げて発注する）。
 *   ・1袋 2kg・約30本 …… 仕入れの実際（2026-09 じゅん確認）。
 *   ・骨抜きは100本で約1時間 …… 2026-09 じゅん確認。
 *   ・ガスフライヤーにする売上の目安 60,000円 …… ランクAの目標額（lib/locationRank.ts）。
 *     ガスは一度にたくさん揚げられるので、売上の大きいイベントはガスにする（2026-10 じゅん）。
 *   ・発注は4日前、骨抜き・仕込みは前日 …… 発注先の納期が分かったら ORDER_LEAD_DAYS を直す。
 *
 * ★ お金の計算（粗利・場代など）はここに書かない（→ CLAUDE.md 4-1。lib/money.ts だけ）。
 *   ここで扱うのは「本数・袋数・日付・フライヤー」の段取りだけ。
 * ★ ここは画面からもテストからも呼ぶ「計算だけ」の場所。倉庫（Supabase）には触らない。
 */

export type Fryer = "gas" | "electric" | "undecided";
export type Power = "yes" | "no" | "unknown";
export type PlanStatus = "planning" | "confirmed" | "done";

export type EventPlan = {
  id?: string;
  event_date: string; // YYYY-MM-DD
  event_name: string;
  venue: string | null;
  venue_address: string | null;
  open_time: string | null;
  close_time: string | null;
  load_in: string | null;
  load_out: string | null;
  expected_sales: number | null;
  chicken_count: number | null;
  supplier: string;
  order_date: string | null;
  prep_date: string | null;
  prep_start: string | null; // 骨抜き・仕込みの開始（例 16:00）。空でもよい
  prep_end: string | null; // 終了（例 18:00）
  staff_prep: string | null;
  staff_event: string | null;
  fryer: Fryer;
  power: Power;
  power_note: string | null;
  gas_refill: boolean;
  booth_fee: number | null;
  cautions: string | null;
  contact: string | null;
  memo: string | null;
  status: PlanStatus;
};

/** 発注先の初期値（2026-10-18 じゅん：発注先は恵比寿商事） */
export const DEFAULT_SUPPLIER = "恵比寿商事";

export const SALES_PER_PIECE = 230;
export const PIECES_PER_BAG = 30;
export const KG_PER_BAG = 2;
export const BONE_PIECES_PER_HOUR = 100;
export const GAS_FRYER_SALES = 60000;
export const ORDER_LEAD_DAYS = 4;
export const PREP_LEAD_DAYS = 1;

/** 売上の想定をボタンで選べるようにする金額（円）。これ以外は手で入れられる */
export const SALES_PRESETS = [30000, 40000, 50000, 60000, 80000, 100000];

/** 発注先の選択肢（ここに無い発注先は「その他」から入れる） */
export const SUPPLIER_OPTIONS = [DEFAULT_SUPPLIER];

export const FRYER_LABEL: Record<Fryer, string> = {
  gas: "ガスフライヤー",
  electric: "電気フライヤー",
  undecided: "未定",
};

export const POWER_LABEL: Record<Power, string> = {
  yes: "あり",
  no: "なし",
  unknown: "未確認",
};

export const STATUS_LABEL: Record<PlanStatus, string> = {
  planning: "段取り中",
  confirmed: "段取り確定",
  done: "終了",
};

/** 空の段取り（新しく作るときの下書き） */
export function emptyPlan(eventDate: string): EventPlan {
  const d = defaultDates(eventDate);
  return {
    event_date: eventDate,
    event_name: "",
    venue: null,
    venue_address: null,
    open_time: null,
    close_time: null,
    load_in: null,
    load_out: null,
    expected_sales: null,
    chicken_count: null,
    supplier: DEFAULT_SUPPLIER,
    order_date: d.orderDate,
    prep_date: d.prepDate,
    prep_start: null,
    prep_end: null,
    staff_prep: null,
    staff_event: null,
    fryer: "undecided",
    power: "unknown",
    power_note: null,
    gas_refill: false,
    booth_fee: null,
    cautions: null,
    contact: null,
    memo: null,
    status: "planning",
  };
}

/** 本数を袋（2kg・30本）の単位に切り上げる */
export function roundUpToBags(pieces: number): { pieces: number; bags: number; kg: number } {
  if (!Number.isFinite(pieces) || pieces <= 0) return { pieces: 0, bags: 0, kg: 0 };
  const bags = Math.ceil(pieces / PIECES_PER_BAG);
  return { pieces: bags * PIECES_PER_BAG, bags, kg: bags * KG_PER_BAG };
}

/** 売上の想定から、頼む本数を出す（売上 ÷ 230 を袋の単位に切り上げ） */
export function estimateChicken(expectedSales: number | null): {
  pieces: number;
  bags: number;
  kg: number;
} {
  if (expectedSales == null || !Number.isFinite(expectedSales) || expectedSales <= 0) {
    return { pieces: 0, bags: 0, kg: 0 };
  }
  const raw = expectedSales / SALES_PER_PIECE;
  return roundUpToBags(raw);
}

/** 骨抜きにかかる時間（30分きざみで切り上げ） */
export function boneHours(pieces: number | null): number {
  if (pieces == null || pieces <= 0) return 0;
  return Math.ceil((pieces / BONE_PIECES_PER_HOUR) * 2) / 2;
}

/** どのフライヤーを使うかのおすすめと、その理由 */
export function recommendFryer(
  expectedSales: number | null,
  power: Power
): { fryer: Fryer; reason: string } {
  if (power === "no") {
    return { fryer: "gas", reason: "電源が無いため" };
  }
  if (expectedSales != null && expectedSales >= GAS_FRYER_SALES) {
    return {
      fryer: "gas",
      reason: `売上の想定が${GAS_FRYER_SALES.toLocaleString()}円以上で、一度にたくさん揚げる必要があるため`,
    };
  }
  if (power === "unknown") {
    return { fryer: "electric", reason: "売上は小さめ。ただし電源があるか要確認（無ければガス）" };
  }
  return { fryer: "electric", reason: "電源があり、売上は小さめのため" };
}

/** ガスの補充が要るか（ガスフライヤーを使うなら要る） */
export function needsGasRefill(fryer: Fryer): boolean {
  return fryer === "gas";
}

/** YYYY-MM-DD に日数を足す（タイムゾーンに左右されないよう UTC で計算） */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 発注日・仕込み日の初期値 */
export function defaultDates(eventDate: string): { orderDate: string; prepDate: string } {
  return {
    orderDate: shiftDate(eventDate, -ORDER_LEAD_DAYS),
    prepDate: shiftDate(eventDate, -PREP_LEAD_DAYS),
  };
}

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

/** '11/8(日)' の形にする */
export function dateLabel(date: string | null): string {
  if (!date) return "未定";
  const [y, m, d] = date.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}(${WEEKDAY[w]})`;
}

function orUndecided(v: string | null | undefined): string {
  return v && v.trim() ? v.trim() : "未定";
}

function timeRange(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  return `${a ?? ""}〜${b ?? ""}`;
}

/** 'HH:MM' 2つの間の時間（時間単位・0.5きざみ）。読めなければ null */
export function hoursBetween(start: string | null, end: string | null): number | null {
  const toMin = (t: string | null) => {
    const m = t ? /^(\d{1,2}):(\d{2})/.exec(t.trim()) : null;
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null || b <= a) return null;
  return Math.round(((b - a) / 60) * 2) / 2;
}

/** 時刻だけ（例 08:00）なら『08:00〜』にする。文章で書いてあればそのまま */
function fromTime(v: string): string {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(v.trim()) ? `${hhmm(v.trim())}〜` : v;
}

/** 'HH:MM:SS' でも 'HH:MM' に揃える */
function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

/**
 * 骨抜き・仕込みの予定を1行にする。
 * 例：'11/7(土) 16:00〜18:00（2時間）'。時間が空なら '11/7(土)（約2時間）'。
 */
export function prepLabel(plan: EventPlan): string {
  const day = dateLabel(plan.prep_date);
  const span = hoursBetween(plan.prep_start, plan.prep_end);
  if (plan.prep_start && plan.prep_end) {
    return `${day} ${hhmm(plan.prep_start)}〜${hhmm(plan.prep_end)}` + (span ? `（${span}時間）` : "");
  }
  if (plan.prep_start) return `${day} ${hhmm(plan.prep_start)}〜`;
  const h = boneHours(plan.chicken_count);
  return day + (h ? `（約${h}時間）` : "");
}

/**
 * スタッフのLINEグループに貼る文章を作る。
 * ★ 送るのはボットではなく人（コピーして貼る）。ボットの月の送信数を使わないため。
 */
export function buildLineText(plan: EventPlan): string {
  const lines: string[] = [];
  lines.push(`🍗 イベント段取り：${dateLabel(plan.event_date)} ${plan.event_name}`);
  lines.push("━━━━━━━━━━━━━━");
  if (plan.venue && plan.venue_address) {
    lines.push(`📍 会場：${plan.venue}（${plan.venue_address}）`);
  } else if (plan.venue || plan.venue_address) {
    lines.push(`📍 会場：${plan.venue ?? plan.venue_address}`);
  }
  const open = timeRange(hhmm(plan.open_time), hhmm(plan.close_time));
  if (open) lines.push(`⏰ 営業：${open}`);
  if (plan.load_in) lines.push(`🚚 搬入：${fromTime(plan.load_in)}`);
  if (plan.load_out) lines.push(`🚚 搬出：${fromTime(plan.load_out)}`);
  lines.push("");

  if (plan.expected_sales) {
    lines.push(`💴 売上の想定：${plan.expected_sales.toLocaleString()}円`);
  }
  if (plan.chicken_count) {
    const b = roundUpToBags(plan.chicken_count);
    const exact = b.pieces === plan.chicken_count;
    lines.push(
      `🐔 発注：手羽先${plan.chicken_count}本` +
        (exact ? `（2kg×${b.bags}袋＝${b.kg}kg）` : "")
    );
  } else {
    lines.push("🐔 発注：本数未定");
  }
  lines.push(`🛒 発注先：${orUndecided(plan.supplier)}／発注日：${dateLabel(plan.order_date)}`);
  lines.push(
    `🔪 骨抜き・仕込み：${prepLabel(plan)}／担当：${orUndecided(plan.staff_prep)}`
  );
  lines.push(`👤 当日の担当：${orUndecided(plan.staff_event)}`);
  lines.push("");

  lines.push(`🔥 フライヤー：${FRYER_LABEL[plan.fryer]}`);
  lines.push(
    `🔌 電源：${POWER_LABEL[plan.power]}` + (plan.power_note ? `（${plan.power_note}）` : "")
  );
  if (plan.gas_refill) lines.push("⛽ ガスの補充：必要（前日までに）");
  if (plan.booth_fee) lines.push(`🧾 出店料：${plan.booth_fee.toLocaleString()}円`);

  if (plan.cautions && plan.cautions.trim()) {
    lines.push("");
    lines.push("⚠️ 注意点");
    for (const c of plan.cautions.split(/\r?\n/)) {
      const t = c.trim().replace(/^[・\-\s]+/, "");
      if (t) lines.push(`・${t}`);
    }
  }
  if (plan.contact && plan.contact.trim()) {
    lines.push("");
    lines.push(`📞 主催：${plan.contact.trim()}`);
  }
  if (plan.memo && plan.memo.trim()) {
    lines.push("");
    lines.push(`📝 ${plan.memo.trim()}`);
  }
  return lines.join("\n");
}
