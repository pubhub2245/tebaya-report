/**
 * Step 1: ながやま店舗の出店日選定（スコアリング＋貪欲法）
 *
 * Python 版 suggest_shift.py の `suggest_nagayama_dates()` を翻訳。
 * 都北店のソフト制約（NAGAYAMA_DAY_PREFERENCE）はスコアに加算する形で実装。
 *
 * 確定日（PDFで「手羽屋」表記あり）は推奨選定の対象外。最初に登録し、
 * 推奨選定の制約チェックでは「確定日 + 推奨日」の合算配列を使う。
 * 確定日同士の組み合わせはハード制約違反でも許容（PDFが既に決めたことなので変更不可）。
 *
 * ハード制約:
 *   H1 同日に2店舗のながやま重複禁止
 *   H2 STORE_MONTHLY_TARGET に達したら打ち止め
 *   H3 連続3日まで（4日連続禁止）
 *   H4 同店舗で同一週に2回まで（3回目以降禁止）
 *   H5 土日比率上限 WEEKEND_RATIO_CAP
 *
 * 第1ループで全制約適用、第2ループでフォールバック（H1, H3, H4 を維持し
 * H2(target) と H5(土日比率) のみ緩和）。
 */

import type { NagayamaSchedule } from "../nagayama-parser";
import type { NagayamaSuggestion } from "./types";
import {
  NAGAYAMA_TARGETS,
  STORE_RANK,
  STORE_MONTHLY_TARGET,
  WEEKEND_RATIO_CAP,
  NAGAYAMA_DAY_PREFERENCE,
  isHoliday,
  isWeekend,
} from "../shift-config";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * schedule[store] のうち、指定年月の null セル（空き）の day 配列を返す。
 * 該当店舗のエントリが無い場合は [] を返す。
 */
function getAvailableDays(
  schedule: NagayamaSchedule,
  store: string,
  year: number,
  month: number,
): number[] {
  const dates = schedule[store];
  if (!dates) return [];
  const prefix = `${year}-${pad2(month)}-`;
  const days: number[] = [];
  for (const [iso, value] of Object.entries(dates)) {
    if (!iso.startsWith(prefix)) continue;
    if (value === null) {
      const day = parseInt(iso.slice(8), 10);
      if (Number.isFinite(day)) days.push(day);
    }
  }
  return days;
}

/**
 * その日×その店舗の出店スコア。
 *   ベース 100 ＋ 共通ボーナス（祝日/特別日）＋ ランク別ボーナス
 *   ＋ NAGAYAMA_DAY_PREFERENCE のソフト制約加減算
 */
function scoreDayForStore(d: Date, store: string): number {
  let s = 100.0;
  const isW = isWeekend(d);
  const isH = isHoliday(d);
  const isSp = d.getDate() === 20 || d.getDate() === 30;

  if (isH) s += 30;
  if (isSp) s += 15;

  const rank = STORE_RANK[store];
  if (rank === "A") {
    if (isW) s += 50;
    if (isH) s += 20;
    if (!isW && !isH) s -= 10;
  } else if (rank === "B") {
    if (isW || isH) s += 30;
  } else {
    // C, D, undefined
    if (isW) s += 10;
  }

  // 都北店等のソフト制約
  const pref = NAGAYAMA_DAY_PREFERENCE[store];
  if (pref) {
    const dow = d.getDay();
    if (pref.preferredWeekdays.includes(dow)) {
      s += pref.bonus;
    } else {
      s += pref.penalty;
    }
  }

  return s;
}

/** 既存配列＋追加 day で連続日数が maxRun を超えるか */
function wouldMakeLongRun(
  day: number,
  current: number[],
  maxRun = 3,
): boolean {
  const ds = new Set([...current, day]);
  let n = 1;
  for (let x = day - 1; ds.has(x); x--) n++;
  for (let x = day + 1; ds.has(x); x++) n++;
  return n > maxRun;
}

/** ISO週（year, week）を返す */
function getISOWeek(d: Date): { year: number; week: number } {
  const target = new Date(d.valueOf());
  target.setHours(0, 0, 0, 0);
  // target を木曜日に揃える（ISO週の基準）
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = target.valueOf();
  const yearStart = new Date(target.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((firstThursday - yearStart.valueOf()) / 86400000 -
        3 +
        ((yearStart.getDay() + 6) % 7)) /
        7,
    );
  return { year: target.getFullYear(), week };
}

function isSameWeek(
  d1: number,
  d2: number,
  year: number,
  month: number,
): boolean {
  const w1 = getISOWeek(new Date(year, month - 1, d1));
  const w2 = getISOWeek(new Date(year, month - 1, d2));
  return w1.year === w2.year && w1.week === w2.week;
}

/** day を加える前提で、same-week カウントを返す（current には自店舗の既出店日を渡す） */
function sameWeekCountForDays(
  day: number,
  currentDays: number[],
  year: number,
  month: number,
): number {
  let c = 0;
  for (const existing of currentDays) {
    if (isSameWeek(day, existing, year, month)) c++;
  }
  return c;
}

/** day を加えると土日比率上限を超えるか（current には自店舗の既出店日を渡す） */
function wouldExceedWeekendCapForDays(
  store: string,
  day: number,
  currentDays: number[],
  year: number,
  month: number,
): boolean {
  const cap = WEEKEND_RATIO_CAP[store];
  if (cap === undefined || cap >= 1) return false;
  const target = STORE_MONTHLY_TARGET[store] ?? 0;
  if (target <= 0) return false;
  const isWE = isWeekend(new Date(year, month - 1, day));
  if (!isWE) return false;
  let weCount = 0;
  for (const d of currentDays) {
    if (isWeekend(new Date(year, month - 1, d))) weCount++;
  }
  return (weCount + 1) / target > cap;
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

export function selectNagayamaDates(
  schedule: NagayamaSchedule,
  confirmed: Record<string, string[]>,
  year: number,
  month: number,
): NagayamaSuggestion {
  const warnings: string[] = [];

  // ----- Step 1: 確定日を最初に登録 -----
  // 確定日にはハード制約チェックを適用しない（PDFで既に決まっているため）。
  // 確定日同士の H3/H4/H5 違反は警告として記録するが、シフトには含める。
  const confirmedByStore: Record<string, number[]> = {};
  const allUsedDays = new Set<number>(); // 確定日 + 推奨日 を統合管理（H1）

  for (const store of NAGAYAMA_TARGETS) {
    const confirmedDateISOs = confirmed[store] ?? [];
    const monthConfirmed: number[] = [];
    for (const dateISO of confirmedDateISOs) {
      const d = new Date(dateISO);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        monthConfirmed.push(day);
        allUsedDays.add(day);
      }
    }
    monthConfirmed.sort((a, b) => a - b);
    confirmedByStore[store] = monthConfirmed;
  }

  // 確定日同士のハード制約違反を警告
  for (const store of NAGAYAMA_TARGETS) {
    const days = confirmedByStore[store];
    if (days.length === 0) continue;
    // H3: 連続日チェック
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      if (days[i] === days[i - 1] + 1) {
        run++;
        if (run > 3) {
          warnings.push(
            `${store}: 確定日が${run}日連続 (PDF表記のまま許容、${month}/${days[i - run + 1]}〜${month}/${days[i]})`,
          );
        }
      } else {
        run = 1;
      }
    }
    // H4: 同一週カウント
    const wcount: Record<string, number[]> = {};
    for (const d of days) {
      const wk = getISOWeek(new Date(year, month - 1, d));
      const key = `${wk.year}-${wk.week}`;
      (wcount[key] ??= []).push(d);
    }
    for (const ds of Object.values(wcount)) {
      if (ds.length > 2) {
        warnings.push(
          `${store}: 確定日が同一週に${ds.length}回 (PDF表記のまま許容、${ds.map((d) => `${month}/${d}`).join(", ")})`,
        );
      }
    }
  }

  // ----- Step 2: 推奨選定（不足分のみ）-----
  const sugg: Record<string, number[]> = {};
  for (const s of NAGAYAMA_TARGETS) sugg[s] = [];

  // 候補抽出（確定日は除外）
  type Candidate = { score: number; store: string; day: number };
  const candidates: Candidate[] = [];
  for (const store of NAGAYAMA_TARGETS) {
    const days = getAvailableDays(schedule, store, year, month);
    const confirmedSet = new Set(confirmedByStore[store]);
    for (const day of days) {
      if (confirmedSet.has(day)) continue; // 自店舗の確定日は推奨対象外
      const d = new Date(year, month - 1, day);
      const score = scoreDayForStore(d, store);
      candidates.push({ score, store, day });
    }
  }

  // (score 降順, day 昇順) でソート
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.day - b.day;
  });

  // ----- 第1ループ：全制約適用 -----
  // 制約チェックは「確定日 + 推奨日」の合算配列に対して行う。
  for (const { store, day } of candidates) {
    if (allUsedDays.has(day)) continue; // H1 (他店舗の確定日 or 推奨日と衝突)
    const target = STORE_MONTHLY_TARGET[store] ?? 0;
    const totalSelected = confirmedByStore[store].length + sugg[store].length;
    if (totalSelected >= target) continue; // H2

    const combined = [...confirmedByStore[store], ...sugg[store]];
    if (wouldMakeLongRun(day, combined, 3)) continue; // H3
    if (sameWeekCountForDays(day, combined, year, month) >= 2) continue; // H4
    if (wouldExceedWeekendCapForDays(store, day, combined, year, month)) continue; // H5

    sugg[store].push(day);
    allUsedDays.add(day);
  }

  // ----- 第2ループ：フォールバック -----
  // H1/H3/H4 維持、H2(target上限) と H5(土日比率) のみ緩和。
  for (const store of NAGAYAMA_TARGETS) {
    const target = STORE_MONTHLY_TARGET[store] ?? 0;
    const remaining = target - confirmedByStore[store].length - sugg[store].length;
    if (remaining <= 0) continue;
    for (const { store: s, day } of candidates) {
      if (s !== store) continue;
      if (allUsedDays.has(day)) continue; // H1
      if (sugg[store].includes(day)) continue;

      const combined = [...confirmedByStore[store], ...sugg[store]];
      if (wouldMakeLongRun(day, combined, 3)) continue; // H3
      if (sameWeekCountForDays(day, combined, year, month) >= 2) continue; // H4

      sugg[store].push(day);
      allUsedDays.add(day);
      const remainingNow =
        target - confirmedByStore[store].length - sugg[store].length;
      if (remainingNow <= 0) break;
    }
  }

  // ----- 警告生成 -----
  for (const store of NAGAYAMA_TARGETS) {
    const target = STORE_MONTHLY_TARGET[store] ?? 0;
    const totalSelected = confirmedByStore[store].length + sugg[store].length;
    if (totalSelected < target) {
      warnings.push(
        `${store}: 確定${confirmedByStore[store].length}日 + 推奨${sugg[store].length}日 = ${totalSelected}日（目標${target}日に対し未達。PDF空き枠不足）`,
      );
    }
    // ソフト制約の遵守状況（推奨日のみ評価）
    const pref = NAGAYAMA_DAY_PREFERENCE[store];
    if (pref && sugg[store].length > 0) {
      const offDays = sugg[store].filter((day) => {
        const dow = new Date(year, month - 1, day).getDay();
        return !pref.preferredWeekdays.includes(dow);
      });
      if (offDays.length > 0) {
        warnings.push(
          `${store}: 火木日以外への推奨割当 ${offDays.length}日（${offDays.map((d) => `${month}/${d}`).join(", ")}）`,
        );
      }
    }
  }

  // 各店舗の選定日リストを昇順ソート
  for (const store of NAGAYAMA_TARGETS) {
    sugg[store].sort((a, b) => a - b);
  }

  return { byStore: sugg, confirmedByStore, warnings };
}
