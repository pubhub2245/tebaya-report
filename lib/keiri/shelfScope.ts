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
import { isUnreachableMessage } from "@/lib/keiri/readFailure";
import { isMissingFunction } from "@/lib/keiri/tenantAccess";
import {
  summarizeShelfLeak,
  type ShelfLeak,
  type ShelfLeakCount,
} from "@/lib/keiri/shelfLeak";

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
 * 「お店ごとに分ける必要が無い」と決めた棚（2026-10-17・B／kp253 ③）。
 *
 * ■ なぜ名前を書いて残すのか（やさしい説明）
 *   2026-10-17 に倉庫の台帳を数え直したところ、「どの店のものか」の印の欄が
 *   無い棚が、立替（経営）のほかに3つ見つかりました。これを毎回 数え直すと、
 *   「締め忘れ」と「そもそも分ける必要が無い」が区別できません。
 *   そこで**理由つきで、ここに1回だけ書いて決め**ます。
 *   ここに無い棚が見つかったら、それは締める対象です（PENDING_SHELVES に足す）。
 */
export const SHARED_SHELVES: { table: string; label: string; why: string }[] = [
  {
    table: "keiri_account_mapping",
    label: "科目の対応表",
    why:
      "業態ごとの**全店共通の叩き台**で、お店の数字が1文字も入っていません" +
      "（科目名・税区分・貸借だけ）。分けると、お店ごとに同じ表を持つことになります",
  },
  {
    table: "cash_settings",
    label: "金庫の設定（手羽屋の毎日の画面ぶん）",
    why:
      "手羽屋が毎日使う画面（/cash・/sales-report）だけが読む棚です。" +
      "経理（/keiri）が読むのは keiri_settings のほうで、そちらには印の欄がもうあります",
  },
  {
    table: "pre_registered_expenses",
    label: "先に登録した経費",
    why:
      "アプリのどこからも読み書きしていません（2026-10-17 に数えて0か所）。" +
      "お店の数字がここに入る道がありません",
  },
];

/**
 * 日報のつぎに締める棚（kp253 ③ のお金の棚6つ ＋ kp266 の選択肢の棚3つ）。
 * **消さないこと。** 締め終わった棚もここに残し、窓口があるかで ○× を出します。
 *
 * ■ 立替の「本物」はどちらか（2026-10-17・B の決め・kp253 ③②）
 *   立替の棚は2つありますが、**中身が入っているのは advance_expenses（経営・51行）**で、
 *   keiri_advance_expenses（現場）は0行です（経理の窓口が答える「立替51件」と一致）。
 *   ＝ **締める順番は advance_expenses が先**。空のほうは中身が入り始めてから同じ形で締めます。
 */
/**
 * 棚ごとの「倉庫の窓口」の名前（貼り紙と字句をそろえる）。
 * ★読む所（lib/keiri/loadMonthServer.ts）もここから引きます。
 *   名前を2か所に書き写すと、どちらかを直し忘れて
 *   **よその店の数字が黙って0件になります**（2026-10-18・kp253 ③）。
 */
export const TENANT_CASH_EVENTS_WINDOW = "keiri_tenant_cash_events";
export const TENANT_IGNORES_WINDOW = "keiri_tenant_expense_ignores";
export const TENANT_SETTINGS_WINDOW = "keiri_tenant_settings";
export const TENANT_PAYMENTS_WINDOW = "keiri_tenant_payments";
export const TENANT_FIELD_ADVANCES_WINDOW = "keiri_tenant_advance_expenses";
export const TENANT_OWNER_ADVANCES_WINDOW = "keiri_tenant_advances_old";

/**
 * 選択肢の棚（出店場所・担当者・商品と単価）の窓口（2026-10-29・kp266／f3-4）。
 *
 * ■ なぜ お金の棚と分けて名前を付けるのか（やさしい説明）
 *   ⑧⑩⑪⑫で締めたのは、日報とお金の棚だけでした。
 *   日報で選ぶ「出店場所」「担当者」「商品と単価」の3つは1行も締めておらず、
 *   **よその店の 場所の名前・担当者の名前・商品と単価は 公開の鍵で読めます**
 *   （2026-10-28 に倉庫で実測：22行・8行・7行、どれも印は0行）。
 *   お金ではありませんが**人の名前**が入るので、⑬で同じ形に締めます。
 */
export const TENANT_LOCATIONS_WINDOW = "keiri_tenant_locations";
export const TENANT_STAFF_WINDOW = "keiri_tenant_staff";
export const TENANT_PRODUCTS_WINDOW = "keiri_tenant_products";

/**
 * 貼り紙⑬で締める「選択肢の棚」の名前。
 * ⑫（お金の棚）の数え方と混ざらないよう、ここで1か所だけに書いておく。
 */
export const MASTER_SHELF_TABLES: readonly string[] = [
  "locations",
  "staff_members",
  "sale_products",
];

export const PENDING_SHELVES: ShelfPlan[] = [
  {
    table: "keiri_cash_events",
    label: "金庫の記録",
    window: TENANT_CASH_EVENTS_WINDOW,
    column: "tenant_id",
  },
  {
    table: "keiri_expense_ignores",
    label: "「この支払いは数えない」の印",
    window: TENANT_IGNORES_WINDOW,
    column: "tenant_id",
  },
  {
    table: "keiri_settings",
    label: "経理の設定",
    window: TENANT_SETTINGS_WINDOW,
    column: "tenant_id",
  },
  {
    table: "keiri_payments",
    label: "払った記録",
    window: TENANT_PAYMENTS_WINDOW,
    column: "tenant_id",
  },
  {
    table: "keiri_advance_expenses",
    label: "立替（現場）",
    window: TENANT_FIELD_ADVANCES_WINDOW,
    column: "tenant_id",
  },
  {
    table: "advance_expenses",
    label: "立替（経営）",
    window: TENANT_OWNER_ADVANCES_WINDOW,
    column: "tenant_id",
  },
  // ここから下は貼り紙⑬（選択肢の棚・2026-10-29・kp266）
  {
    table: "locations",
    label: "出店場所",
    window: TENANT_LOCATIONS_WINDOW,
    column: "tenant_id",
  },
  {
    table: "staff_members",
    label: "担当者",
    window: TENANT_STAFF_WINDOW,
    column: "tenant_id",
  },
  {
    table: "sale_products",
    label: "商品と単価",
    window: TENANT_PRODUCTS_WINDOW,
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
  /** **聞けたうえで**まだ締める工事が済んでいない棚 */
  pending: string[];
  /** 聞けなかった棚（開いているとも閉まっているとも言えない・2026-11-08） */
  unknown: string[];
  /**
   * 数えた棚がぜんぶ締まっているか。
   *
   * ★3通りあります（2026-11-08・f3-4）：
   *   true  … 聞けたうえで、ぜんぶ締まっている
   *   false … 聞けたうえで、まだ締まっていない棚がある
   *   null  … **1本も聞けなかった**＝締まっているとも言えない
   *
   *   以前は「聞けなかった棚」も『まだ締めていない棚』に数えていたため、
   *   倉庫が眠っている日に **まだ締めていない棚が 9 つあります** という
   *   聞いてもいない断定が出ていました（11/8 の実測）。
   */
  allScoped: boolean | null;
  /** 「お店ごとに分ける必要が無い」と決めた棚（理由つき・2026-10-17） */
  shared: { table: string; label: string; why: string }[];
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

/**
 * その棚の「倉庫の窓口」があるかを聞く（呼ぶだけ・書き込みません）。
 *
 * ■ 2026-11-07（B・f3-4）いちばん大事な直し：**届かなかったことを「ある」と答えていました**
 *   窓口を呼んで返事が返らなかったとき（倉庫が眠っている・通信が落ちた）、
 *   この関数は「引数ちがいで断られた＝窓口はある」の側に落ちて **true** を返していました。
 *   その結果、貼り紙の⑩⑪⑫⑬（棚をお店ごとに締めたか）が、倉庫が眠っているあいだ
 *   **「流れています」**と答えていました（2026-11-07 の本番で実測。倉庫が起きていた
 *   10-31 の実測は 0／13 なので、この4本は倉庫が止まったせいで出た嘘です）。
 *   ＝ **止まっているのに合格**。f3-4（よその店のデータが見えないか）を
 *   嘘の合格にする筋なので、届かなかったときは **null（測れません）** に倒します。
 *
 *   見分け方は lib/keiri/readFailure.ts の1か所（isUnreachableMessage）を通します。
 *   「本当に断られた」（引数ちがい・権限なし）は今までどおり true のままです。
 */
async function askWindow(plan: ShelfPlan): Promise<boolean | null> {
  try {
    const db = anonClient({ fresh: true });
    const { error } = await db.rpc(plan.window, {});
    return decideWindowReady(error);
  } catch {
    return null;
  }
}

/**
 * 窓口を呼んだ結果から「窓口があるか」を決める（**決まりはここ1か所**）。
 *
 *   ・返事が来た（error なし）           … true（ある）
 *   ・その名前の窓口が無い              … false（まだ無い）
 *   ・倉庫まで届かなかった              … **null（測れません）**
 *   ・それ以外の断られ方（引数ちがい等） … true（窓口そのものはある）
 *
 * tests/keiriShelfScope.test.ts で固定してあります。
 */
export function decideWindowReady(
  error: { message?: string | null; code?: string | null } | null,
): boolean | null {
  if (!error) return true;
  if (isMissingFunction({ message: error.message ?? undefined, code: error.code ?? undefined })) {
    return false;
  }
  // 倉庫まで届いていない＝**分からない**（「ある」に倒さない）
  if (isUnreachableMessage(error.message)) return null;
  // 引数ちがい等で断られた＝窓口そのものはある
  return true;
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

/** 棚ごとの答えを1つにまとめる（計算だけ・倉庫に聞きません） */
export function summarizeShelfScopes(shelves: ShelfScopeReport[]): ShelvesScopeReport {
  const leaking = shelves.filter((s) => s.scoped === false && (s.foreignRows ?? 0) > 0);
  // ★聞けた（scoped が false）棚だけを「まだ締めていない」に数える
  const pending = shelves.filter((s) => s.scoped === false);
  // ★聞けなかった（scoped が null）棚は、別に数える（断定しないため）
  const unknown = shelves.filter((s) => s.scoped === null);
  const allScoped: boolean | null =
    pending.length > 0 ? false : unknown.length > 0 ? null : true;
  return {
    shelves,
    leaking: leaking.map((s) => s.table),
    pending: pending.map((s) => s.table),
    unknown: unknown.map((s) => s.table),
    allScoped,
    shared: SHARED_SHELVES,
    summary:
      leaking.length > 0
        ? `**よその店の行が、${leaking.length} つの棚で公開の鍵で読めます**：` +
          leaking.map((s) => s.label).join("・")
        : pending.length > 0
          ? `日報のほかに、まだ締めていない棚が ${pending.length} つあります：` +
            pending.map((s) => s.label).join("・") +
            "（いまは どのお店の行も入っていないので漏れていません）" +
            (unknown.length > 0
              ? `。ほかに ${unknown.length} つは聞けませんでした`
              : "")
          : unknown.length > 0
            ? `日報のほかの棚は、いま ${unknown.length} 本とも聞けませんでした` +
              "（締まったかどうかは分かりません。分からないまま合格にしないこと）"
            : "日報のほかの棚も、ぜんぶ締まっています",
    check: "f3-4",
    how:
      "棚ごとに2つ聞いています：①公開の鍵で『印が付いた行』が読めるか（件数だけ）" +
      "②その棚の倉庫の窓口があるか。**窓口と読む決まりは対で足す決まり**なので、" +
      "窓口があれば締まったと見ます（行が1行も無くても確かめられます）。" +
      "「お店ごとに分ける必要が無い」と決めた棚は shared に理由つきで並べてあり、" +
      "合否には入れません（お店の数字が1文字も入らない棚だけです）",
  };
}

/**
 * 「いま、よその店の行が公開の鍵で何行 読めているか」だけを数える（f3-4・2026-11-13）。
 *
 * ■ probeShelfScopes との違い
 *   probeShelfScopes は棚ごとに2つ聞きます（①印が付いた行が読めるか ②倉庫の窓口があるか）。
 *   ここは **①だけ**です。じゅんが見る一覧（/keiri のいちばん上）に出す1行のためで、
 *   窓口があるかは要らないためです（**公開の鍵で読めた行は、窓口の有無にかかわらず
 *   いま読めている**）。聞く回数が半分になるので、一覧の表示を待たせません。
 *
 * ★1行も書き込みません。行の中身（名前・金額・お店の番号）は1文字も受け取りません。
 */
export async function probeShelfLeak(
  plans: ShelfPlan[] = PENDING_SHELVES,
): Promise<ShelfLeak> {
  const counts = await Promise.all(
    plans.map(async (plan): Promise<ShelfLeakCount> => {
      const r = await countForeignRows(plan);
      return { table: plan.table, label: plan.label, rows: r.rows };
    }),
  );
  return summarizeShelfLeak(counts);
}
