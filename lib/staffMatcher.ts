import { supabase } from "./supabase";

export type StaffInfo = {
  name: string;
  unit_number: 1 | 2 | null;
  daily_wage: number | null;
  is_active: boolean;
};

type StaffRow = {
  name: string;
  aliases: string[] | null;
  unit_number: number | string | null;
  daily_wage: number | null;
  is_active: boolean;
};

const toUnit = (raw: number | string | null | undefined): 1 | 2 | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (n === 1) return 1;
  if (n === 2) return 2;
  return null;
};

const toInfo = (row: StaffRow): StaffInfo => ({
  name: row.name,
  unit_number: toUnit(row.unit_number),
  daily_wage: row.daily_wage,
  is_active: row.is_active,
});

const fetchAll = async (): Promise<StaffRow[]> => {
  const { data, error } = await supabase
    .from("staff_members")
    .select("name, aliases, unit_number, daily_wage, is_active");
  if (error || !data) return [];
  return data as StaffRow[];
};

/**
 * 入力された名前から、正規のスタッフ情報を返す。
 * - name の完全一致を優先
 * - 次に aliases 配列に含まれるかをチェック
 * - 該当なしなら null
 *
 * 全件取得 → クライアント側マッチ方式（特殊文字を含む別名のORクエリで事故るのを回避）
 */
export const resolveStaff = async (
  input: string,
): Promise<StaffInfo | null> => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const all = await fetchAll();
  const direct = all.find((s) => s.name === trimmed);
  if (direct) return toInfo(direct);

  const alias = all.find(
    (s) => Array.isArray(s.aliases) && s.aliases.includes(trimmed),
  );
  if (alias) return toInfo(alias);

  return null;
};

/** バルク版：複数の名前を一気に解決（過去データ反映等で便利） */
export const resolveStaffBulk = async (
  inputs: string[],
): Promise<Map<string, StaffInfo>> => {
  const all = await fetchAll();
  const result = new Map<string, StaffInfo>();
  for (const raw of inputs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const direct = all.find((s) => s.name === trimmed);
    if (direct) {
      result.set(raw, toInfo(direct));
      continue;
    }
    const alias = all.find(
      (s) => Array.isArray(s.aliases) && s.aliases.includes(trimmed),
    );
    if (alias) result.set(raw, toInfo(alias));
  }
  return result;
};
