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

import { serverClient, serviceClientOrNull } from "@/lib/supabaseServer";
import {
  describeShelf,
  missingProbe,
  SHELF_STEPS,
  type ShelfProbe,
  type ShelfReport,
} from "@/lib/keiri/shelves";
import { peekTestShop } from "@/lib/keiri/tenantTrialServer";

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

/** 貼り紙の①〜⑥を、ぜんぶ読んで並べる */
export async function readShelfReports(): Promise<ShelfReport[]> {
  const [cash, ignores, receiptFlag, advanceTenant, shiftsTenant, trialShop] =
    await Promise.all([
      probeShelf("keiri_cash_events", "id"),
      probeShelf("keiri_expense_ignores", "id"),
      probeShelf("keiri_reports", "receipt_count"),
      probeShelf("advance_expenses", "tenant_id"),
      probeShelf("shifts", "tenant_id"),
      probeTrialShop(),
    ]);

  const probes: Record<string, ShelfProbe> = {
    cash_events: cash,
    expense_ignores: ignores,
    receipt_flag: receiptFlag,
    advance_tenant: advanceTenant,
    shifts_tenant: shiftsTenant,
    trial_shop: trialShop,
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
  /** 読めなかった（通信の失敗など） */
  unreadable: boolean;
};

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
      return { shelfMissing: false, counted: (data?.length ?? 0) > 0, unreadable: false };
    }
    // 棚そのものが無いのは「失敗」ではなく「まだ流していない」
    if (isMissingTable(error.code, error.message)) {
      return { shelfMissing: true, counted: false, unreadable: false };
    }
    return { shelfMissing: false, counted: false, unreadable: true };
  } catch {
    return { shelfMissing: false, counted: false, unreadable: true };
  }
}

/** 棚（表）そのものが無いときの返事かどうか */
function isMissingTable(code?: string | null, message?: string | null): boolean {
  const c = String(code ?? "");
  if (c === "42P01" || c === "PGRST205" || c === "42703") return true;
  const m = String(message ?? "");
  return /does not exist|could not find the table|schema cache/i.test(m);
}
