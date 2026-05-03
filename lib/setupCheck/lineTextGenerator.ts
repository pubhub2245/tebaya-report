import type { SetupCheckRecord } from "./types";
import { calculateBreakdown, formatDenominationLabel } from "./cashCalculator";

/**
 * LINE投稿用テキスト生成。
 *
 * 例:
 *   【設営後チェック】 かずき
 *   【出店場所】 イオンモール
 *
 *   🪙 レジ確認
 *   * 10円 × 13枚 = 130円
 *   ...
 *
 *   ▶ レジ合計：¥18,393（前回差 +¥150）
 *
 *   sns投稿済み
 *   売り上げ目標40,000円
 */
export function generateLineText(record: SetupCheckRecord): string {
  const lines: string[] = [];

  lines.push(`【設営後チェック】 ${record.staff_name}`);
  lines.push(`【出店場所】 ${record.location}`);
  lines.push("");
  lines.push("🪙 レジ確認");

  const breakdown = calculateBreakdown(record.register_coins);
  if (breakdown.length === 0) {
    lines.push("* （金種未入力）");
  } else {
    for (const item of breakdown) {
      const label = formatDenominationLabel(item.denomination);
      lines.push(
        `* ${label} × ${item.count}枚 = ${item.subtotal.toLocaleString()}円`,
      );
    }
  }

  lines.push("");

  // 合計と前回比
  let totalLine = `▶ レジ合計：¥${record.register_total.toLocaleString()}`;
  if (record.cash_diff !== null && record.cash_diff !== undefined) {
    const sign = record.cash_diff > 0 ? "+" : record.cash_diff < 0 ? "-" : "±";
    const absVal = Math.abs(record.cash_diff).toLocaleString();
    totalLine += `（前回差 ${sign}¥${absVal}）`;
  } else {
    totalLine += "（前回データなし）";
  }
  lines.push(totalLine);

  lines.push("");
  lines.push(record.sns_posted ? "sns投稿済み" : "sns未投稿");

  if (record.sales_target) {
    lines.push(`売り上げ目標${record.sales_target.toLocaleString()}円`);
  }

  if (record.note && record.note.trim()) {
    lines.push("");
    lines.push(`備考：${record.note.trim()}`);
  }

  return lines.join("\n");
}
