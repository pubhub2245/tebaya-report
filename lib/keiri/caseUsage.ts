/**
 * 「手羽屋が、このアプリを本当に毎日使っているか」を、日報から数えて出す。
 *
 * ■ なぜ作ったか（司令室 kp136）
 *   紹介ページ（/keiri/case）には「手羽屋で実際に使っています」と書いてあるだけで、
 *   その証拠が1つもありませんでした。受け取る店主がいちばん知りたいのは
 *   「本当に毎日続いているのか」で、そこが埋まらないと月額を出す判断がつきません。
 *
 * ■ 決めごと（ここを外さないこと）
 *   - **金額は1つも扱わない。** 売上・利益・仕入などの列は取りに行かない。
 *     このページを開くのは、手羽屋と同じ出店先に出ている同業のお店です。
 *     続いている月数や日報の枚数は手の内になりませんが、金額はなります。
 *     そのため、この集計で倉庫から取るのは **日付・屋号・集計から外す印** の3つだけ。
 *   - 数えるのは **手羽屋の日報だけ**（caseStats.ts の isCaseShopRow と同じ数え方）。
 *     もも屋の日報を混ぜない。申し込んだお店の日報（印が付いた行）も混ぜない。
 *   - 「集計から外す」印が付いた日報は数えない（CLAUDE.md 4-14）。
 *   - 未来の日付は数えない（打ち間違いで「続いている月数」が伸びないように）。
 *   - **倉庫が読めない・1枚も無いときは null を返す。** 画面はその区画ごと出さない。
 *     控えの数字を手で書いて置くことはしない（古くなった瞬間に嘘になるため）。
 *   - 読むだけ。書き込みはしない。
 */

import { serverClient } from "@/lib/supabaseServer";
import { isCaseShopRow } from "@/lib/keiri/caseStats";

/** 倉庫から取る1行（金額の列は入っていない） */
export type UsageRow = {
  date?: string | null;
  /** どの屋号の日報か（「手羽屋」／「もも屋」）。空＝古い日報で、既定は手羽屋 */
  shop?: string | null;
  /** 集計から外す印（CLAUDE.md 4-14） */
  exclude_from_stats?: boolean | null;
};

/** 紹介ページに出す「続いていること」の実測値 */
export type CaseUsage = {
  /** これまでに書かれた日報の枚数 */
  reports: number;
  /** 日報が1枚以上ある月の数 */
  months: number;
  /** いちばん古い月（「2026年4月」） */
  firstMonth: string;
  /** いちばん新しい月（「2026年9月」） */
  lastMonth: string;
  /** 最初の月から最後の月まで、1か月も抜けずに日報があるか */
  noGap: boolean;
  /** いちばん新しい日報の日付（「2026年9月21日」） */
  lastDate: string;
  /** 数えた日（「2026-09-24」） */
  checkedOn: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Date → 「2026-09-24」（日本時間の暦日。画面もこの日付で「◯◯ 集計」と出す） */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 「2026-04」→「2026年4月」 */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${Number(y)}年${Number(m)}月`;
}

/** 「2026-09-21」→「2026年9月21日」 */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

/** 「2026-04」から「2026-09」までは何か月ぶんか（両端を含む。同じ月なら1） */
export function monthSpan(firstYm: string, lastYm: string): number {
  const [fy, fm] = firstYm.split("-").map(Number);
  const [ly, lm] = lastYm.split("-").map(Number);
  return (ly - fy) * 12 + (lm - fm) + 1;
}

/**
 * 日報の行から「続いていること」を数える（純粋な計算。テストはここに掛ける）。
 * 数えられる行が1つも無ければ null。
 */
export function summarizeUsage(rows: UsageRow[], today: Date = new Date()): CaseUsage | null {
  const todayIso = toIsoDate(today);
  const dates: string[] = [];

  for (const r of rows) {
    if (!isCaseShopRow(r)) continue;
    if (r.exclude_from_stats) continue;
    const d = String(r.date ?? "").trim();
    if (!DATE_RE.test(d)) continue;
    if (d > todayIso) continue; // 未来の日付は数えない
    dates.push(d);
  }

  if (dates.length === 0) return null;

  dates.sort();
  const months = Array.from(new Set(dates.map((d) => d.slice(0, 7)))).sort();
  const firstYm = months[0];
  const lastYm = months[months.length - 1];

  return {
    reports: dates.length,
    months: months.length,
    firstMonth: monthLabel(firstYm),
    lastMonth: monthLabel(lastYm),
    noGap: months.length === monthSpan(firstYm, lastYm),
    lastDate: dateLabel(dates[dates.length - 1]),
    checkedOn: todayIso,
  };
}

/**
 * 倉庫（日報）から「続いていること」を数える。
 * 読めなければ null を返し、画面はその区画ごと出さない（数字を作らない）。
 */
export async function getCaseUsage(today: Date = new Date()): Promise<CaseUsage | null> {
  try {
    const db = serverClient();
    const { data, error } = await db
      .from("daily_reports")
      // ★金額の列は1つも取らない（このページは同業の店主も開くため）
      .select("date, shop, exclude_from_stats")
      // 手羽屋のぶんだけ（印が空＝手羽屋。lib/tenantScope.ts）
      .is("tenant_id", null)
      .order("date", { ascending: true })
      .limit(5000);

    if (error || !data || data.length === 0) return null;
    return summarizeUsage(data as UsageRow[], today);
  } catch {
    return null;
  }
}
