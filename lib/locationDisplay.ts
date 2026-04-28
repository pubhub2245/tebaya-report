/**
 * 店舗名の短縮表示マッピング
 * Instagram投稿モードなど、スペースが限られる表示で使用
 */

const SHORT_NAME_MAP: Record<string, string> = {
  "ながやま 鷹尾店": "鷹尾",
  "ながやま 若葉店": "若葉",
  "ながやま 三股店": "三股",
  "ながやま 都北店": "都北",
  "ながやま 山田店": "山田",
  "ながやま 志比田店": "志比田",
  マンガ倉庫: "マンガ",
  "PASIO 高城店": "高城",
  "PASIO 早鈴店": "早鈴",
  PASIO高城店: "高城",
  PASIO早鈴店: "早鈴",
  ニクルの朝市: "ニクル",
  まるまる朝市: "まるまる",
  "BIG OPUS": "OPUS",
  "Aコープ 木花": "木花",
  Aコープ木花: "木花",
  イオンモール: "イオン",
};

/** 店舗フルネームから短縮名を返す。マッピングにない場合は先頭4文字 */
export function shortLocationName(fullName: string): string {
  if (SHORT_NAME_MAP[fullName]) return SHORT_NAME_MAP[fullName];
  // 「ながやま ○○店」パターンの自動短縮
  const m = fullName.match(/ながやま\s*(.+?)店?$/);
  if (m) return m[1];
  // フォールバック：先頭4文字
  return fullName.slice(0, 4);
}

/** 特別出店（イベント系）かどうか判定 */
export function isSpecialEvent(locationName: string): boolean {
  const keywords = ["イオンモール", "イベント", "朝市", "BIG OPUS"];
  return keywords.some((k) => locationName.includes(k));
}
