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
import { serverClient, serviceClientOrNull } from "@/lib/supabaseServer";
import { businessCodeForScope } from "@/lib/tenantScope";

/** テストの店の1行（返事には出しません。中で使うだけ） */
export type TestShopRow = {
  id: string;
  status: string;
  setup_token: string;
  created_at: string | null;
  activated_at: string | null;
  /** 経理の設定の行から確かめた＝サーバー側の鍵を使わなかった（貼り紙⑥の道） */
  viaSettings?: boolean;
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

/**
 * 経理の設定の行から、テストの店を確かめる（**サーバー側の鍵を使わない道**・f5-4）。
 *
 * ■ なぜこの道が要るか（やさしい説明）
 *   お店の棚（keiri_tenants）はブラウザに配られている鍵では読めません。読めるのは
 *   サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）だけで、その鍵はいま壊れています（kp241）。
 *   そのため「テストの店ができたか」をこちら側から確かめられず、f5-4 が
 *   貼り紙（1回 貼る）とは**別の手続き**も待つ形になっていました。
 *   そこで、貼り紙⑥がテストの店を作るときに必ず1行できる
 *   **経理の設定の行**を見ます。この棚は今までどおり読めます。
 *
 * ■ 「設定の行がある」＝「初回設定まで通った」と言ってよい理由
 *   設定の行を作るのは初回設定の窓口（keiri_tenant_activate）だけで、
 *   その窓口は**お店を active にしてからこの行を作ります**。
 *   ＝ 行があるなら、手順1〜3は通っています。
 *
 * ■ 本物のお店と取り違えないために
 *   数え始めの日と金庫の起点が、テストの店の固定値とぴったり同じ行だけを見ます。
 *   ★金額は外へ1円も返しません（ここで引き当てに使うだけ）。
 */
async function findTestShopViaSettings(): Promise<Found> {
  try {
    const db = serverClient({ fresh: true });
    const { data, error } = await db
      .from("keiri_settings")
      .select("tenant_id")
      .not("tenant_id", "is", null)
      .eq("opening_date", TEST_SHOP.openingDate)
      .eq("opening_balance", TEST_SHOP.openingBalance)
      .limit(1);
    if (error) return { kind: "error" };
    const id = (data?.[0] as { tenant_id?: unknown } | undefined)?.tenant_id;
    if (!id) return { kind: "none" };
    return {
      kind: "row",
      row: {
        id: String(id),
        status: "active",
        setup_token: "",
        created_at: null,
        activated_at: null,
        viaSettings: true,
      },
    };
  } catch {
    return { kind: "error" };
  }
}

/**
 * テストの店を引く。**鍵があれば鍵で、無ければ設定の行から**。
 * ＝ 鍵が直っていなくても、貼り紙を1回 貼れば確かめられます。
 */
export async function peekTestShop(): Promise<Found> {
  const key = serviceClientOrNull();
  if (key) {
    const found = await findTestShop(key);
    if (found.kind === "row") return found;
    // 鍵で「無い」と出ても、設定の行から見つかることがある（貼り紙⑥で作った場合）
  }
  return findTestShopViaSettings();
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
