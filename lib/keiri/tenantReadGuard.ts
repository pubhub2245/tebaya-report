/**
 * 「よその店の日報が、公開の鍵で見えてしまわないか」を
 * **外から1回で確かめる**ところ（f3-4・2026-10-15・kp251）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   日報の棚（daily_reports）には「どの店のものか」の印が付いていて、
 *   アプリの読む所はぜんぶ その印で絞っています。
 *   ところが**棚そのものの決まり**は長いあいだ「だれでも・条件なし」の1本だけで、
 *   アプリを通さず公開の鍵で聞けば、印が付いた行もそのまま読めました。
 *   貼り紙⑧（/keiri/sql）が、ここに「**印が空の行だけ 読んでよい**」を1本 足します。
 *
 * ■ 読み方に気をつける所（ここを取り違えると嘘の合格が出ます）
 *   ・**手羽屋の行（印が空）は、流したあとも公開の鍵で読めます。** それが正しい形です
 *     （ブラウザから倉庫を読む作りで、お店ごとの入室がまだ無いため。CLAUDE.md 4-8）。
 *     ＝「日報の棚が公開の鍵で読めるか」だけを見ると、流したあとも「開いている」に見えます。
 *     f3-4 が聞いているのは**よその店の行が見えるか**なので、そこだけを数えます。
 *   ・**よその店の行が1行も無いときは「0件」です。** これは
 *     「閉まっている」と「まだ試せていない」の区別が付きません。
 *     そこで、同じ⑧で作る**倉庫の窓口**ごしにも読んでみて、
 *     「窓口では見えるのに、公開の鍵では見えない」が揃ったときだけ閉まったと言います。
 *
 * ★1行も書き込みません。行の中身（金額・お店の名前・連絡先）は1文字も返しません。
 * ★鍵・合言葉の値は返しません。
 */

import { anonClient } from "@/lib/supabaseServer";
import { isMissingFunction } from "@/lib/keiri/tenantAccess";
import { TEST_SHOP } from "@/lib/keiri/tenantTrial";

/** ⑧で足す「読む決まり」の名前（貼り紙と字句をそろえる） */
export const TENANT_READ_POLICY = "keiri_only_tebaya_rows_readable";

/** ⑧で作る「倉庫の窓口」の名前（貼り紙と字句をそろえる） */
export const TENANT_READ_WINDOW = "keiri_tenant_reports";

export type TenantReadGuardReport = {
  /** 公開の鍵で読めた「印が付いた行」の数。聞けなければ null */
  anonVisible: number | null;
  /** 倉庫の窓口があるか。聞けなければ null */
  windowReady: boolean | null;
  /** 窓口ごしに読めたテストの店の日報の数。窓口が無い・聞けなければ null */
  viaWindow: number | null;
  /**
   * よその店の行が、公開の鍵から隠れているか。
   * **分からないときは null**（「まだ試せていない」を「閉まった」にしない）
   */
  separated: boolean | null;
  note: string;
  policy: string;
  window: string;
};

/** 公開の鍵で「印が付いた行」を数える（中身は1文字も受け取りません） */
async function countTenantRowsWithAnonKey(): Promise<number | null> {
  try {
    const db = anonClient({ fresh: true });
    const { count, error } = await db
      .from("daily_reports")
      .select("id", { count: "exact" })
      .not("tenant_id", "is", null)
      .limit(0);
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

/** 窓口ごしに、テストの店の日報を数える（件数だけ・中身は返しません） */
async function countViaWindow(): Promise<{ ready: boolean | null; rows: number | null }> {
  try {
    const db = anonClient({ fresh: true });
    const { data, error } = await db.rpc(TENANT_READ_WINDOW, {
      p_password_hash: null,
      p_from: null,
      p_to: null,
      p_test_mark: TEST_SHOP.mark,
    });
    if (error) {
      if (isMissingFunction(error)) return { ready: false, rows: null };
      return { ready: null, rows: null };
    }
    return { ready: true, rows: Array.isArray(data) ? data.length : 0 };
  } catch {
    return { ready: null, rows: null };
  }
}

/** よその店の行が隠れているかを、外から1回で確かめる */
export async function probeTenantReadGuard(): Promise<TenantReadGuardReport> {
  const [anonVisible, win] = await Promise.all([
    countTenantRowsWithAnonKey(),
    countViaWindow(),
  ]);
  const separated = decideSeparated({
    anonVisible,
    windowReady: win.ready,
    viaWindow: win.rows,
  });
  return {
    anonVisible,
    windowReady: win.ready,
    viaWindow: win.rows,
    separated,
    note: guardNote({
      anonVisible,
      windowReady: win.ready,
      viaWindow: win.rows,
      separated,
    }),
    policy: TENANT_READ_POLICY,
    window: TENANT_READ_WINDOW,
  };
}

/** 答えを出す決まり（**分からないときは null**）。ここだけ見れば判定が分かる */
export function decideSeparated(p: {
  anonVisible: number | null;
  windowReady: boolean | null;
  viaWindow: number | null;
}): boolean | null {
  if (p.anonVisible === null) return null;
  // 公開の鍵で、よその店の行が1行でも見えた＝まだ分かれていない
  if (p.anonVisible > 0) return false;
  // 窓口では見えるのに、公開の鍵では見えない＝閉まっている（ここだけが証拠になる）
  if (p.windowReady === true && (p.viaWindow ?? 0) > 0) return true;
  return null;
}

/** 判定を、やさしい1行にする */
export function guardNote(p: {
  anonVisible: number | null;
  windowReady: boolean | null;
  viaWindow: number | null;
  separated: boolean | null;
}): string {
  if (p.anonVisible === null) {
    return "公開の鍵で聞けませんでした。分からないまま合格にしないこと";
  }
  if (p.separated === false) {
    return (
      `公開の鍵で、よその店の日報が ${p.anonVisible} 行 読めます。` +
      "貼り紙⑧（/keiri/sql）を1回 流すと読めなくなります" +
      "（手羽屋の行＝印が空は、今までどおり読めます）"
    );
  }
  if (p.separated === true) {
    return (
      "よその店の日報は、公開の鍵では1行も読めません。" +
      `同じ行を倉庫の窓口ごしに読むと ${p.viaWindow} 行 見えます` +
      "＝ 行はあるのに公開の鍵からは隠れている、ということです"
    );
  }
  if (p.windowReady === false) {
    return (
      "倉庫の窓口がまだありません＝貼り紙⑧をまだ流していません。" +
      "よその店の行も1行も無いので、公開の鍵から隠れているかは試せていません"
    );
  }
  return (
    "よその店の行が1行も無いので、隠れているかどうかは まだ試せていません" +
    "（貼り紙⑥でテストの店を作り、2軒目を入れる手順の手順5で日報を1枚 入れると試せます）"
  );
}
