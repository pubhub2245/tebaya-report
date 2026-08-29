/**
 * 日当（1日いくら払うか）の取り出し方を、ここ1か所にまとめたファイル。
 *
 * ■ なぜ作ったか
 *   日当が「スタッフマスタ（staff_members.daily_wage）」と
 *   「コードの中の表（lib/formState.ts の STAFF_DAILY_PAY）」の2か所にあり、
 *   管理画面で日当を変えてもコード側は古いまま、という食い違いが起きる状態でした。
 *
 * ■ これからのルール
 *   **スタッフマスタが正**です。コードの表は、マスタに値が無いときだけの
 *   保険（フォールバック）として残しています。
 *   日当を変えるときは、管理者ページのスタッフマスタを直してください。
 *   コードを触る必要はありません。
 */

import { supabase } from "./supabase";
import { laborFor as fallbackLaborFor } from "./formState";

/** スタッフ名 → 日当（円）。マスタに日当が入っている人だけが入る */
export type StaffWageMap = Map<string, number>;

/**
 * スタッフマスタから日当を読み込む。
 * 読み込みに失敗しても画面を止めないよう、空の表を返す（＝保険の値が使われる）。
 */
export async function fetchStaffWages(): Promise<StaffWageMap> {
  const map: StaffWageMap = new Map();
  try {
    const { data, error } = await supabase
      .from("staff_members")
      .select("name, daily_wage");
    if (error) throw error;
    for (const row of (data as { name: string; daily_wage: number | null }[]) ?? []) {
      if (row.name && typeof row.daily_wage === "number" && row.daily_wage > 0) {
        map.set(row.name, row.daily_wage);
      }
    }
  } catch {
    // マスタが読めないときは保険の値で動かす
  }
  return map;
}

/**
 * その人の日当を決める。
 *
 * ① スタッフマスタに日当があればそれを使う（＝管理画面で変えられる）
 * ② 無ければコードの表（保険）を使う
 *
 * isOther＝選択肢に無い「その他」の人。保険の表では ¥8,500 扱い。
 */
export function resolveLabor(
  wages: StaffWageMap,
  staff: string,
  isOther = false,
): number {
  const fromMaster = wages.get(staff);
  if (typeof fromMaster === "number" && fromMaster > 0) return fromMaster;
  return fallbackLaborFor(staff, isOther);
}

/**
 * 日当を返す関数を作る。画面側は `const laborFor = makeLaborFor(wages)` として
 * これまでと同じ書き方で使える。
 */
export function makeLaborFor(wages: StaffWageMap) {
  return (staff: string, isOther = false) => resolveLabor(wages, staff, isOther);
}
