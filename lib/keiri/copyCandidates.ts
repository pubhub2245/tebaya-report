/**
 * 「手羽屋のデータの写し」を、**名前を自分で組み立てて探す**ところ
 * （f3-4・2026-10-14 18:34・kp239）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   写しが開いていないかは /api/keiri/copies で外から確かめられます。
 *   ところがこの窓口は、**倉庫が表に出している棚の名前の一覧**を頼りにしていて、
 *   本番ではその一覧が読めません（公開の鍵で聞くと 401 で断られます）。
 *   そのため実際に聞けていたのは、**これまでに目で見つけた2つだけ**でした。
 *   ＝「写しはこの2つで全部です」と言い切れない状態です。
 *   （2026-10-13 と 10-14 に、1つずつ新しい写しが見つかっています。
 *     目で見つけるやり方では、まだ残っている可能性を消せません。）
 *
 * ■ どう直すか
 *   一覧が読めないなら、**こちらで名前を組み立てて片っぱしから聞きます。**
 *   アプリが使っている棚の名前（下の LIVE_TABLES）に、
 *   写しによくある語尾（_backup / _bak / _copy / _old …）と
 *   頭（deleted_…）を足した名前を作り、公開の鍵で1つずつ聞きます。
 *   ・返事が「そんな棚はありません」… 無い（ふつうはこれ）
 *   ・返事が「断られました」… 鍵が効いている
 *   ・**読めてしまった … 写しが開いている**（これを見つけたい）
 *
 * ■ ここで作らない名前
 *   ・別のアプリの棚（pkmn_…）… CLAUDE.md 4-11「触らないこと」
 *   ・日付つきの名前を総当たりで作ることはしません（何万通りにもなるため）。
 *     **実際に見かけた日付だけ**を足します（KNOWN_COPY_DATES）。
 *
 * ★見つけた名前は lib/keiri/copyProbe.ts の KNOWN_COPY_TABLES に足すこと（消さない）。
 */

import { isCopyTableName, isForeignTable } from "@/lib/keiri/copyTables";

/**
 * アプリが使っている棚の名前（2026-10-14 に、コードの中の読み書きを数え上げたもの）。
 * ★ここに並ぶのは「いま使っている棚」です。鍵をかける相手ではありません。
 *   写しの名前を**組み立てる材料**としてだけ使います。
 */
export const LIVE_TABLES = [
  "achievement_rate_calculations",
  "achievement_rates",
  "advance_expenses",
  "agenda_items",
  "cash_settings",
  "customer_line_events",
  "customer_line_messages",
  "daily_cancellations",
  "daily_report_edits",
  "daily_reports",
  "expenses",
  "feedback_box",
  "feedback_replies",
  "interim_reports",
  "keiri_account_mapping",
  "keiri_advance_expenses",
  "keiri_applications",
  "keiri_cash_events",
  "keiri_expense_ignores",
  "keiri_payments",
  "keiri_reports",
  "keiri_settings",
  "keiri_tenants",
  "line_groups",
  "location_rank_history",
  "locations",
  "monthly_limited_products",
  "prep_reports",
  "prep_sessions",
  "prep_settings",
  "sale_products",
  "setup_checks",
  "shifts",
  "site_visits",
  "staff_members",
  "table_snapshots",
  "tasks",
  "venue_inquiries",
  "weather_alerts",
] as const;

/** 写しによくある語尾 */
export const COPY_SUFFIXES = [
  "_backup",
  "_backups",
  "_bak",
  "_copy",
  "_old",
  "_snapshot",
] as const;

/**
 * 実際に見かけた日付（この日付だけを足す。総当たりはしない）。
 * ・20260902 … レシート写真を置き場へ引っ越す前に取った控え（docs/keiri.md 11-3）
 * ・20260827 … 使っていない棚を消す前に取った控え（CLAUDE.md 4-11）
 */
export const KNOWN_COPY_DATES = ["20260902", "20260827"] as const;

/**
 * 聞く相手の名前を組み立てる。
 *
 * ★同じ名前は1回だけ。名前順に並べる（毎回 同じ順番で聞けるようにするため）。
 * ★「写しの名前のかたち」（lib/keiri/copyTables.ts）を通らないものは作りません
 *   ＝ いま使っている棚そのものを聞くことはありません。
 *
 * @param extra すでに分かっている写しの名前（必ず入れる）
 */
export function copyCandidateNames(extra: readonly string[] = []): string[] {
  const out = new Set<string>();
  const add = (name: string) => {
    const n = name.trim().toLowerCase();
    if (!n) return;
    if (isForeignTable(n)) return; // 別のアプリの棚は触らない
    if (!isCopyTableName(n)) return; // 写しの名前のかたちでなければ聞かない
    out.add(n);
  };

  for (const t of extra) add(t);
  for (const base of LIVE_TABLES) {
    if (isForeignTable(base)) continue;
    // いま使っている棚のうち、名前がすでに写しのかたちをしているもの
    // （table_snapshots など）も、開いていないか1回 聞いておく
    add(base);
    for (const suffix of COPY_SUFFIXES) {
      add(`${base}${suffix}`);
      for (const date of KNOWN_COPY_DATES) add(`${base}${suffix}_${date}`);
    }
    add(`deleted_${base}`);
    for (const date of KNOWN_COPY_DATES) add(`deleted_${base}_${date}`);
  }
  return [...out].sort();
}

/**
 * 「聞いた結果」から、見つかった写しだけを拾う（無い棚は数えるだけで並べない）。
 *
 * ■ なぜ無い棚を並べないのか
 *   組み立てた名前は何百通りにもなり、ほとんどは「そんな棚はありません」です。
 *   ぜんぶ並べると、本当に見てほしい行が埋まります。
 *   **無かった数だけ**を返して、開いている／分からない棚だけを並べます。
 */
export type SweepTally = {
  /** 聞いた数 */
  asked: number;
  /** 「そんな棚はありません」だった数 */
  absent: number;
  /** 鍵が効いていた数 */
  locked: number;
  /** 読めてしまった（＝開いている）棚の名前 */
  open: string[];
  /** 聞けなかった棚の名前 */
  unknown: string[];
};
