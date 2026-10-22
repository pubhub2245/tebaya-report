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
import { applyTenantScope } from "@/lib/tenantScope";
import { currentShopScope } from "@/lib/keiri/readSource";

// 日当の決まりそのものは lib/laborRule.ts の1か所（倉庫を読まないので試験で固定できる）。
// 画面からは今までどおりこのファイルを読めばよいように、そのまま配り直している。
export {
  laborKnown,
  laborToSave,
  makeLaborFor,
  resolveLabor,
  resolveLaborDetail,
  type LaborResolution,
  type LaborSource,
  type StaffWageMap,
} from "./laborRule";
import type { StaffWageMap } from "./laborRule";

/**
 * スタッフマスタから日当を読み込む。
 * 読み込みに失敗しても画面を止めないよう、空の表を返す（＝保険の値が使われる）。
 */
export async function fetchStaffWages(): Promise<StaffWageMap> {
  const map: StaffWageMap = new Map();
  try {
    // 開いているお店のぶんだけ（手羽屋は印が空＝今までどおり）
    const { data, error } = await applyTenantScope<any>(
      supabase.from("staff_members").select("name, daily_wage") as any,
      // ★日報の保存とまったく同じ安全側の決め方（2026-10-21・f3-4）。
      //   手羽屋は印が空なので、条件は今までと同じ。
      currentShopScope(),
    );
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
 * その日当は、どこから出た金額か。
 *   master         … そのお店のスタッフマスタに入っていた値（いちばん正しい）
 *   tebaya-fallback … コードの中の表（手羽屋の日当）。**手羽屋のときだけ使う**
 *   none           … 分からない（金額を作らない）。よそのお店でマスタに無いとき
 */
