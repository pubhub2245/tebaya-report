/**
 * 2軒目を入れる手順の **手順4・5・6** を、こちら（Claude）だけで通すための1か所（f5-4・f3-4）。
 *
 * ■ なぜ要るか（やさしい説明・2026-10-14）
 *   2軒目を入れる手順は6手あります（/keiri/tenant-new）。
 *   手順1〜3（お店の行を作る → リンクを渡す → はじめの設定）は、
 *   倉庫の貼り紙（/keiri/sql の⑥）を1回 流すとその中で終わります。
 *   ところが **手順4（出店場所を入れる）・手順5（日報を1枚 打つ）・手順6（経理の画面で確かめる）は、
 *   どこにも作ってありませんでした**。
 *   ＝ じゅんが貼り紙を貼っても、仕上げの f5-4 はそこで止まり、
 *     「2軒目を入れる手順を一度 通してある」とは言えないままでした。
 *   そこで、手順4・5・6 を**こちら側の1回の呼び出し**で通せるようにします。
 *
 * ■ 手羽屋には1行も混ざりません（ここがいちばん大事）
 *   ここで作る行は**すべて「どの店か」の印（tenant_id）がテストの店**で、
 *   名前の頭に【テスト】が付きます。
 *   手羽屋は**印が空（null）のお店**として読んでいるので（lib/tenantScope.ts）、
 *   手羽屋の画面（日報・シフト・レジ・LINE・お金の計算）には1行も出ません。
 *   それでも念のため、**入れる前と後で手羽屋に見える件数を数え、
 *   1件でも動いたら入れた行をその場で取り消します**（作った行だけ・ほかには触りません）。
 *
 * ■ ここは計算だけの場所です
 *   倉庫に出し入れする手は app/api/keiri/tenant-trial/steps/run/route.ts にあります。
 *   こちらは「何を入れるか」と「通ったと言ってよいか」だけを決めます（テストで固定できる形）。
 */

import { TEST_SHOP } from "@/lib/keiri/tenantTrial";

/** 手順4で入れる出店場所（架空の1か所） */
export const TEST_LOCATION = {
  name: "【テスト】テスト広場",
  /** 場代の決まりは「なし」。分からないところを0円の行にしないため（CLAUDE.md 4-15） */
  boothFeeType: "none",
  /** 目標額は入れるが、ランクの自動判定はここでは回さない */
  target: 30000,
  rank: "D",
} as const;

/**
 * 手順4で入れる商品1件（名前と単価・架空の1品）。
 *
 * ■ なぜ要るのか（2026-10-30・f5-4・f3-4）
 *   日報の STEP4 は「単価 × 本数の合計」と、レジで数えた売上を突き合わせる所です
 *   （このアプリの検算の芯・CLAUDE.md 3「売上の内訳チェック」）。
 *   ところが申し込んだお店は、商品の一覧を直す画面に入れません
 *   （設定センターは手羽屋だけ。お店が入れるのは経理の画面とその月の1枚だけ）。
 *   ＝ **商品が1件も無いので、2軒目のお店は STEP4 を一度も使えません。**
 *   そこで、2軒目を入れる手順の中で商品を1件 入れます。
 *
 * ■ 単価は、手順5の日報とぴったり合う値にしてあります
 *   売上 30,000円 ÷ 単価 500円 = **60本**（割り切れます）。
 *   ＝ 手順6で「単価 × 本数 = 売上」が成り立つことを、そのまま確かめられます
 *   （testProductCount() で縛っています）。
 */
export const TEST_PRODUCT = {
  name: "【テスト】テスト商品",
  /** 単価（円）。日報の売上とぴったり割り切れる値にしてある */
  price: 500,
  /** 主力商品として入れる（各店1つ想定。逆算はしないので数え方は normal と同じ） */
  kind: "primary",
  sortOrder: 0,
} as const;

/** 手順5で入れる日報1枚（架空の数字。本物の日報とは印で分かれます） */
export const TEST_REPORT = {
  /** 売上（円） */
  sales: 30000,
  /** 日当（円） */
  labor: 10000,
  /** 経費1行（レシートなし。理由を残す形も一緒に通す） */
  expenseLabel: "【テスト】消耗品",
  expenseAmount: 1000,
  staffName: "【テスト】テスト太郎",
  shop: "手羽屋",
} as const;

/** 手順5の日報の日付。数え始めの日（テストの店の固定値）をそのまま使う */
export function testReportDate(): string {
  return TEST_SHOP.openingDate;
}

/** 出店場所の棚に入れる1行 */
export function buildTestLocation(tenantId: string): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    name: TEST_LOCATION.name,
    rank: TEST_LOCATION.rank,
    target: TEST_LOCATION.target,
    is_active: true,
    booth_fee_type: TEST_LOCATION.boothFeeType,
  };
}

/**
 * 商品の棚に入れる1行。
 *
 * ★お店を分ける印はテストの店。`shop` は手順5の日報と同じ「手羽屋」です
 *   （日報の画面は、開いているお店の `shop` で商品を絞るため）。
 */
export function buildTestProduct(tenantId: string): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    shop: TEST_REPORT.shop,
    name: TEST_PRODUCT.name,
    price: TEST_PRODUCT.price,
    kind: TEST_PRODUCT.kind,
    is_active: true,
    sort_order: TEST_PRODUCT.sortOrder,
  };
}

/**
 * 手順5の日報の売上を、手順4の商品の単価で割った本数。
 * **割り切れないときは null**（＝突き合わせに使える固定値になっていない）。
 */
export function testProductCount(): number | null {
  const { sales } = TEST_REPORT;
  const { price } = TEST_PRODUCT;
  if (price <= 0) return null;
  return sales % price === 0 ? sales / price : null;
}

/**
 * 日報の棚に入れる1行。
 * 画面（/report）が保存している形に合わせていますが、
 * **金額はぜんぶ架空の固定値**で、本物の数字は1つも使いません。
 */
export function buildTestReport(tenantId: string, date?: string): Record<string, unknown> {
  const d = date ?? testReportDate();
  const expenses = [
    {
      description: TEST_REPORT.expenseLabel,
      amount: TEST_REPORT.expenseAmount,
      receipt_image_url: null,
      no_receipt_reason: "テスト（架空の行）",
    },
  ];
  return {
    tenant_id: tenantId,
    date: d,
    shop: TEST_REPORT.shop,
    location: TEST_LOCATION.name,
    staff_name: TEST_REPORT.staffName,
    sales_amount: TEST_REPORT.sales,
    cumulative_sales: TEST_REPORT.sales,
    register_total: TEST_REPORT.sales,
    register_ok: true,
    register_diff: 0,
    labor: TEST_REPORT.labor,
    remaining_tebasaki: 0,
    remaining_gyoza: 0,
    remaining_potato: 0,
    remaining_tornado: 0,
    remaining_negishio: 0,
    limited_product_name: null,
    limited_product_count: null,
    allstar_count: 0,
    customer_groups: 0,
    alcohol_count: 0,
    product_counts: {},
    product_prices: {},
    breakdown_total: TEST_REPORT.sales,
    breakdown_diff: 0,
    breakdown_diff_reason: null,
    breakdown_diff_note: null,
    expenses,
    handover: "【テスト】2軒目を入れる手順の確かめ（手順5）",
    line_text: "",
    unit_number: null,
    cleanup_inventory: {},
    cleanup_tasks: {},
  };
}

/** 手羽屋に見える件数（印が空のものだけ）。入れる前と後で見比べるために使う */
export type TebayaVisible = {
  /** 出店場所の件数。読めなかったときは null */
  locations: number | null;
  /** 日報の件数。読めなかったときは null */
  reports: number | null;
  /** 商品（名前と単価）の件数。読めなかったときは null（2026-10-30） */
  products: number | null;
};

/**
 * 入れた行を取り消すべきか。
 *
 * ★**読めなかった（null）ときも取り消します。**
 *   「変わっていない」と言い切れないのに本番に残すほうが危ないため
 *   （0件と読めなかったを取り違えない・CLAUDE.md 4-2 と同じ考え方）。
 */
export function rollbackNeeded(before: TebayaVisible, after: TebayaVisible): boolean {
  if (before.locations === null || after.locations === null) return true;
  if (before.reports === null || after.reports === null) return true;
  if (before.products === null || after.products === null) return true;
  return (
    before.locations !== after.locations ||
    before.reports !== after.reports ||
    before.products !== after.products
  );
}

/** 手順4・5・6 がそれぞれ通ったか */
export type StepsState = {
  /** テストの店（手順1〜3）があるか */
  shopReady: boolean;
  /** 手順4：そのお店の出店場所が1件あるか */
  locationReady: boolean;
  /** 手順4：そのお店の商品（名前と単価）が1件あるか（2026-10-30） */
  productReady: boolean;
  /** 手順5：そのお店の日報が1枚あるか */
  reportReady: boolean;
  /** 手順6：そのお店として読むと、手羽屋の数字が1件も混ざらないか */
  separated: boolean;
  /** 手順5の日報から、そのお店の「今月の利益・今の現金」が出たか */
  numbersShown: boolean;
};

/** 手順4〜6が全部そろったか */
export function stepsAllDone(s: StepsState): boolean {
  return (
    s.shopReady &&
    s.locationReady &&
    s.productReady &&
    s.reportReady &&
    s.separated &&
    s.numbersShown
  );
}

/** 窓口の返事に出す1行のまとめ */
export function stepsSummary(s: StepsState, rolledBack = false): string {
  if (rolledBack) {
    return (
      "入れた行をその場で取り消しました（手羽屋に見える件数が動いたため）。" +
      "本番には1行も残っていません"
    );
  }
  if (!s.shopReady) {
    return (
      "テストの店がまだありません。手順4〜6はその後です" +
      "（/keiri/sql の貼り紙⑥を1回 流すと、手順1〜3と手順5（日報1枚）がその中で終わります）"
    );
  }
  if (stepsAllDone(s)) {
    return (
      "手順4・5・6 まで通りました" +
      "（出店場所1件・商品1件・日報1枚・そのお店の数字だけが出る）"
    );
  }
  const left: string[] = [];
  if (!s.locationReady) left.push("手順4（出店場所）");
  if (!s.productReady) left.push("手順4（商品と単価）");
  if (!s.reportReady) left.push("手順5（日報1枚）");
  if (!s.numbersShown) left.push("手順5の数字（今月の利益・今の現金）");
  if (!s.separated) left.push("手順6（よその数字が混ざらないこと）");
  return `のこり：${left.join("・")}`;
}
