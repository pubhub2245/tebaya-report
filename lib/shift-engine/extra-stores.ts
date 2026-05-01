/**
 * Step 2: ながやま以外の店舗配置
 *
 * 運用見直しにより、自動配置はマンガ倉庫（土日のみ）だけに絞った。
 * イオン・パシオ・朝市はUIから手動追加する運用に変更。
 *
 * 平日でながやま系・土日マンガ倉庫の自動配置がない日は「休み」（空配列）
 * として明示する。空き日を埋めるロジック（旧 fillEmptyDays）は削除した。
 */

import type { NagayamaSuggestion, FullSchedule } from "./types";
import {
  EXTRA_STORE_TARGETS,
  MANGA_SOUKO_WEEKEND_ONLY,
  isWeekend,
} from "../shift-config";

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

// ---------------------------------------------------------------------------
// マンガ倉庫（土日のみ自動配置）
// ---------------------------------------------------------------------------

function assignMangaSouko(
  byDay: Record<number, string[]>,
  year: number,
  month: number,
  warnings: string[],
): void {
  const storeName = "マンガ倉庫";
  const target = EXTRA_STORE_TARGETS[storeName] ?? 0;
  if (target <= 0) return;

  type C = { day: number; score: number };
  const candidates: C[] = [];
  const dim = daysInMonth(year, month);
  for (let day = 1; day <= dim; day++) {
    const d = dateOf(year, month, day);
    if (MANGA_SOUKO_WEEKEND_ONLY && !isWeekend(d)) continue;

    let score = 0;
    if (isWeekend(d)) score += 10;
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
      `${storeName}: 目標${target}件に対し配置${placed}件（土日の空き枠不足）`,
    );
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

  // ながやま配置（Step 1 の結果）
  for (const [store, days] of Object.entries(nagayamaSelection.byStore)) {
    const name = ngmStoreName(store);
    for (const day of days) {
      if (!byDay[day]) byDay[day] = [];
      // 同日に同一ながやま店舗が二度入ることは Step1 の H1 で防いでいるが念のため
      if (!byDay[day].includes(name)) byDay[day].push(name);
    }
  }

  // マンガ倉庫（土日のみ）
  assignMangaSouko(byDay, year, month, warnings);

  // 平日でながやま自動配置がない日、土日でマンガ倉庫が入らなかった日は
  // 「休み」（空配列）のまま残す。旧 fillEmptyDays は削除済み。

  return { byDay, warnings };
}
