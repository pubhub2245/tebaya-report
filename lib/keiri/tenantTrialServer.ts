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

import { CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { isMissingFunction } from "@/lib/keiri/tenantAccess";
import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { TEST_SHOP, type TrialRead } from "@/lib/keiri/tenantTrial";
import { trialReadMonth } from "@/lib/keiri/tenantTrialSteps";

/** 手順4・5で入れる行の名前の頭。これが付いていない行は「よその行」 */
const TEST_PREFIX = "【テスト】";
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

/**
 * テストの店ができたかだけを答える窓口の名前（貼り紙で作られます・2026-11-02）。
 * ★ここと貼り紙の2か所に同じ名前が出ます。変えるときは必ず両方そろえること。
 */
export const TEST_PEEK_WINDOW = "keiri_tenant_test_peek";

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
 * テストの店を、**倉庫の窓口ごしに**確かめる（サーバー側の鍵を使わない道・f5-4）。
 *
 * ■ なぜこの道が要るか（2026-11-02・下見で実測して分かりました）
 *   鍵を使わない道は、これまで「経理の設定の行を公開の鍵で読む」1本だけでした
 *   （{@link findTestShopViaSettings}）。ところが **貼り紙⑫が、その設定の行に
 *   「よその店のぶんは公開の鍵では読めない」決まりを足します。**
 *   ＝ テストの店を作るその貼り紙が、同じ1枚の中で この確かめ方を閉じてしまいます。
 *   同じ形の空の倉庫で測ると、流したあと 設定の行の読みは **0件**（倉庫の中には1件ある）でした。
 *   そのままだと、じゅんが2分で貼ったのに「テストの店がまだありません」と出たままになり、
 *   手順4〜6（f5-4）がそこで止まります。
 *
 * ■ 窓口は、テストの1軒しか答えません
 *   テストの印（test-… で始まる）と、店名が【テスト】で始まることの両方がそろった
 *   1軒だけです（決まりは貼り紙の keiri_tenant_test_peek にあります）。
 *   返ってくるのは 番号・状態・作った時刻・初回設定が終わった時刻 の4つだけで、
 *   **合言葉は1文字も返りません。**
 *
 * ■ 貼り紙を流す前は「窓口そのものが無い」ので、今までどおり設定の行を見ます
 */
async function findTestShopViaWindow(): Promise<Found> {
  try {
    const db = serverClient({ fresh: true });
    const { data, error } = await db.rpc(TEST_PEEK_WINDOW, {
      p_test_mark: TEST_SHOP.mark,
    });
    if (error) return isMissingFunction(error) ? { kind: "none" } : { kind: "error" };
    const row = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | undefined;
    const id = row?.id;
    if (!id) return { kind: "none" };
    return {
      kind: "row",
      row: {
        id: String(id),
        status: String(row?.status ?? "active"),
        setup_token: "",
        created_at: row?.created_at ? String(row.created_at) : null,
        activated_at: row?.activated_at ? String(row.activated_at) : null,
        viaSettings: true,
      },
    };
  } catch {
    return { kind: "error" };
  }
}

/**
 * テストの店を引く。**鍵があれば鍵で、無ければ窓口ごしに、それも無ければ設定の行から**。
 * ＝ 鍵が直っていなくても、貼り紙を1回 貼れば確かめられます。
 *
 * ★順番を変えないこと（2026-11-02）：
 *   貼り紙を**流したあと**は設定の行が公開の鍵では読めないので、窓口が先でなければ
 *   「テストの店がまだありません」と答えてしまいます。
 *   貼り紙を**流す前**は窓口そのものが無いので、そのときだけ設定の行を見ます。
 */
export async function peekTestShop(): Promise<Found> {
  const key = serviceClientOrNull();
  if (key) {
    const found = await findTestShop(key);
    if (found.kind === "row") return found;
    // 鍵で「無い」と出ても、窓口や設定の行から見つかることがある（貼り紙⑥で作った場合）
  }
  const viaWindow = await findTestShopViaWindow();
  if (viaWindow.kind === "row") return viaWindow;
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

/**
 * 手羽屋とテストの店の2通りで、同じ月を読んで件数だけ見る。
 *
 * ■ 読む月は「手順5の日報が入っている月」です（2026-11-01・f5-4・f3-4）
 *   前は「先月」を読んでいました。手順5の日報は数え始めの日に固定なので、
 *   **2026年11月のあいだだけ**たまたま月がそろっており、12月に入ると
 *   「行が1行も無い月」を読んで「混ざりません」と言ってしまう形でした
 *   （逆に、その月の手羽屋の日報が0枚なら「まだです」と言ってしまう）。
 *   決まりは lib/keiri/tenantTrialSteps.ts の trialReadMonth() の1か所です。
 */
export async function readBothWays(tenantId: string | null): Promise<{
  tebaya: TrialRead;
  testShop: TrialRead;
  month: string;
  ym: string;
  monthWhy: string;
}> {
  const { ym, label } = trialReadMonth();
  const monthWhy =
    "読み比べる月は、手順5の日報が入っている月（テストの店の数え始めの日の月）です。" +
    "今日の日付では動きません（先月を読むと、行が1行も無い月で『混ざりません』と" +
    "言ってしまうため・2026-11-01）";
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
      testShop: {
        reportCount: 0,
        foreignCount: 0,
        ownCount: 0,
        advancesRead: false,
        readable: false,
      },
      month: label,
      ym,
      monthWhy,
    };
  }
  const other = await loadKeiriMonthServer({
    ym,
    businessCode: businessCodeForScope(tenantId),
    scope: tenantId,
    monthOnly: true,
    // ★貼り紙⑧のあと、テストの店の行は公開の鍵では読めない（f3-4・kp251）。
    //   倉庫の窓口ごしに読む。窓口はテストの印（test-… ＋ 店名が【テスト】）
    //   でしか開かないので、本物のお店の行はここから1行も出ない。
    tenantReadTestMark: TEST_SHOP.mark,
  });
  // そのお店として読んだ行のうち、**よそのお店の行**が何件あるか。
  // 手順4・5で入れるテストの行は名前の頭に【テスト】が付くので、それ以外を数える。
  const foreignCount = other.reports.filter(
    (r) => !String(r.location ?? "").startsWith(TEST_PREFIX),
  ).length;
  return {
    tebaya,
    testShop: {
      reportCount: other.reports.length,
      foreignCount,
      // そのお店じしんの行（名前の頭に【テスト】が付くもの）の数
      ownCount: other.reports.length - foreignCount,
      advancesRead: !other.advancesSkipped,
      readable: !other.reportsUnreadable,
    },
    month: label,
    ym,
    monthWhy,
  };
}
