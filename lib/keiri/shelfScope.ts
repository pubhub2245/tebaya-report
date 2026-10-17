/**
 * 「日報いがいの棚も、お店ごとに分かれているか」を**外から**確かめるところ
 * （f3-4・kp253 ③・2026-10-17）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   貼り紙⑧は、いちばん大きい棚（日報）だけを締めます。
 *   ところが経理には**ほかにも棚があります**（金庫の記録・数えない印・
 *   経理の設定・払った記録・立替の2つ）。この6つは今も
 *   「だれでも・条件なし」の決まり1本だけで、**2軒目のお店に数字が入った瞬間に、
 *   公開の鍵でそのまま読めます**（kp253 の18:34 の調べ）。
 *
 * ■ ここが無いと何が起きるか（これを見つけたのが今回です）
 *   f3-4 の合否（lib/keiri/copyProbe.ts の verdict）は、長いあいだ
 *   **日報の棚と写し（控え）の2つだけ**を見ていました。
 *   そのため貼り紙を流した日に、残りの6つが開いたままでも
 *   **「合格」と出てしまいます**（＝ 嘘の合格）。
 *   ここで6つも一緒に数え、揃っていなければ合格にしません。
 *
 * ■ 行が1行も無くても、外から確かめられる形にしてあります
 *   棚を締めるときは、⑧と同じく「**倉庫の窓口**（その店の行だけを返す命令）」と
 *   「**読む決まり**」を**対で**足します（窓口が無いまま締めると、2軒目のお店が
 *   自分の数字を読めなくなります。kp253 の18:34）。
 *   ＝ **窓口があるか**を聞けば、その棚が締められたかが分かります。
 *   行が1行も無くても聞けるので、2軒目を待たずに合否が進みます。
 *
 * ★1行も書き込みません。行の中身（金額・お店の名前・連絡先）は1文字も読みません。
 * ★鍵・合言葉の値は返しません。返すのは棚の名前と ○× だけです。
 */

import { anonClient } from "@/lib/supabaseServer";
import { isMissingFunction } from "@/lib/keiri/tenantAccess";

/** その棚を締めるのに要るもの（窓口の名前は、足すときに貼り紙と字句をそろえる） */
export type ShelfPlan = {
  /** 棚の名前（倉庫の中の名前） */
  table: string;
  /** やさしい言い方 */
  label: string;
  /** その棚の「倉庫の窓口」の名前。これがあれば締められたと見ます */
  window: string;
  /** 「どの店か」の印の欄の名前 */
  column: string;
};

/**
 * 日報のつぎに締める棚（kp253 ③ の6つ）。
 * **消さないこと。** 締め終わった棚もここに残し、窓口があるかで ○× を出します。
 */
export const PENDING_SHELVES: ShelfPlan[] = [
  {
    table: "keiri_cash_events",
    label: "金庫の記録",
    window: "keiri_tenant_cash_events",
    column: "tenant_id",
  },
  {
    table: "keiri_expense_ignores",
    label: "「この支払いは数えない」の印",
    window: "keiri_tenant_expense_ignores",
    column: "tenant_id",
  },
  {
    table: "keiri_settings",
    label: "経理の設定",
    window: "keiri_tenant_settings",
    column: "tenant_id",
  },
  {
    table: "keiri_payments",
    label: "払った記録",
    window: "keiri_tenant_payments",
    column: "tenant_id",
  },
  {
    table: "keiri_advance_expenses",
    label: "立替（現場）",
    window: "keiri_tenant_advance_expenses",
    column: "tenant_id",
  },
  {
    table: "advance_expenses",
    label: "立替（経営）",
    window: "keiri_tenant_advances_old",
    column: "tenant_id",
  },
];

export type ShelfScopeReport = {
  table: string;
  label: string;
  /** その棚があるか（公開の鍵で聞けたか）。分からなければ null */
  exists: boolean | null;
  /** 「どの店か」の欄があるか。分からなければ null */
  hasColumn: boolean | null;
  /** 倉庫の窓口があるか（＝締める工事が済んでいるか）。分からなければ null */
  windowReady: boolean | null;
  /** 公開の鍵で読めてしまった「印が付いた行」の数。聞けなければ null */
  foreignRows: number | null;
  /**
   * その棚が、お店ごとに分かれているか。
   * **分からないときは null**（「まだ工事していない」を「閉まった」にしない）
   */
  scoped: boolean | null;
  note: string;
  window: string;
};

export type ShelvesScopeReport = {
  shelves: ShelfScopeReport[];
  /** いま公開の鍵で、よその店の行が読めてしまっている棚 */
  leaking: string[];
  /** まだ締める工事が済んでいない棚 */
  pending: string[];
  /** 6つぜんぶ締まっているか（1つでも分からなければ false） */
  allScoped: boolean;
  summary: string;
  check: string;
  how: string;
};

/** 公開の鍵で「印が付いた行」を数える（中身は1文字も受け取りません） */
async function countForeignRows(
  plan: ShelfPlan,
): Promise<{ exists: boolean | null; hasColumn: boolean | null; rows: number | null }> {
  try {
    const db = anonClient({ fresh: true });
    const { count, error } = await db
      .from(plan.table)
      .select(plan.column, { count: "exact" })
      .not(plan.column, "is", null)
      .limit(0);
    if (error) {
      const code = String(error.code ?? "");
      // 42P01 / PGRST205 = その棚がありません
      if (code === "42P01" || code === "PGRST205") {
        return { exists: false, hasColumn: null, rows: null };
      }
      // 42703 = その欄がありません（棚はある）
      if (code === "42703") return { exists: true, hasColumn: false, rows: null };
      return { exists: null, hasColumn: null, rows: null };
    }
    return { exists: true, hasColumn: true, rows: typeof count === "number" ? count : null };
  } catch {
    return { exists: null, hasColumn: null, rows: null };
  }
}

/** その棚の「倉庫の窓口」があるかを聞く（呼ぶだけ・書き込みません） */
async function askWindow(plan: ShelfPlan): Promise<boolean | null> {
  try {
    const db = anonClient({ fresh: true });
    const { error } = await db.rpc(plan.window, {});
    if (!error) return true;
    if (isMissingFunction(error)) return false;
    // 引数ちがい等で断られた＝窓口そのものはある
    return true;
  } catch {
    return null;
  }
}

/** 答えを出す決まり（**分からないときは null**）。ここだけ見れば判定が分かる */
export function decideShelfScoped(p: {
  exists: boolean | null;
  foreignRows: number | null;
  windowReady: boolean | null;
}): boolean | null {
  // その棚がまだ無い＝漏れようがない（＝この棚については分かれている）
  if (p.exists === false) return true;
  // 公開の鍵で、よその店の行が1行でも見えた＝分かれていない
  if ((p.foreignRows ?? 0) > 0) return false;
  // 窓口と決まりを対で足し終えている＝締まっている
  if (p.windowReady === true) return true;
  // 窓口がまだ無い＝まだ締めていない（行が無いだけで「閉まった」とは言わない）
  if (p.windowReady === false) return false;
  return null;
}

/** 判定を、やさしい1行にする */
export function shelfNote(plan: ShelfPlan, r: Omit<ShelfScopeReport, "note" | "window">): string {
  if (r.exists === false) {
    return `${plan.label}の棚は、まだこの倉庫にありません（貼り紙で作られます）。漏れる中身もありません`;
  }
  if (r.exists === null) {
    return `${plan.label}の棚を聞けませんでした。分からないまま合格にしないこと`;
  }
  if ((r.foreignRows ?? 0) > 0) {
    return (
      `**${plan.label}の棚で、よその店の行が ${r.foreignRows} 行、公開の鍵で読めます。**` +
      `倉庫の窓口（${plan.window}）と読む決まりを対で足して締めてください`
    );
  }
  if (r.hasColumn === false) {
    return (
      `${plan.label}の棚には、まだ「どの店か」の欄（${plan.column}）がありません。` +
      "欄を足す → 窓口を作る → 締める、の順です"
    );
  }
  if (r.windowReady === true) {
    return `${plan.label}の棚は締まっています（倉庫の窓口 ${plan.window} があります）`;
  }
  if (r.windowReady === false) {
    return (
      `${plan.label}の棚は、まだ締めていません（倉庫の窓口 ${plan.window} がありません）。` +
      "いまは どのお店の行も入っていないので漏れていませんが、" +
      "**2軒目のお店に数字が入る前に締めること**"
    );
  }
  return `${plan.label}の棚は、締まっているかどうか まだ分かりません`;
}

/** 日報いがいの棚を、まとめて外から確かめる */
export async function probeShelfScopes(
  plans: ShelfPlan[] = PENDING_SHELVES,
): Promise<ShelvesScopeReport> {
  const shelves = await Promise.all(
    plans.map(async (plan): Promise<ShelfScopeReport> => {
      const [rows, windowReady] = await Promise.all([countForeignRows(plan), askWindow(plan)]);
      const base = {
        table: plan.table,
        label: plan.label,
        exists: rows.exists,
        hasColumn: rows.hasColumn,
        windowReady,
        foreignRows: rows.rows,
        scoped: decideShelfScoped({
          exists: rows.exists,
          foreignRows: rows.rows,
          windowReady,
        }),
      };
      return { ...base, note: shelfNote(plan, base), window: plan.window };
    }),
  );
  return summarizeShelfScopes(shelves);
}

/** 6つの答えを1つにまとめる（計算だけ・倉庫に聞きません） */
export function summarizeShelfScopes(shelves: ShelfScopeReport[]): ShelvesScopeReport {
  const leaking = shelves.filter((s) => s.scoped === false && (s.foreignRows ?? 0) > 0);
  const pending = shelves.filter((s) => s.scoped !== true);
  return {
    shelves,
    leaking: leaking.map((s) => s.table),
    pending: pending.map((s) => s.table),
    allScoped: pending.length === 0,
    summary:
      leaking.length > 0
        ? `**よその店の行が、${leaking.length} つの棚で公開の鍵で読めます**：` +
          leaking.map((s) => s.label).join("・")
        : pending.length > 0
          ? `日報のほかに、まだ締めていない棚が ${pending.length} つあります：` +
            pending.map((s) => s.label).join("・") +
            "（いまは どのお店の行も入っていないので漏れていません）"
          : "日報のほかの棚も、ぜんぶ締まっています",
    check: "f3-4",
    how:
      "棚ごとに2つ聞いています：①公開の鍵で『印が付いた行』が読めるか（件数だけ）" +
      "②その棚の倉庫の窓口があるか。**窓口と読む決まりは対で足す決まり**なので、" +
      "窓口があれば締まったと見ます（行が1行も無くても確かめられます）",
  };
}
