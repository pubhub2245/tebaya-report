/**
 * 出店場所マスタ（locations）から、出店料（場代）の決まりを読んでくるところ。
 *
 * 決まりの探し方そのものは `lib/boothFee.ts`（データベースに触らない純粋な計算）。
 * ここは読みに行く係だけ。テストしやすいように分けている。
 */

import { supabase } from "@/lib/supabase";
import { buildBoothFeeRules, type BoothFeeLocation } from "@/lib/boothFee";
import type { BoothFeeRule } from "@/lib/money";
import { applyTenantScope, readTenantScope } from "@/lib/tenantScope";

/** 出店場所マスタから場代の決まりを読む。読めなければ空の表（＝自動では入れない） */
export async function fetchBoothFeeRules(): Promise<Map<string, BoothFeeRule>> {
  try {
    // 開いているお店のぶんだけ（手羽屋は印が空＝今までどおり）
    const { data, error } = await applyTenantScope<any>(
      supabase
        .from("locations")
        .select("name, booth_fee_type, booth_fee_rate, booth_fee_amount") as any,
      readTenantScope(),
    );
    if (error) throw error;
    return buildBoothFeeRules((data as BoothFeeLocation[]) || []);
  } catch {
    // マスタが読めなくても日報の入力は止めない（手入力でこれまで通り入れられる）
    return new Map();
  }
}
