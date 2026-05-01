/**
 * 手羽屋シフト生成エンジンの設定ファイル
 *
 * NAGAYAMA_TARGETS: ながやま系店舗（手羽屋がエントリーする店舗）
 * - 主要5店舗: 志比田/若葉店/山田店/鷹尾店/三股店
 * - 補助店舗: 都北店（月4日程度、火木日優先のソフト制約あり）
 *
 * 特殊な曜日嗜好を持つ店舗は NAGAYAMA_DAY_PREFERENCE に登録。
 *
 * 注意:
 * - STORE_RANK は PDFスコアリング用のロジカルランクであり、
 *   locations テーブルの rank カラムとは別概念。
 * - STAFF_WEEKLY_PATTERN の曜日インデックスは「月曜起点」(0=月,6=日)。
 *   JS の Date.getDay() は日曜起点なので getJpWeekdayIndex() で吸収する。
 */

export type StaffName = "かずき" | "なぎさ" | "イデ" | "じゅん";

/** ながやま系店舗の論理名（キー） */
export const NAGAYAMA_TARGETS = [
  "志比田",
  "若葉店",
  "山田店",
  "鷹尾店",
  "三股店",
  "都北店",
] as const;

/** ながやま店舗のスコアリング用ランク（PDFパース用、locations.rank とは別） */
export const STORE_RANK: Record<string, "A" | "B" | "C" | "D"> = {
  鷹尾店: "A",
  志比田: "C",
  若葉店: "C",
  山田店: "C",
  三股店: "C",
  都北店: "C",
};

/** ながやま店舗ごとの月別出店日数目標 */
export const STORE_MONTHLY_TARGET: Record<string, number> = {
  三股店: 8,
  鷹尾店: 7,
  若葉店: 6,
  志比田: 5,
  山田店: 5,
  都北店: 4,
};

/** 同一店舗の土日偏り防止用の上限比率 */
export const WEEKEND_RATIO_CAP: Record<string, number> = {
  鷹尾店: 0.55,
  若葉店: 0.4,
  志比田: 0.4,
  山田店: 0.3,
  三股店: 0.3,
  都北店: 1.0,
};

/**
 * ながやま系店舗の曜日嗜好（ソフト制約）
 *
 * 一部の店舗は特定曜日（売上が見込める日）に出店すると望ましい。
 * 該当曜日にはボーナス点、それ以外には軽いペナルティ点を加算する。
 * ハード制約ではなく、PDFの空きが少ない月は他曜日にも入りうる。
 *
 * weekday は JS Date.getDay() 準拠 (0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土)
 */
export const NAGAYAMA_DAY_PREFERENCE: Record<
  string,
  {
    preferredWeekdays: number[];
    bonus: number;
    penalty: number;
  }
> = {
  都北店: {
    preferredWeekdays: [0, 2, 4], // 日, 火, 木
    bonus: 30,
    penalty: -20,
  },
};

/** ながやま以外の店舗の月次目標日数 */
export const EXTRA_STORE_TARGETS: Record<string, number> = {
  イオンモール都城駅前: 6,
  マンガ倉庫: 8,
  パシオたかお店: 3,
  パシオ志比田店: 1,
  ニクルの朝市: 2,
};

/** スタッフ割当ルール */
export const STAFF_ASSIGNMENT_RULES = {
  nagayama: {
    monday: "なぎさ" as StaffName,
    wednesday: "イデ" as StaffName,
    default: "かずき" as StaffName,
  },
  mangaSouko: "じゅん" as StaffName,
  aeon: "じゅん" as StaffName,
  pasio: "じゅん" as StaffName,
  morningMarket: "かずき" as StaffName,
};

/**
 * スタッフの曜日制約 [月,火,水,木,金,土,日]
 * true = その曜日に出勤可能
 */
export const STAFF_WEEKLY_PATTERN: Record<StaffName, boolean[]> = {
  かずき: [true, true, true, true, true, true, true],
  なぎさ: [true, false, false, false, false, false, false],
  イデ: [false, false, true, false, false, false, false],
  じゅん: [false, true, false, true, false, true, true],
};

/**
 * 2026年の祝日マップ（YYYY-MM-DD → 祝日名）
 * lib/japaneseHolidays.ts の HOLIDAYS_2026 と同等の内容を保持。
 */
export const JP_HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "元日",
  "2026-01-12": "成人の日",
  "2026-02-11": "建国記念の日",
  "2026-02-23": "天皇誕生日",
  "2026-03-20": "春分の日",
  "2026-04-29": "昭和の日",
  "2026-05-03": "憲法記念日",
  "2026-05-04": "みどりの日",
  "2026-05-05": "こどもの日",
  "2026-05-06": "振替休日",
  "2026-07-20": "海の日",
  "2026-08-11": "山の日",
  "2026-09-21": "敬老の日",
  "2026-09-23": "秋分の日",
  "2026-10-12": "スポーツの日",
  "2026-11-03": "文化の日",
  "2026-11-23": "勤労感謝の日",
};

/** shifts.note カラムに入れる定型マーカー（既存コードと整合させること） */
export const NOTE_MARKERS = {
  STAFF_REQUIRED: "【スタッフ要設定】",
  UNCONFIRMED: "【未確定】",
} as const;

// -----------------------------------------------------------------------------
// ヘルパー関数
// -----------------------------------------------------------------------------

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 指定日が祝日（JP_HOLIDAYS_2026 にあるか）どうか判定 */
export function isHoliday(d: Date): boolean {
  return toIsoDate(d) in JP_HOLIDAYS_2026;
}

/** 指定日が土日かどうか判定 */
export function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * JS の Date を「月曜起点」の曜日インデックスに変換
 * 戻り値: 0=月, 1=火, 2=水, 3=木, 4=金, 5=土, 6=日
 *
 * STAFF_WEEKLY_PATTERN の配列インデックスとして使用する。
 */
export function getJpWeekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}
