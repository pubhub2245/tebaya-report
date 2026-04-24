/**
 * 店舗名の表記揺れを吸収するための正規化・マッチング関数
 *
 * 例: 「ながやま 三股店」「ながやま三股」「ながやま 三股」→ すべて同一と判定
 */

export function normalizeLocationName(name: string): string {
  if (!name) return "";
  return name
    .replace(/\s+/g, "")   // 半角スペース削除
    .replace(/　/g, "")     // 全角スペース削除
    .replace(/店$/, "")     // 末尾の「店」を削除
    .toLowerCase();         // 英数字の大文字小文字を統一
}

export function locationsMatch(name1: string, name2: string): boolean {
  return normalizeLocationName(name1) === normalizeLocationName(name2);
}
