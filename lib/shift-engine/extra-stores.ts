/**
 * Step 2-3: ながやま以外の店舗配置 + 空き日埋め
 *
 * Python 版 build_full_shift.py の各 assign_* / fill_empty_days を翻訳。
 *
 * 順序:
 *   2-1 ながやま配置（Step1の結果を反映）
 *   2-2 イオン
 *   2-3 マンガ倉庫
 *   2-4 朝市（ニクルの朝市、日曜のみ）
 *   2-5 パシオ（パシオたかお店、パシオ志比田店、平日のみ）
 *   3   空き日埋め（マンガ倉庫）
 *
 * 1日あたりの店舗数は最大2件、同種店舗の重複は不可。
 */

import type { NagayamaSuggestion, FullSchedule } from "./types";
import { EXTRA_STORE_TARGETS, isHoliday } from "../shift-config";

const MAX_STORES_PER_DAY = 2;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dateOf(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function dowJs(year: number, month: number, day: number): number {
  return dateOf(year, month, day).getDay(); // 0=日, 6=土
}

function isWeekendDay(year: number, month: number, day: number): boolean {
  const dow = dowJs(year, month, day);
  return dow === 0 || dow === 6;
}

function pickEvenly<T>(items: T[], n: number): T[] {
  if (n <= 0 || items.length === 0) return [];
  if (n >= items.length) return items.slice();
  const out: T[] = [];
  const step = items.length / n;
  for (let i = 0; i < n; i++) {
    const idx = Math.min(Math.floor(i * step + step / 2), items.length - 1);
    out.push(items[idx]);
  }
  return out;
}

function ngmStoreName(store: string): string {
  // Step 1 が返す内部表記 → matchLocation で解決可能なフルネームへ
  if (store === "志比田") return "ながやま志比田店";
  return "ながやま" + store;
}

function canAddStore(byDay: Record<number, string[]>, day: number): boolean {
  return (byDay[day]?.length ?? 0) < MAX_STORES_PER_DAY;
}

function hasStore(
  byDay: Record<number, string[]>,
  day: number,
  storeName: string,
): boolean {
  return byDay[day]?.includes(storeName) ?? false;
}

function hasAnyPrefix(
  byDay: Record<number, string[]>,
  day: number,
  prefix: string,
): boolean {
  return (byDay[day] ?? []).some((s) => s.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// 2-2 イオン
// ---------------------------------------------------------------------------

function assignAeon(
  byDay: Record<number, string[]>,
  year: number,
  month: number,
  target: number,
  warnings: string[],
): void {
  const storeName = "イオンモール都城駅前";
  type C = { day: number; score: number };
  const candidates: C[] = [];
  const dim = daysInMonth(year, month);
  for (let day = 1; day <= dim; day++) {
    const d = dateOf(year, month, day);
    const dow = d.getDay(); // 2=火
    const isHol = isHoliday(d);
    const isSp = day === 20 || day === 30;
    const isTuesday = dow === 2;
    if (!isHol && !isSp && !isTuesday) continue;
    let score = 0;
    if (isHol) score += 30;
    if (isSp) score += 25;
    if (isTuesday) score += 20;
    candidates.push({ day, score });
  }
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.day - b.day;
  });

  let placed = 0;
  for (const { day } of candidates) {
    if (placed >= target) break;
    if (!canAddStore(byDay, day)) continue;
    if (hasStore(byDay, day, storeName)) continue;
    byDay[day].push(storeName);
    placed++;
  }
  if (placed < target) {
    warnings.push(
      `${storeName}: 目標${target}件に対し配置${placed}件（候補日不足）`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2-3 マンガ倉庫
// ---------------------------------------------------------------------------

function assignMangaSouko(
  byDay: Record<number, string[]>,
  year: number,
  month: number,
  target: number,
  warnings: string[],
): void {
  const storeName = "マンガ倉庫";
  type C = { day: number; score: number };
  const candidates: C[] = [];
  const dim = daysInMonth(year, month);
  for (let day = 1; day <= dim; day++) {
    let score = 0;
    if (isWeekendDay(year, month, day)) score += 10;
    if (day <= 7) score += 3;
    candidates.push({ day, score });
  }
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.day - b.day;
  });

  let placed = 0;
  for (const { day } of candidates) {
    if (placed >= target) break;
    if (!canAddStore(byDay, day)) continue;
    if (hasStore(byDay, day, storeName)) continue;
    byDay[day].push(storeName);
    placed++;
  }
  if (placed < target) {
    warnings.push(
      `${storeName}: 目標${target}件に対し配置${placed}件（候補日不足）`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2-4 朝市（ニクルの朝市、日曜のみ）
// ---------------------------------------------------------------------------

function assignMorningMarket(
  byDay: Record<number, string[]>,
  year: number,
  month: number,
  target: number,
  warnings: string[],
): void {
  const storeName = "ニクルの朝市";
  const dim = daysInMonth(year, month);
  const sundays: number[] = [];
  for (let day = 1; day <= dim; day++) {
    if (dowJs(year, month, day) === 0) sundays.push(day);
  }
  const picked = pickEvenly(sundays, target);

  let placed = 0;
  for (const day of picked) {
    if (!canAddStore(byDay, day)) continue;
    if (hasStore(byDay, day, storeName)) continue;
    byDay[day].push(storeName);
    placed++;
  }
  if (placed < target) {
    warnings.push(
      `${storeName}: 目標${target}件に対し配置${placed}件（日曜不足）`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2-5 パシオ
// ---------------------------------------------------------------------------

function assignPasio(
  byDay: Record<number, string[]>,
  storeName: string,
  year: number,
  month: number,
  target: number,
  warnings: string[],
): void {
  const dim = daysInMonth(year, month);
  // 平日のみ、イオン・パシオが入っていない日が候補
  const candidates: number[] = [];
  for (let day = 1; day <= dim; day++) {
    if (isWeekendDay(year, month, day)) continue;
    if (hasAnyPrefix(byDay, day, "イオン")) continue;
    if (hasAnyPrefix(byDay, day, "パシオ")) continue;
    if (!canAddStore(byDay, day)) continue;
    candidates.push(day);
  }
  const picked = pickEvenly(candidates, target);

  let placed = 0;
  for (const day of picked) {
    if (!canAddStore(byDay, day)) continue;
    if (hasStore(byDay, day, storeName)) continue;
    byDay[day].push(storeName);
    placed++;
  }
  if (placed < target) {
    warnings.push(
      `${storeName}: 目標${target}件に対し配置${placed}件（平日候補不足）`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3 空き日埋め
// ---------------------------------------------------------------------------

function fillEmptyDays(
  byDay: Record<number, string[]>,
  year: number,
  month: number,
  warnings: string[],
): void {
  const storeName = "マンガ倉庫";
  const dim = daysInMonth(year, month);
  let stillEmpty = 0;
  for (let day = 1; day <= dim; day++) {
    if ((byDay[day]?.length ?? 0) === 0) {
      byDay[day].push(storeName);
    }
    if ((byDay[day]?.length ?? 0) === 0) stillEmpty++;
  }
  if (stillEmpty > 0) {
    warnings.push(`空き日埋め後にも空き ${stillEmpty}日（想定外）`);
  }
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

export function buildFullSchedule(
  nagayamaSelection: NagayamaSuggestion,
  year: number,
  month: number,
): FullSchedule {
  const byDay: Record<number, string[]> = {};
  const dim = daysInMonth(year, month);
  for (let d = 1; d <= dim; d++) byDay[d] = [];

  const warnings: string[] = [];

  // 2-1 ながやま配置
  for (const [store, days] of Object.entries(nagayamaSelection.byStore)) {
    const name = ngmStoreName(store);
    for (const day of days) {
      if (!byDay[day]) byDay[day] = [];
      // 同日に同一ながやま店舗が二度入ることは Step1 の H1 で防いでいるが念のため
      if (!byDay[day].includes(name)) byDay[day].push(name);
    }
  }

  // 2-2 イオン
  assignAeon(
    byDay,
    year,
    month,
    EXTRA_STORE_TARGETS["イオンモール都城駅前"] ?? 0,
    warnings,
  );

  // 2-3 マンガ倉庫
  assignMangaSouko(
    byDay,
    year,
    month,
    EXTRA_STORE_TARGETS["マンガ倉庫"] ?? 0,
    warnings,
  );

  // 2-4 朝市
  assignMorningMarket(
    byDay,
    year,
    month,
    EXTRA_STORE_TARGETS["ニクルの朝市"] ?? 0,
    warnings,
  );

  // 2-5 パシオ
  assignPasio(
    byDay,
    "パシオたかお店",
    year,
    month,
    EXTRA_STORE_TARGETS["パシオたかお店"] ?? 0,
    warnings,
  );
  assignPasio(
    byDay,
    "パシオ志比田店",
    year,
    month,
    EXTRA_STORE_TARGETS["パシオ志比田店"] ?? 0,
    warnings,
  );

  // 3 空き日埋め
  fillEmptyDays(byDay, year, month, warnings);

  return { byDay, warnings };
}
