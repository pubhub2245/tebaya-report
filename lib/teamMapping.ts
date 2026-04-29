// スタッフ名 → 番隊 のマッピング
// じゅん・イデ：1番隊／かずき・なぎさ：2番隊
// その他（ゆうとさんや応援メンバー等）は NULL（手動選択に任せる）

export const STAFF_TO_UNIT: Record<string, 1 | 2> = {
  じゅん: 1,
  イデ: 1,
  かずき: 2,
  なぎさ: 2,
};

export const getUnitFromStaff = (
  staffName: string | null | undefined,
): 1 | 2 | null => {
  if (!staffName) return null;
  const key = staffName.trim();
  return STAFF_TO_UNIT[key] ?? null;
};
