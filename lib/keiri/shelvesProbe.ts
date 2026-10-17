/**
 * 貼り紙（/keiri/sql）が流れたかを、**サーバー側で倉庫を読んで**確かめるところ。
 *
 * ■ なぜ分けたか（2026-10-10・kp247）
 *   読む手順はもともと app/api/keiri/shelves/route.ts の中に直接書かれていました。
 *   「のこりの手続き」の窓口（/api/keiri/setuptodo）でも同じことを知りたいのですが、
 *   読む手順をもう1つ書くと、**どちらかを直したときに答えが割れます**。
 *   そこで読む手順をこのファイル1つに寄せ、両方の窓口がここを通るようにしました
 *   （CLAUDE.md 4-1 と同じ考え方）。
 *
 * ★1行も書き込みません。中身（金額・お店の名前・連絡先）は1文字も返しません。
 * ★鍵・合言葉の値は返しません。
 */

import { anonClient, serverClient, serviceClientOrNull } from "@/lib/supabaseServer";
import {
  BACKUP_COPY_TABLE,
  describeShelf,
  missingProbe,
  SHELF_STEPS,
  type ShelfProbe,
  type ShelfReport,
} from "@/lib/keiri/shelves";
import { peekTestShop } from "@/lib/keiri/tenantTrialServer";
import { decodeCashCountMemo } from "@/lib/keiri/cashCountMemo";
import { probeTenantReadGuard } from "@/lib/keiri/tenantReadGuard";
import { PENDING_SHELVES, probeShelfScopes } from "@/lib/keiri/shelfScope";

/** その棚（または欄）が1行 読めるかだけを見る。中身は捨てる */
export async function probeShelf(table: string, column: string): Promise<ShelfProbe> {
  try {
    const db = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
    const { error } = await db.from(table).select(column).limit(1);
    if (!error) return { ok: true };
    return { ok: false, code: error.code ?? null, message: error.message ?? null };
  } catch {
    return { ok: false, code: null, message: "通信に失敗しました" };
  }
}

/**
 * ⑥だけは「棚」ではなく、貼り紙が作る**テストのお店1行**を見る。
 * お店の棚はブラウザの鍵では読めないので、必ず1行できる
 * **経理の設定の行**を見る（lib/keiri/tenantTrialServer.ts と同じ道）。
 */
async function probeTrialShop(): Promise<ShelfProbe> {
  const found = await peekTestShop();
  if (found.kind === "row") return { ok: true };
  if (found.kind === "none") return missingProbe("テストのお店がまだありません");
  return { ok: false, code: null, message: "通信に失敗しました" };
}

/**
 * ⑦だけは「棚があるか」ではなく、**表に出ている鍵では読めないか**を見る。
 *
 * ■ ここが他と逆です（やさしい説明）
 *   ①〜⑥は「読めたら、流れている」でした。⑦は鍵をかける話なので、
 *   **読めてしまったら、まだ流れていない**という逆の読み方になります。
 *   だから必ず**公開の鍵**（ブラウザに配られているのと同じ鍵）で聞きます。
 *   サーバー側の鍵で聞くと、鍵の決まりを飛び越えて読めてしまい、
 *   「まだ開いている」のに「閉まっている」と答えてしまいます。
 *
 * ★行の中身は1文字も読みません（件数があるかだけを見ます）。
 */
export async function probeBackupLocked(): Promise<ShelfProbe> {
  try {
    const db = anonClient({ fresh: true });
    const { count, error } = await db
      .from(BACKUP_COPY_TABLE)
      .select("*", { count: "exact", head: true });

    if (error) {
      // 控えそのものが無い倉庫＝漏れる所が無い（＝これ以上やることが無い）
      if (isMissingTable(error.code, error.message)) return { ok: true };
      // 断られた＝鍵が効いている
      if (String(error.code ?? "") === "42501" || /permission denied/i.test(error.message ?? "")) {
        return { ok: true };
      }
      // それ以外は「分からない」。閉まったことにしない
      return { ok: false, code: error.code ?? null, message: error.message ?? null };
    }

    // 1行も見えない＝鍵が効いている（控えには13行あるので、空ではありません）
    if ((count ?? 0) === 0) return { ok: true };
    return missingProbe("公開の鍵で、まだ中の行が数えられます（鍵がかかっていません）");
  } catch {
    return { ok: false, code: null, message: "通信に失敗しました" };
  }
}

/**
 * ⑧だけは「棚があるか」ではなく、**よその店の行が公開の鍵から隠れたか**を見る。
 *
 * ■ ここも読み方が逆です（⑦と同じ）
 *   流したあとも、**手羽屋の行（印が空）は公開の鍵で読めます**。それが正しい形です。
 *   見るのは「印が付いた行（よその店の行）が見えるか」だけで、
 *   見えてしまったら まだ流れていません。
 *   数え方は lib/keiri/tenantReadGuard.ts の1か所だけ（/api/keiri/copies と同じ）。
 */
async function probeTenantReadGuard_(): Promise<ShelfProbe> {
  const g = await probeTenantReadGuard();
  // 公開の鍵で よその店の行が見えた＝まだ流れていない
  if (g.separated === false) return missingProbe(g.note);
  // 窓口がまだ無い＝まだ流れていない（⑧は決まりと窓口を同じ1回で作る）
  if (g.windowReady === false) return missingProbe(g.note);
  if (g.windowReady === true) return { ok: true };
  return { ok: false, code: null, message: g.note };
}

/**
 * ⑩も「棚があるか」ではなく、**よその店の立替が公開の鍵から隠れたか**を見る（⑧と同じ逆の読み方）。
 *
 * ■ ここが大事（やさしい説明）
 *   流したあとも、**手羽屋の51行（印が空）は公開の鍵で読めます**。それが正しい形です。
 *   見るのは「印が付いた行が見えるか」と「その棚の倉庫の窓口があるか」の2つだけで、
 *   数え方は lib/keiri/shelfScope.ts の1か所（/api/keiri/copies と同じ）を通します。
 */
async function probeAdvancesOldScoped(): Promise<ShelfProbe> {
  const plan = PENDING_SHELVES.find((p) => p.table === "advance_expenses");
  if (!plan) return { ok: false, code: null, message: "締める棚の一覧に立替（経営）がありません" };
  const r = await probeShelfScopes([plan]);
  const one = r.shelves[0];
  if (!one) return { ok: false, code: null, message: "確かめられませんでした" };
  if (one.scoped === true) return { ok: true };
  if (one.scoped === false) return missingProbe(one.note);
  return { ok: false, code: null, message: one.note };
}

/** 貼り紙の①〜⑩を、ぜんぶ読んで並べる */
export async function readShelfReports(): Promise<ShelfReport[]> {
  const [
    cash,
    ignores,
    receiptFlag,
    advanceTenant,
    shiftsTenant,
    trialShop,
    backupLocked,
    tenantReadGuard,
    paymentsTenant,
    advancesOldScoped,
  ] = await Promise.all([
    probeShelf("keiri_cash_events", "id"),
    probeShelf("keiri_expense_ignores", "id"),
    probeShelf("keiri_reports", "receipt_count"),
    probeShelf("advance_expenses", "tenant_id"),
    probeShelf("shifts", "tenant_id"),
    probeTrialShop(),
    probeBackupLocked(),
    probeTenantReadGuard_(),
    probeShelf("keiri_payments", "tenant_id"),
    probeAdvancesOldScoped(),
  ]);

  const probes: Record<string, ShelfProbe> = {
    cash_events: cash,
    expense_ignores: ignores,
    receipt_flag: receiptFlag,
    advance_tenant: advanceTenant,
    shifts_tenant: shiftsTenant,
    trial_shop: trialShop,
    backup_locked: backupLocked,
    tenant_read_guard: tenantReadGuard,
    payments_tenant: paymentsTenant,
    advances_old_scoped: advancesOldScoped,
  };

  return SHELF_STEPS.map((s) =>
    describeShelf(
      { step: s.step, name: s.name, benefit: s.benefit, check: s.check },
      probes[s.key] ?? { ok: false, message: "確かめていません" },
    ),
  );
}

export type CashCountProbe = {
  /** 記録を置く棚（貼り紙①）がまだ無いか */
  shelfMissing: boolean;
  /** 手羽屋ぶんの「数えた記録」が1行でもあるか */
  counted: boolean;
  /** 棚ではなく、経理の設定のおまけ欄に控えてあるか（2026-10-13・f1-4） */
  countedInMemo: boolean;
  /** 読めなかった（通信の失敗など） */
  unreadable: boolean;
};

/**
 * 棚がまだ無いあいだ、経理の設定のおまけ欄に控えた「数えた1回」があるかだけを見る。
 * ★金額も日付も返しません（あるか／無いかだけ）。
 */
async function probeCashCountMemo(db: ReturnType<typeof serverClient>): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("keiri_settings")
      .select("memo")
      .eq("business_type_code", "tebaya")
      .maybeSingle();
    if (error) return false;
    return decodeCashCountMemo((data as any)?.memo).length > 0;
  } catch {
    return false;
  }
}

/**
 * 「金庫を数えた記録」が手羽屋ぶんに1行でもあるかだけを見る。
 * ★件数すら返しません（あるか／無いかだけ）。金額は読みません。
 */
export async function probeCashCount(): Promise<CashCountProbe> {
  try {
    const db = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
    const { data, error } = await db
      .from("keiri_cash_events")
      .select("id")
      .eq("kind", "count")
      .is("tenant_id", null)
      .limit(1);
    if (!error) {
      const onShelf = (data?.length ?? 0) > 0;
      // ★棚があっても、控えだけが残っていることがある（棚ができた直後）。
      //   どちらかに1回でもあれば「数えた記録がある」とする。
      const inMemo = onShelf ? false : await probeCashCountMemo(db);
      return {
        shelfMissing: false,
        counted: onShelf || inMemo,
        countedInMemo: inMemo,
        unreadable: false,
      };
    }
    // 棚そのものが無いのは「失敗」ではなく「まだ流していない」
    if (isMissingTable(error.code, error.message)) {
      // ★棚が無くても、おまけ欄に控えがあれば「数えた記録がある」（2026-10-13・f1-4）
      const inMemo = await probeCashCountMemo(db);
      return {
        shelfMissing: true,
        counted: inMemo,
        countedInMemo: inMemo,
        unreadable: false,
      };
    }
    return { shelfMissing: false, counted: false, countedInMemo: false, unreadable: true };
  } catch {
    return { shelfMissing: false, counted: false, countedInMemo: false, unreadable: true };
  }
}

/** 棚（表）そのものが無いときの返事かどうか */
function isMissingTable(code?: string | null, message?: string | null): boolean {
  const c = String(code ?? "");
  if (c === "42P01" || c === "PGRST205" || c === "42703") return true;
  const m = String(message ?? "");
  return /does not exist|could not find the table|schema cache/i.test(m);
}
