/**
 * 棚の「仕分け表」。倉庫の棚を1つずつ、**どう守っているか**で分けて並べたファイル
 * （2026-10-25・f3-4）。**計算もしません。名前を並べているだけ**です。
 *
 * ■ なぜ作ったか（やさしい説明）
 *   よその店のデータが見えないか（f3-4）は、これまで
 *   「印の欄が無い棚の一覧（lib/tenantScope.ts の TABLES_WITHOUT_TENANT_COLUMN）」を
 *   手で足しながら見張ってきました。見張りはよく効いていて、
 *   **一覧に載っている棚**については、門を外せばその場でテストが落ちます。
 *
 *   ところが **一覧に名前が無い棚そのものには、誰も気づけません。**
 *   実際、イベント段取り・設営後チェック・出店先問い合わせ・限定商品・仕込みの6つは、
 *   10/21〜10/24 に**1日1つずつ手で見つけて**足していました。
 *   同じ取り落としが、まだあるかどうかを目で確かめる方法がありません。
 *
 * ■ どう直すか
 *   **棚を全部 仕分けて、仕分けから漏れた棚があればテストで落とします。**
 *   仕分け先は3つだけ：
 *     ① 印の欄がある棚            … `TENANT_SCOPED_TABLES`（絞って読む）
 *     ② 印の欄が無い棚            … `TABLES_WITHOUT_TENANT_COLUMN`（手羽屋だけの門で守る）
 *     ③ お店の画面からは触らない棚 … `TABLES_NOT_IN_SHOP_SCREENS`（合言葉・鍵・自動処理の内側だけ）
 *   新しい棚を使い始めたら、3つのどれかに名前を書くまで `npm test` が通りません。
 *   ＝ **これから先、棚の取り落としは起きません。**
 *
 * ■ ここは「鍵をかける相手の一覧」ではありません
 *   棚の鍵の決まり（RLS）そのものは倉庫側の話で、/keiri/sql の貼り紙で閉めます。
 *   ここが答えるのは「**アプリのコードが、その棚をどう守って読んでいるか**」だけです。
 */

import { TABLES_WITHOUT_TENANT_COLUMN } from "@/lib/tenantScope";

/**
 * ①「どの店のものか」の印（tenant_id）の欄がある棚。
 *
 * ★読むときは必ず `applyTenantScope`（または棚ごとの係）を通す。
 *   手羽屋は印が空なので、絞っても**今までと1行も変わりません**。
 */
export const TENANT_SCOPED_TABLES = [
  "daily_reports",
  "locations",
  "staff_members",
  "sale_products",
  "keiri_applications",
  "keiri_settings",
  "advance_expenses",
  // 貼り紙（supabase/migrations/keiri_shelves_20261005.sql）で作る経理の棚。
  // 作った時点から印の欄つきで、読む所は最初から絞ってある。
  "keiri_cash_events",
  "keiri_expense_ignores",
  "keiri_payments",
  "keiri_reports",
] as const;

/**
 * ③ お店（手羽屋も、申し込んだお店も）の画面からは触らない棚。
 *    触るのは **管理者ページ（合言葉の内側）・サーバー側の鍵・毎日の自動処理**だけ。
 *
 * ★ここに書いた「なぜ画面から触らないか」は、テストで確かめます
 *   （tests/tenantTables.test.ts が、公開の画面から読んでいないことを実際に数えます）。
 *   だから名前を足すだけでは通りません。嘘を書けない形にしてあります。
 */
export const TABLES_NOT_IN_SHOP_SCREENS: Record<string, string> = {
  achievement_rates:
    "達成率の表（時間帯ごとの売上の伸び）。読むのは管理者ページと /api だけ。合言葉の内側",
  achievement_rate_calculations:
    "達成率をいつ計算したかの記録。読むのは管理者ページと毎日の自動処理だけ",
  customer_line_messages:
    "お客さんからの公式LINE（→ CLAUDE.md 4-16）。受け口は /api、一覧は管理者ページだけ",
  customer_line_events:
    "公式LINEの友だち追加・ブロックの記録。書くのは /api の受け口だけ",
  line_groups:
    "スタッフ向けLINEの送り先。読み書きはサーバー側（/api・lib/line）だけ",
  site_visits: "アクセスの数え（/api/hit）。画面からは触らない",
  table_snapshots:
    "毎日の控え（バックアップ・→ CLAUDE.md 4-6）。サーバー側の鍵でしか触れない",
  weather_alerts: "天気の知らせの記録。毎日の自動処理（cron）だけが触る",
  keiri_tenants:
    "お店そのものの棚。鍵かけが有効で決まりが0本＝公開の鍵では1行も読めない（→ /api 経由だけ）",
};

/**
 * 使っていない名前。**棚ではないもの**と、**もう消した棚**。
 * （写しを探す材料の一覧 LIVE_TABLES には残っているので、ここで理由を書いておく）
 */
export const NOT_A_LIVE_TABLE: Record<string, string> = {
  expenses:
    "棚ではありません。日報の中の経費の明細（daily_reports.expenses の列）→ CLAUDE.md 4-2",
  tasks: "2026-08-27 に消した棚（→ CLAUDE.md 4-11）。控えあり",
};

/**
 * ①の棚を「絞らずに」読んでいる、いま分かっている所。
 *
 * ★ここに**書いていない所が増えたらテストが落ちます**。
 *   増えたぶんは、絞るか、ここに理由を書くかの どちらかをしてください。
 *   （理由を書くのは「読む相手が手羽屋に固定されている」ときだけ。
 *     お店によって変わる画面は、必ず絞る側に直すこと）
 */
export const UNSCOPED_READS_WITH_REASON: Record<string, string> = {
  "app/api/keiri/cashcount/route.ts":
    "金庫を数えた結果が合っていたかだけを答える読むだけの窓口（f1-4）。" +
    "読む相手は手羽屋に固定（TEBAYA_SCOPE）で、金額は1円も返さない。1行も書かない",
  "app/api/keiri/diagnose/route.ts":
    "外から1回で状態を見る読むだけの窓口。お申し込みは『何件あるか』だけを数えており、" +
    "どのお店の行かは1行も読まない（中身を返さない）",
  "app/api/keiri/welcome/route.ts":
    "申し込んだお店の初期設定の窓口。入口の合言葉（setup_token）で1件だけを引き当て、" +
    "作る設定にはそのお店の印を必ず付ける。ほかのお店の行は読まない",
  "lib/keiri/applicationStore.ts":
    "お申し込みの棚が生きているかを確かめるために、印つきの試し行を1行 入れて消すだけ。" +
    "ほかのお店の行は読まない",
};

/** 仕分け表に出てくる棚の名前を、ぜんぶ集めたもの（重複なし・名前順） */
export function allClassifiedTables(): string[] {
  return [
    ...new Set([
      ...TENANT_SCOPED_TABLES,
      ...TABLES_WITHOUT_TENANT_COLUMN,
      ...Object.keys(TABLES_NOT_IN_SHOP_SCREENS),
      ...Object.keys(NOT_A_LIVE_TABLE),
    ]),
  ].sort();
}

/** その棚がどの仕分けか（分からなければ null） */
export function classifyTable(
  table: string,
): "scoped" | "gated" | "notInShopScreens" | "notALiveTable" | null {
  if ((TENANT_SCOPED_TABLES as readonly string[]).includes(table)) return "scoped";
  if ((TABLES_WITHOUT_TENANT_COLUMN as readonly string[]).includes(table)) return "gated";
  if (table in TABLES_NOT_IN_SHOP_SCREENS) return "notInShopScreens";
  if (table in NOT_A_LIVE_TABLE) return "notALiveTable";
  return null;
}
