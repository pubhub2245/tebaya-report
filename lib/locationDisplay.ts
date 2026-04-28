/**
 * 店舗名の表示マッピング
 * Instagram投稿モードなど、スペースが限られる表示で使用
 */

const DISPLAY_NAME_MAP: Record<string, string> = {
  "ながやま 鷹尾店": "ながやま鷹尾",
  "ながやま 若葉店": "ながやま若葉",
  "ながやま 三股店": "ながやま三股",
  "ながやま 都北店": "ながやま都北",
  "ながやま 山田店": "ながやま山田",
  "ながやま 志比田店": "ながやま志比田",
  マンガ倉庫: "マンガ倉庫",
  "PASIO 高城店": "PASIO高城",
  "PASIO 早鈴店": "PASIO早鈴",
  PASIO高城店: "PASIO高城",
  PASIO早鈴店: "PASIO早鈴",
  ニクルの朝市: "ニクルの朝市",
  まるまる朝市: "まるまる朝市",
  "BIG OPUS": "BIG OPUS",
  "Aコープ 木花": "Aコープ木花",
  Aコープ木花: "Aコープ木花",
  イオンモール: "イオンモール",
};

/** 店舗フルネームから表示用の名前を返す */
export function shortLocationName(fullName: string): string {
  if (DISPLAY_NAME_MAP[fullName]) return DISPLAY_NAME_MAP[fullName];
  // 「ながやま ○○店」パターンの自動変換
  const m = fullName.match(/ながやま\s*(.+?)店?$/);
  if (m) return `ながやま${m[1]}`;
  // スペース・「店」を除去して返す
  return fullName.replace(/\s+/g, "").replace(/店$/, "");
}

/** 特別出店（イベント系）かどうか判定 */
export function isSpecialEvent(locationName: string): boolean {
  const keywords = ["イオンモール", "イベント", "朝市", "BIG OPUS"];
  return keywords.some((k) => locationName.includes(k));
}
