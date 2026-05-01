/**
 * Step 4: スタッフ割当
 *
 * Python版には無い、TS版で新規追加するロジック。
 *
 * 規則:
 *   ながやま系 → 月=なぎさ / 水=イデ / 他=かずき
 *   マンガ倉庫 / イオン / パシオ → じゅん
 *   ニクルの朝市 → かずき
 *
 * NOTE: プロンプト3.6で自動配置はながやま＋マンガ倉庫(土日)のみに絞られたが、
 *   イオン/パシオ/朝市の分岐はそのまま残している。将来UIから手動追加された
 *   店舗が同じ assignStaff を通る想定で、削除しても害は少ないが残置している。
 *
 * 競合:
 *   - 同人重複（同日に同一スタッフが2店舗）→ 後発を null + 【スタッフ要設定】
 *     優先順位: ながやま > マンガ倉庫 > イオン > パシオ > 朝市
 *   - 曜日不可（STAFF_WEEKLY_PATTERN[staff][weekdayJp] === false）→ null + 【スタッフ要設定】
 */

import type { FullSchedule, ShiftStoreWithStaff } from "./types";
import {
  STAFF_WEEKLY_PATTERN,
  NOTE_MARKERS,
  getJpWeekdayIndex,
  type StaffName,
} from "../shift-config";

const STAFF_REQUIRED = NOTE_MARKERS.STAFF_REQUIRED;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** 日本式曜日（0=月..6=日） */
function jpDow(year: number, month: number, day: number): number {
  return getJpWeekdayIndex(new Date(year, month - 1, day));
}

const WEEKDAY_LABEL_JP = ["月", "火", "水", "木", "金", "土", "日"];

/**
 * 店舗の優先度（小さい数字ほど高優先 = 先に割当）。
 * 同日に同一スタッフが必要になった場合、後発（数字が大きい方）が null になる。
 */
function priorityOf(storeName: string): number {
  if (storeName.startsWith("ながやま")) return 0;
  if (storeName === "マンガ倉庫") return 1;
  if (storeName.startsWith("イオン")) return 2;
  if (storeName.startsWith("パシオ")) return 3;
  if (storeName === "ニクルの朝市") return 4;
  return 5; // 想定外（フォールバック）
}

/**
 * 店舗ごとのデフォルトスタッフ。
 * weekdayJp は日本式（0=月）で渡す。
 */
function getDefaultStaff(
  storeName: string,
  weekdayJp: number,
): StaffName {
  if (storeName.startsWith("ながやま")) {
    if (weekdayJp === 0) return "なぎさ";
    if (weekdayJp === 2) return "イデ";
    return "かずき";
  }
  if (storeName === "マンガ倉庫") return "じゅん";
  if (storeName.startsWith("イオン")) return "じゅん";
  if (storeName.startsWith("パシオ")) return "じゅん";
  if (storeName === "ニクルの朝市") return "かずき";
  return "かずき";
}

/** STAFF_WEEKLY_PATTERN を参照して、その曜日にそのスタッフがアサイン可能か */
function canWorkThatDay(staff: StaffName, weekdayJp: number): boolean {
  const pat = STAFF_WEEKLY_PATTERN[staff];
  if (!pat) return true;
  return pat[weekdayJp] === true;
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

export function assignStaff(
  schedule: FullSchedule,
  year: number,
  month: number,
): {
  byDay: Record<number, ShiftStoreWithStaff[]>;
  warnings: string[];
} {
  const byDay: Record<number, ShiftStoreWithStaff[]> = {};
  const warnings: string[] = [];

  for (const [dayStr, stores] of Object.entries(schedule.byDay)) {
    const day = parseInt(dayStr, 10);
    const weekdayJp = jpDow(year, month, day);

    // 優先度ソート
    const sorted = [...stores].sort(
      (a, b) => priorityOf(a) - priorityOf(b),
    );

    const usedStaff = new Set<StaffName>();
    const out: ShiftStoreWithStaff[] = [];

    for (const storeName of sorted) {
      const defaultStaff = getDefaultStaff(storeName, weekdayJp);
      let staffName: string | null = defaultStaff;
      let note: string | null = null;

      // 曜日不可
      if (!canWorkThatDay(defaultStaff, weekdayJp)) {
        warnings.push(
          `${month}/${day} (${WEEKDAY_LABEL_JP[weekdayJp]}): ${storeName} はデフォルト ${defaultStaff} だが曜日不可、要手動設定`,
        );
        staffName = null;
        note = STAFF_REQUIRED;
      } else if (usedStaff.has(defaultStaff)) {
        // 同日重複
        warnings.push(
          `${month}/${day} (${WEEKDAY_LABEL_JP[weekdayJp]}): ${storeName} のデフォルト ${defaultStaff} が同日重複、要手動設定`,
        );
        staffName = null;
        note = STAFF_REQUIRED;
      } else {
        usedStaff.add(defaultStaff);
      }

      out.push({ storeName, staffName, note });
    }

    byDay[day] = out;
  }

  return { byDay, warnings };
}
