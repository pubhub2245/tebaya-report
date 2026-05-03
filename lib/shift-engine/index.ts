/**
 * シフト推奨エンジン統合モジュール。
 *
 * generateMonthlyShift(pdfBuffer, year, month) を呼ぶと、
 * shifts テーブルに INSERT 可能な MonthlyShift を返す。
 *
 * 処理:
 *   PDFパース → ながやま選定 → 全体スケジュール構築 → スタッフ割当 → 整形
 *
 * DB INSERT 自体はこのモジュールでは行わない（プロンプト4の API Route で実施）。
 */

import {
  parseNagayamaPDF,
  type NagayamaParseResult,
} from "../nagayama-parser";
import { matchLocation } from "../locationMatcher";
import { NOTE_MARKERS } from "../shift-config";
import { selectNagayamaDates } from "./nagayama-selector";
import { buildFullSchedule } from "./extra-stores";
import { assignStaff } from "./staff-assigner";
import type { MonthlyShift, ShiftDay, ShiftStore } from "./types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * パーサー結果を受け取って月次シフトを生成する。
 * UI で「読み取り結果の検証画面」を挟む場合は parse 済みの結果を渡してこちらを直接呼ぶ。
 */
export async function generateMonthlyShiftFromParsed(
  parsed: Pick<NagayamaParseResult, "schedule" | "confirmed" | "meta" | "warnings">,
  year: number,
  month: number,
): Promise<MonthlyShift> {
  const allWarnings: string[] = [];

  // パース時点で出た警告をそのまま伝搬
  if (parsed.warnings && parsed.warnings.length > 0) {
    allWarnings.push(...parsed.warnings.map((w) => `[parser] ${w}`));
  }

  if (!parsed.meta.detectedMonths.includes(month)) {
    throw new Error(
      `PDFに ${month} 月のデータが含まれていません（検出月: [${parsed.meta.detectedMonths.join(", ")}]）`,
    );
  }

  // 2. ながやま選定（確定日込み）
  const nagayamaSelection = selectNagayamaDates(
    parsed.schedule,
    parsed.confirmed,
    year,
    month,
  );
  allWarnings.push(...nagayamaSelection.warnings);

  // 3. 全体スケジュール構築
  // 確定日 + 推奨日をマージして buildFullSchedule に渡す
  const mergedByStore: Record<string, number[]> = {};
  for (const store of Object.keys(nagayamaSelection.byStore)) {
    mergedByStore[store] = [
      ...(nagayamaSelection.confirmedByStore[store] ?? []),
      ...nagayamaSelection.byStore[store],
    ].sort((a, b) => a - b);
  }
  const fullSchedule = buildFullSchedule(
    {
      byStore: mergedByStore,
      confirmedByStore: {},
      warnings: [],
    },
    year,
    month,
  );
  allWarnings.push(...fullSchedule.warnings);

  // 4. スタッフ割当
  const staffed = assignStaff(fullSchedule, year, month);
  allWarnings.push(...staffed.warnings);

  // 5. ShiftDay[] 形式に整形（locations 紐付け）
  const days: ShiftDay[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const staffSummary: Record<string, number> = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    const stores: ShiftStore[] = [];

    for (const entry of staffed.byDay[day] ?? []) {
      const loc = await matchLocation(entry.storeName);
      if (!loc) {
        allWarnings.push(
          `${month}/${day}: 「${entry.storeName}」が locations に見つかりません`,
        );
      }

      // note の確定:
      //   - entry.note (= 【スタッフ要設定】) は最優先で保持
      //   - ながやま系 → null（確定枠）
      //   - その他 → 【未確定】
      let note = entry.note;
      if (!note && !entry.storeName.startsWith("ながやま")) {
        note = NOTE_MARKERS.UNCONFIRMED;
      }

      stores.push({
        storeName: entry.storeName,
        locationId: loc?.id ?? null,
        rank: loc?.rank ?? null,
        target: loc?.target ?? null,
        staffName: entry.staffName,
        note,
      });

      if (entry.staffName) {
        staffSummary[entry.staffName] =
          (staffSummary[entry.staffName] ?? 0) + 1;
      }
    }

    days.push({
      day,
      date,
      weekday: d.getDay(),
      stores,
    });
  }

  return { year, month, days, warnings: allWarnings, staffSummary };
}

/**
 * PDF Buffer から月次シフトを生成する従来のエントリポイント。
 * 内部では parseNagayamaPDF → generateMonthlyShiftFromParsed の順に呼ぶだけ。
 */
export async function generateMonthlyShift(
  pdfBuffer: Buffer,
  year: number,
  month: number,
): Promise<MonthlyShift> {
  const parsed = await parseNagayamaPDF(pdfBuffer, { year });
  return generateMonthlyShiftFromParsed(parsed, year, month);
}

// 各Step関数も再export（テスト用）
export { selectNagayamaDates } from "./nagayama-selector";
export { buildFullSchedule } from "./extra-stores";
export { assignStaff } from "./staff-assigner";
export type {
  MonthlyShift,
  ShiftDay,
  ShiftStore,
  NagayamaSuggestion,
  FullSchedule,
  ShiftStoreWithStaff,
} from "./types";
