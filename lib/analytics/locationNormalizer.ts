/**
 * 出店先 売上分析 専用の「店舗名 名寄せ（なよせ）」モジュール。
 *
 * daily_reports.location には表記ゆれ（例「ながやま 三股店」と「ながやま三股店」）
 * があるため、集計前に必ずこの関数で正式名へ統一する。
 *
 * ★ ルールはすべてこの1ファイルに集約。店舗が増減したらここだけ直せばよい。
 *
 * 注意:
 *  - 既存の lib/locationMatcher.ts（locations テーブル照合用）とは別物。
 *    こちらは「分析画面のための部分一致ルール」に特化している。
 *  - 指定ルールに当てはまらない店（BIG OPUS・Aコープ等）は
 *    元の名前のまま返す（無理に統合しない）。
 */

/** 名寄せルール: 入力に含まれるキーワード → 統一後の正式名 */
type NormalizeRule = {
  /** すべて含まれていれば一致（AND条件） */
  includesAll: string[];
  /** いずれかが含まれていれば一致（OR条件・省略可） */
  includesAny?: string[];
  /** 統一後の正式名 */
  canonical: string;
};

/**
 * 上から順に判定し、最初に一致したルールの canonical を返す。
 * 「志比田」「鷹尾」のように、ながやま系かパシオ系かで分岐するものは
 * 先に AND条件（ながやま / パシオ 付き）を置いている。
 */
const RULES: NormalizeRule[] = [
  { includesAll: ["三股"], canonical: "ながやま三股店" },
  { includesAll: ["若葉"], canonical: "ながやま若葉店" },

  // 志比田: ながやま系 と パシオ系 を区別
  { includesAll: ["志比田", "ながやま"], canonical: "ながやま志比田店" },
  {
    includesAll: ["志比田"],
    includesAny: ["PASIO", "Pasio", "pasio", "パシオ"],
    canonical: "パシオ志比田店",
  },

  { includesAll: ["山田"], canonical: "ながやま山田店" },
  { includesAll: ["都北"], canonical: "ながやま都北店" },

  // 鷹尾: ながやま系 と パシオ系 を区別
  { includesAll: ["鷹尾", "ながやま"], canonical: "ながやま鷹尾店" },
  {
    includesAll: ["鷹尾"],
    includesAny: ["PASIO", "Pasio", "pasio", "パシオ"],
    canonical: "パシオ鷹尾店",
  },

  { includesAll: ["高城"], canonical: "パシオ高城店" },
  { includesAll: ["早鈴"], canonical: "パシオ早鈴店" },
  { includesAll: ["マンガ倉庫"], canonical: "マンガ倉庫" },
  { includesAll: ["イオン"], canonical: "イオンモール" },
  { includesAll: ["ニシムタ"], canonical: "ニシムタ都城店" },
  {
    includesAll: [],
    includesAny: ["AZ", "隼人"],
    canonical: "AZ隼人店",
  },
  {
    includesAll: [],
    includesAny: ["にくる", "ニクル"],
    canonical: "にくる朝市",
  },
  { includesAll: ["まるまる"], canonical: "まるまる朝市" },
];

/**
 * 店舗名を正式名へ名寄せする純関数。
 * どのルールにも当てはまらなければ、前後の空白だけ整えた元の名前を返す。
 */
export function normalizeOutletName(raw: string | null | undefined): string {
  if (!raw) return "";
  const name = raw.trim();
  if (!name) return "";

  for (const rule of RULES) {
    const allOk = rule.includesAll.every((kw) => name.includes(kw));
    if (!allOk) continue;
    if (rule.includesAny && rule.includesAny.length > 0) {
      const anyOk = rule.includesAny.some((kw) => name.includes(kw));
      if (!anyOk) continue;
    }
    return rule.canonical;
  }

  // 該当ルールなし → 元の名前のまま（BIG OPUS・Aコープ・都城イベント 等）
  return name;
}

/**
 * イベント系・単発出店かどうかの判定。
 * これらは A〜D の自動ランク判定をせず「S/イベント枠」として別扱いにする。
 * 例: 都城イベント（栄町公園）, にくる朝市, まるまる朝市, BIG OPUS
 */
export function isEventOutlet(normalizedName: string): boolean {
  const keywords = ["イベント", "朝市", "BIG OPUS", "OPUS", "マルシェ", "祭"];
  return keywords.some((k) => normalizedName.includes(k));
}
