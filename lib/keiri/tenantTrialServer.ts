/**
 * テストの店（架空の1軒）を倉庫で引く・作る・読み比べる、サーバー側の手だけをまとめた所。
 *
 * ■ なぜ別のファイルにしてあるか
 *   確かめる窓口（/api/keiri/tenant-trial）は **読むだけ**でなければならず、
 *   その決まりは `tests/keiriCheckWindow.test.ts` が窓口のファイルを直接 読んで見張っています。
 *   作る側（書き込み）は別の住所（/api/keiri/tenant-trial/run）に置き、
 *   共通の手だけをここに置いています。
 *
 * ■ 返さないもの
 *   初回設定の合言葉・管理画面の合言葉・鍵の値は、ここから外へ1文字も出しません。
 */

import { CASE_BUSINESS_CODE, previousMonthRange } from "@/lib/keiri/caseStats";
import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { TEST_SHOP, type TrialRead } from "@/lib/keiri/tenantTrial";
import { serviceClientOrNull } from "@/lib/supabaseServer";
import { businessCodeForScope } from "@/lib/tenantScope";

/** テストの店の1行（返事には出しません。中で使うだけ） */
export type TestShopRow = {
  id: string;
  status: string;
  setup_token: string;
  created_at: string | null;
  activated_at: string | null;
};

/** 引いてきた結果。鍵が使えない・通信に失敗した・無かった・あった の4通り */
export type Found =
  | { kind: "nokey" }
  | { kind: "error" }
  | { kind: "none" }
  | { kind: "row"; row: TestShopRow };

export const SHOP_COLUMNS = "id, status, setup_token, created_at, activated_at";

/** テストの店1軒を引く */
export async function findTestShop(
  db: ReturnType<typeof serviceClientOrNull>,
): Promise<Found> {
  if (!db) return { kind: "nokey" };
  const { data, error } = await db
    .from("keiri_tenants")
    .select(SHOP_COLUMNS)
    .eq("external_session_id", TEST_SHOP.mark)
    .maybeSingle();
  if (error) return { kind: "error" };
  if (!data) return { kind: "none" };
  return { kind: "row", row: data as unknown as TestShopRow };
}

/** 初回設定にかかった時間（作った時 → 終わった時）。片方でも無ければ null */
export function setupElapsedMs(
  createdAt: string | null,
  activatedAt: string | null,
): number | null {
  if (!createdAt || !activatedAt) return null;
  const a = Date.parse(createdAt);
  const b = Date.parse(activatedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

/** 手羽屋とテストの店の2通りで、同じ月を読んで件数だけ見る */
export async function readBothWays(tenantId: string | null): Promise<{
  tebaya: TrialRead;
  testShop: TrialRead;
  month: string;
  ym: string;
}> {
  const { start, label } = previousMonthRange(new Date());
  const ym = start.slice(0, 7);
  const mine = await loadKeiriMonthServer({
    ym,
    businessCode: CASE_BUSINESS_CODE,
    monthOnly: true,
  });
  const tebaya: TrialRead = {
    reportCount: mine.reports.length,
    advancesRead: !mine.advancesSkipped,
    readable: !mine.reportsUnreadable,
  };
  if (!tenantId) {
    return {
      tebaya,
      testShop: { reportCount: 0, advancesRead: false, readable: false },
      month: label,
      ym,
    };
  }
  const other = await loadKeiriMonthServer({
    ym,
    businessCode: businessCodeForScope(tenantId),
    scope: tenantId,
    monthOnly: true,
  });
  return {
    tebaya,
    testShop: {
      reportCount: other.reports.length,
      advancesRead: !other.advancesSkipped,
      readable: !other.reportsUnreadable,
    },
    month: label,
    ym,
  };
}
