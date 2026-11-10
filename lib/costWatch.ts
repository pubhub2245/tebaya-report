/**
 * 原価率の見張り（2026-11-10 じゅん決定）— 計算の本体（データベースに触らない純粋な計算だけ）。
 *
 * ■ なにをするか（やさしい説明）
 *   現場はこれまでどおり「伝票とレシートを撮るだけ」。**現場の手数は1つも増やさない**（CLAUDE.md 3-1）。
 *   撮ったレシートの品物（例「手羽先 仕入 12kg」12,960円）から材料の単価（1kgあたり1,080円）を拾い、
 *   その材料を使う商品（手羽先1本・手羽餃子1個…）の原価と原価率を計算し直す。
 *   原価率が「目安」を超えたら、日報の LINE に1行だけ添える。
 *
 * ■ 材料の決め方（管理者が最初に1回だけ）
 *   材料ごとに「どの単位で買うか」（kg・袋・本など）と、レシートの品物名を見分ける言葉（キーワード）。
 *   商品ごとに「その材料1単位で何個ぶん作れるか」（例：鶏手羽先1kgで手羽先18本ぶん）。
 *   ＝ 商品1個の原価 ＝ Σ（材料の単価 ÷ 何個ぶん）
 *
 * ■ 守ること
 *   - **数字を作らない**：レシートから量が読めないときは単価を変えない（「量が読めない」と記録だけ残す）。
 *   - 単価が前回の 1/2 未満・2倍超に跳んだときも変えない（読み違いの疑い。人が確かめる）。
 *   - 帳簿（経理）の金額には一切触らない。ここは「見張り」だけ。
 *   `tests/costWatch.test.ts` で固定。
 */

/** 材料（買うもの） */
export type CostMaterial = {
  id: string;
  name: string;
  /** 買う単位。kg / g / L / ml / 袋 / 本 / 個 / パック など */
  unit: string;
  /** 1単位あたりの値段（円）。まだ分からなければ null */
  unit_price: number | null;
  /** レシートの品物名を見分ける言葉 */
  keywords: string[];
};

/** 商品1つに使う材料1つ（「材料1単位で何個ぶん作れるか」） */
export type CostRecipeLine = {
  product_id: number;
  material_id: string;
  /** 材料1単位で何個ぶん作れるか（0より大きい） */
  yield_per_unit: number;
};

/** 商品（sale_products の必要な所だけ） */
export type CostProduct = { id: number; name: string; price: number };

/** 原価率の目安（商品ごと）。無ければ DEFAULT_TARGET_RATIO */
export const DEFAULT_TARGET_RATIO = 30;

/** 目安を超えていなくても、これだけ上がったら知らせる（ポイント） */
export const RISE_ALERT_POINTS = 3;

/** 単価がこれ以上・以下に跳んだら読み違いを疑って変えない */
export const PRICE_JUMP_MAX = 2;

/* ------------------------------------------------------------------ */
/* レシートの品物名から量を読む                                        */
/* ------------------------------------------------------------------ */

const WEIGHT_UNITS: Record<string, { base: "kg" | "L"; factor: number }> = {
  kg: { base: "kg", factor: 1 },
  ｋｇ: { base: "kg", factor: 1 },
  キロ: { base: "kg", factor: 1 },
  g: { base: "kg", factor: 0.001 },
  ｇ: { base: "kg", factor: 0.001 },
  グラム: { base: "kg", factor: 0.001 },
  l: { base: "L", factor: 1 },
  L: { base: "L", factor: 1 },
  リットル: { base: "L", factor: 1 },
  ml: { base: "L", factor: 0.001 },
  mL: { base: "L", factor: 0.001 },
};

/** 全角の数字・記号を半角に */
function toHalf(s: string): string {
  return s
    .replace(/[０-９．Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ｘＸ✕]/g, "×");
}

/** 材料の単位を「重さ・かさ」の基準にそろえる（kg/g→kg、L/ml→L）。数える単位なら null */
export function baseOfUnit(unit: string): { base: "kg" | "L"; factor: number } | null {
  return WEIGHT_UNITS[unit.trim()] ?? null;
}

export type ParsedQty = {
  /** 重さ・かさ（基準の単位）。書いていなければ null */
  measure: { amount: number; base: "kg" | "L" } | null;
  /** 個数（「3コ×」「×2」）。書いていなければ 1 */
  count: number;
};

/**
 * 品物名から量を読む。
 *   「手羽先 仕入 12kg」→ 12kg × 1
 *   「一番搾りキャノーラ油 1500g (3コ×単530)」→ 1.5kg × 3
 *   「ポテト×2」→ 重さなし × 2
 */
export function parseQuantity(description: string): ParsedQty {
  const s = toHalf(description || "");
  let measure: ParsedQty["measure"] = null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|キロ|グラム|リットル|ml|mL|g|L|l)(?![a-zA-Z])/);
  if (m) {
    const u = WEIGHT_UNITS[m[2]];
    if (u) measure = { amount: parseFloat(m[1]) * u.factor, base: u.base };
  }
  let count = 1;
  const c1 = s.match(/(\d+)\s*(?:コ|個|袋|本|パック|P|点)\s*×/);
  const c2 = s.match(/×\s*(\d+)(?!\s*(?:kg|g|ml|L|円))/);
  if (c1) count = parseInt(c1[1], 10);
  else if (c2) count = parseInt(c2[1], 10);
  if (!Number.isFinite(count) || count <= 0) count = 1;
  return { measure, count };
}

/** 品物名がどの材料か（いちばん長いキーワードで当たった材料）。無ければ null */
export function matchMaterial<T extends CostMaterial>(description: string, materials: T[]): T | null {
  const s = toHalf(description || "");
  let best: { m: T; len: number } | null = null;
  for (const m of materials) {
    for (const k of m.keywords ?? []) {
      const kw = toHalf(k.trim());
      if (kw.length < 2) continue;
      if (s.includes(kw) && (!best || kw.length > best.len)) best = { m, len: kw.length };
    }
  }
  return best?.m ?? null;
}

/** 材料の単位でいくつ買ったか。読めなければ null（数字を作らない） */
export function quantityInUnit(material: Pick<CostMaterial, "unit">, q: ParsedQty): number | null {
  const base = baseOfUnit(material.unit);
  if (base) {
    // 重さ・かさで買う材料：品物名に重さが書いてあるときだけ
    if (!q.measure || q.measure.base !== base.base) return null;
    return (q.measure.amount * q.count) / base.factor;
  }
  // 数える材料（袋・本・個）：個数で数える（書いていなければ1つ）
  return q.count;
}

export type PriceObservation = {
  material_id: string;
  material_name: string;
  description: string;
  amount: number;
  qty: number | null;
  /** 1単位の値段。量が読めなければ null */
  unit_price: number | null;
  /** 材料の単価を書き換えてよいか */
  applied: boolean;
  /** 書き換えないときの理由 */
  reason: string | null;
};

/** 単価は小数第1位まで（1kgあたり1,080.0円など） */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 日報1件の経費の行から、材料の単価を拾う。
 * 場代など材料に当たらない行は無視する。
 */
export function observePrices(
  expenses: { description: string; amount: number; booth_fee?: boolean }[],
  materials: CostMaterial[],
): PriceObservation[] {
  const out: PriceObservation[] = [];
  for (const e of expenses ?? []) {
    if (e.booth_fee) continue;
    const amount = Math.round(Number(e.amount) || 0);
    if (amount <= 0) continue;
    const m = matchMaterial(e.description, materials);
    if (!m) continue;
    const qty = quantityInUnit(m, parseQuantity(e.description));
    if (qty === null || qty <= 0) {
      out.push({
        material_id: m.id, material_name: m.name, description: e.description, amount,
        qty: null, unit_price: null, applied: false, reason: "量が読めない",
      });
      continue;
    }
    const unit_price = round1(amount / qty);
    let applied = true;
    let reason: string | null = null;
    if (m.unit_price && m.unit_price > 0) {
      const r = unit_price / m.unit_price;
      if (r > PRICE_JUMP_MAX || r < 1 / PRICE_JUMP_MAX) {
        applied = false;
        reason = "前回の単価から大きく離れている（読み違いの疑い）";
      }
    }
    out.push({ material_id: m.id, material_name: m.name, description: e.description, amount, qty, unit_price, applied, reason });
  }
  return out;
}

/** 同じ日に同じ材料を何回か買ったら、量で重みをつけた平均の単価にまとめる */
export function newUnitPrices(obs: PriceObservation[]): Map<string, number> {
  const acc = new Map<string, { amount: number; qty: number }>();
  for (const o of obs) {
    if (!o.applied || o.qty === null || o.qty <= 0) continue;
    const a = acc.get(o.material_id) ?? { amount: 0, qty: 0 };
    a.amount += o.amount;
    a.qty += o.qty;
    acc.set(o.material_id, a);
  }
  const out = new Map<string, number>();
  acc.forEach((a, id) => out.set(id, round1(a.amount / a.qty)));
  return out;
}

/* ------------------------------------------------------------------ */
/* 商品の原価と原価率                                                  */
/* ------------------------------------------------------------------ */

export type ProductCost = {
  product_id: number;
  name: string;
  price: number;
  /** 商品1個の原価（円・小数第1位）。材料の単価が1つでも分からなければ null */
  cost: number | null;
  /** 原価率（%・小数第1位）。出せなければ null */
  ratio: number | null;
  target: number;
  /** いちばん原価に効いている材料 */
  top_material: string | null;
  /** 単価が分からない材料の名前 */
  missing: string[];
  /** 材料が1つも登録されていない */
  no_recipe: boolean;
};

export function productCosts(
  products: CostProduct[],
  recipe: CostRecipeLine[],
  prices: Map<string, number | null>,
  materialNames: Map<string, string>,
  targets: Map<number, number> = new Map(),
): ProductCost[] {
  return products.map((p) => {
    const lines = recipe.filter((r) => r.product_id === p.id && r.yield_per_unit > 0);
    const missing: string[] = [];
    let cost = 0;
    let top: { name: string; c: number } | null = null;
    for (const l of lines) {
      const up = prices.get(l.material_id);
      const name = materialNames.get(l.material_id) ?? "材料";
      if (up === null || up === undefined) {
        missing.push(name);
        continue;
      }
      const c = up / l.yield_per_unit;
      cost += c;
      if (!top || c > top.c) top = { name, c };
    }
    const ok = lines.length > 0 && missing.length === 0;
    const costR = ok ? round1(cost) : null;
    const ratio = ok && p.price > 0 ? round1((cost / p.price) * 100) : null;
    return {
      product_id: p.id,
      name: p.name,
      price: p.price,
      cost: costR,
      ratio,
      target: targets.get(p.id) ?? DEFAULT_TARGET_RATIO,
      top_material: top?.name ?? null,
      missing,
      no_recipe: lines.length === 0,
    };
  });
}

/** 目安の原価率に戻すための売値（10円単位で切り上げ） */
export function priceForTarget(cost: number, targetRatio: number): number {
  if (targetRatio <= 0) return 0;
  return Math.ceil(cost / (targetRatio / 100) / 10) * 10;
}

export type CostAlert = {
  name: string;
  before: number;
  after: number;
  target: number;
  cause: string | null;
  cost: number;
  price: number;
};

/**
 * 単価を書き換える前と後をくらべて、知らせる商品を選ぶ。
 *   ・目安を超えた（前は目安以下）
 *   ・目安を超えていて、さらに RISE_ALERT_POINTS 以上上がった
 *   ・目安以下でも RISE_ALERT_POINTS 以上上がった
 */
export function costAlerts(
  before: ProductCost[],
  after: ProductCost[],
  changes: Map<string, { name: string; pct: number }>,
  recipe: CostRecipeLine[],
): CostAlert[] {
  const out: CostAlert[] = [];
  for (const a of after) {
    const b = before.find((x) => x.product_id === a.product_id);
    if (!b || b.ratio === null || a.ratio === null || a.cost === null) continue;
    const rise = a.ratio - b.ratio;
    if (rise <= 0) continue;
    const crossed = b.ratio <= a.target && a.ratio > a.target;
    if (!crossed && rise < RISE_ALERT_POINTS) continue;
    // 原因：この商品に使う材料のうち、いちばん上がったもの
    let cause: string | null = null;
    let best = 0;
    for (const l of recipe) {
      if (l.product_id !== a.product_id) continue;
      const c = changes.get(l.material_id);
      if (c && c.pct > best) {
        best = c.pct;
        cause = `${c.name} +${Math.round(c.pct)}%`;
      }
    }
    out.push({ name: a.name, before: b.ratio, after: a.ratio, target: a.target, cause, cost: a.cost, price: a.price });
  }
  return out;
}

/** 日報の LINE に添える文（知らせが無ければ空文字） */
export function costAlertText(alerts: CostAlert[]): string {
  if (alerts.length === 0) return "";
  const lines = alerts.map((a) => {
    const back = priceForTarget(a.cost, a.target);
    return (
      `・${a.name} ${a.before}% → ${a.after}%（目安${a.target}%）` +
      (a.cause ? `\n　原因：${a.cause}` : "") +
      `\n　今の売値${a.price}円／${a.target}%に戻す売値${back}円`
    );
  });
  return `\n\n⚠️ 原価率のお知らせ\n${lines.join("\n")}`;
}

/** 材料ごとの値上がり率（%）。前の単価が無ければ入れない。キーは材料の id */
export function priceChanges(
  materials: CostMaterial[],
  next: Map<string, number>,
): Map<string, { name: string; pct: number }> {
  const out = new Map<string, { name: string; pct: number }>();
  for (const m of materials) {
    const n = next.get(m.id);
    if (n === undefined || !m.unit_price || m.unit_price <= 0) continue;
    const pct = ((n - m.unit_price) / m.unit_price) * 100;
    if (Math.abs(pct) >= 0.5) out.set(m.id, { name: m.name, pct });
  }
  return out;
}
