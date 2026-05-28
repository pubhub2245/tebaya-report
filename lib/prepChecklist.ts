/**
 * 仕込み日報のチェックリスト（仕込み前/仕込み後）の型・項目定義。
 *
 * 既存の片付けチェックリスト（lib/formState.ts の CLEANUP_*）のパターンを踏襲し、
 * 項目ごとに入力タイプを持たせて UI 側でディスパッチできるようにする。
 */

/** チェックリスト各項目の入力タイプ */
export type PrepCheckFieldType =
  | "check" // チェックボックス（boolean）
  | "text" // テキスト入力（string）
  | "date" // 日付入力（string, YYYY-MM-DD）
  | "number"; // 数値入力（number）

/**
 * 「チェックを外したときだけ表示するテキスト入力」など、
 * 別フィールドの真偽値で表示制御する場合の依存指定。
 *   - dependsOnKey: 監視する別キー
 *   - showWhen: そのキーが boolean のとき、ここに指定した値と等しい場合に表示
 */
export type PrepCheckFieldVisibility = {
  dependsOnKey: string;
  showWhen: boolean;
};

export type PrepCheckField = {
  key: string;
  label: string;
  type: PrepCheckFieldType;
  /** 表示制御（省略時は常時表示） */
  visibleIf?: PrepCheckFieldVisibility;
  /** 補助テキスト（任意） */
  hint?: string;
};

// ---------------------------------------------------------------------------
// 仕込み前チェック
// ---------------------------------------------------------------------------

export const PRE_CHECK_FIELDS: PrepCheckField[] = [
  { key: "coolant_laid", label: "保冷剤を敷く", type: "check" },
  {
    key: "room_temp_under_20",
    label: "部屋の温度は20度以下か確認",
    type: "check",
  },
  { key: "bag_count_checked", label: "必要な袋数を確認", type: "check" },
  { key: "tools_clean", label: "ハサミや器具が綺麗か確認", type: "check" },
  { key: "next_day_rank_checked", label: "次の日のランク確認", type: "check" },
  {
    key: "tupperware_intact",
    label: "タッパーが壊れていないか確認",
    type: "check",
    hint: "壊れていればチェックを外し、担当者名を入力してください",
  },
  {
    key: "tupperware_broken_by",
    label: "タッパーを壊した担当者名",
    type: "text",
    visibleIf: { dependsOnKey: "tupperware_intact", showWhen: false },
  },
];

// ---------------------------------------------------------------------------
// 仕込み後チェック
// ---------------------------------------------------------------------------

export const POST_CHECK_FIELDS: PrepCheckField[] = [
  { key: "count_checked", label: "本数確認", type: "check" },
  { key: "all_present", label: "全て揃っているか", type: "check" },
  { key: "trash_disposed", label: "ゴミ捨て", type: "check" },
  { key: "washing_checked", label: "洗い物確認", type: "check" },
  { key: "prep_date", label: "仕込み日", type: "date" },
  { key: "expiry_date", label: "消費期限", type: "date" },
  { key: "staff_name", label: "担当者名", type: "text" },
  { key: "shopping_checked", label: "仕込みの買い出し確認", type: "check" },
  { key: "stock_reported", label: "仕込み後の在庫報告", type: "check" },
  { key: "remaining_bag_count", label: "残り袋数", type: "number" },
];

// ---------------------------------------------------------------------------
// 値の型・初期値
// ---------------------------------------------------------------------------

/** JSONB に格納される値のユニオン */
export type PrepCheckValue = boolean | string | number;

/** key → 値 の辞書 */
export type PrepCheckState = Record<string, PrepCheckValue>;

function defaultValueFor(type: PrepCheckFieldType): PrepCheckValue {
  switch (type) {
    case "check":
      return true; // 「壊れていない」のような肯定形デフォルト
    case "text":
    case "date":
      return "";
    case "number":
      return 0;
  }
}

export function initialPreCheck(): PrepCheckState {
  const out: PrepCheckState = {};
  for (const f of PRE_CHECK_FIELDS) {
    out[f.key] = defaultValueFor(f.type);
  }
  // 「タッパーを壊した担当者名」は初期は空文字（デフォルトのまま）。
  // tupperware_intact=true（壊れていない）の状態で text は非表示になる
  return out;
}

export function initialPostCheck(): PrepCheckState {
  const out: PrepCheckState = {};
  for (const f of POST_CHECK_FIELDS) {
    out[f.key] = defaultValueFor(f.type);
  }
  return out;
}

/**
 * DB からロードした値（unknown）を安全にマージして PrepCheckState に整える。
 * 不明なキーは捨て、欠けているキーは初期値で補う。
 */
export function normalizeCheckState(
  raw: unknown,
  fields: PrepCheckField[],
): PrepCheckState {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const out: PrepCheckState = {};
  for (const f of fields) {
    const v = src[f.key];
    if (f.type === "check") {
      out[f.key] = typeof v === "boolean" ? v : defaultValueFor(f.type);
    } else if (f.type === "number") {
      const n =
        typeof v === "number"
          ? v
          : typeof v === "string"
            ? parseInt(v, 10)
            : NaN;
      out[f.key] = Number.isFinite(n) && n >= 0 ? n : 0;
    } else {
      out[f.key] = typeof v === "string" ? v : "";
    }
  }
  return out;
}

/** 表示すべきか（visibleIf があればその条件で判定） */
export function isFieldVisible(
  field: PrepCheckField,
  state: PrepCheckState,
): boolean {
  if (!field.visibleIf) return true;
  const dep = state[field.visibleIf.dependsOnKey];
  return typeof dep === "boolean" && dep === field.visibleIf.showWhen;
}
