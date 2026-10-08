/**
 * 出店予定（シフト）を「どのお店のものか」で分けるための、ただ1か所の道具。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   お店を分ける印（tenant_id）は、日報・出店場所・担当者・商品・立替の棚には
 *   もう足してあり、読む所もすべて絞ってあります。
 *   **残っていた最後の穴が、出店予定（shifts）の棚です。**
 *   この棚には印の欄そのものが無かったので、絞りようが無く、
 *   いまは「よそのお店にはこの画面を開かない」という門で止めています
 *   （→ app/components/TebayaOnlyGate.tsx）。
 *
 *   欄は SQL で1列 足せます（/keiri/sql の貼り紙⑤）。
 *   ただし「SQL を流してから、もう一度アプリを出し直す」という順番の縛りを作ると、
 *   **流したのに使えない**（出し直すまで印が付かない）状態がしばらく続きます。
 *   その間に入った出店予定には印が付かないので、あとから手で直すことになります。
 *
 * ■ そこでこのファイルがやること
 *   **欄があるかどうかを、アプリが自分で見て決めます。**
 *     ・欄がまだ無い … 今までどおり。絞らない／印も付けない（手羽屋はそのまま使える）
 *     ・欄がある     … 「印が空のものだけ」で絞り、保存するときに印を付ける
 *   ＝ SQL を流す前でも後でも壊れません。**アプリを出し直す必要もありません。**
 *   これは立替の棚で先にうまくいった形（lib/keiri/advanceScope.ts）と同じ考え方です。
 *
 * ■ 手羽屋への影響：ありません
 *   手羽屋は印が空（null）のお店です。
 *   欄が無ければ今までどおり全部読み、欄があれば「印が空のものだけ」を読みます。
 *   **いまある出店予定はすべて印が空**なので、どちらでも見えるものは同じです。
 *   保存するときに付く印も空（null）＝列の既定値と同じなので、中身も変わりません。
 *
 * ■ まだ残っていること（この道具を入れても門は外しません）
 *   /shifts の画面には「出店先 問い合わせ」（venue_inquiries）も同居しており、
 *   そちらの棚にはまだ印の欄がありません。
 *   サーバー側の出店予定の窓口（/api/shifts/publish・copy-from-last-month・
 *   shift-generator/commit）も、まだ呼び出した人のお店を見ていません。
 *   **門（TebayaOnlyGate）はそこが済むまで掛けたままにします。**
 */

import {
  TENANT_COLUMN,
  normalizeTenantScope,
  type ScopableQuery,
  type TenantScope,
} from "./tenantScope";
import { isMissingTenantColumn } from "./keiri/advanceScope";

/** 欄を足す貼り紙の置き場所（言葉の中で1か所だけに書く） */
export const SHIFTS_TENANT_MIGRATION =
  "supabase/migrations/keiri_shelves_20261005.sql";

/** 倉庫の返事を何秒まで待つか。待ちすぎて画面が固まったように見えるのを防ぐ */
export const SHIFTS_PROBE_TIMEOUT_MS = 4000;

/**
 * 「出店予定の棚に、お店を分ける印の欄があるか」の答え。
 *   ready   … ある（分けられる）
 *   missing … まだ無い（今までどおり）
 *   unknown … 確かめられなかった（＝今までどおりに倒す。守りは緩めない）
 */
export type ShiftsTenantState = "ready" | "missing" | "unknown";

/** 倉庫に1行 読んでみた結果（通信はこのファイルではしない） */
export type ColumnProbe = {
  error?: { message?: string | null; code?: string | null } | null;
};

/** 読んでみた結果を、3つの答えのどれかに直すだけ（純粋な計算） */
export function shiftsTenantStateOf(probe: ColumnProbe | null | undefined): ShiftsTenantState {
  if (!probe) return "unknown";
  const error = probe.error ?? null;
  if (!error) return "ready";
  if (isMissingTenantColumn(error)) return "missing";
  // 欄が無いこと以外の理由（通信できない・権限が無い）で ready にしてはいけない
  return "unknown";
}

/** 分けられる状態か（ready だけが true。分からないときは分けない＝今までどおり） */
export function canSeparateShifts(state: ShiftsTenantState): boolean {
  return state === "ready";
}

/**
 * 出店予定の問い合わせに「このお店のぶんだけ」を足す。
 *
 * ★欄がまだ無い（missing / unknown）ときは **何も足しません**。
 *   足すと「そんな欄はありません」と断られ、**手羽屋の毎日の画面が止まります**。
 */
export function scopeShiftsQuery<T>(
  query: ScopableQuery<T> & T,
  scope: TenantScope,
  state: ShiftsTenantState,
): T {
  if (!canSeparateShifts(state)) return query;
  const id = normalizeTenantScope(scope);
  return id ? query.eq(TENANT_COLUMN, id) : query.is(TENANT_COLUMN, null);
}

/**
 * 出店予定を保存するときに足す印。
 *
 * ★欄がまだ無いときは **1つも足しません**（今までとまったく同じ中身で保存されます）。
 * ★手羽屋のときは null（列の既定値と同じ）。
 */
export function shiftTenantStamp(
  scope: TenantScope,
  state: ShiftsTenantState,
): { tenant_id?: string | null } {
  if (!canSeparateShifts(state)) return {};
  return { tenant_id: normalizeTenantScope(scope) };
}

/** 保存する中身に印を足した物を返す（元の物は変えない） */
export function withShiftTenant<T extends object>(
  data: T,
  scope: TenantScope,
  state: ShiftsTenantState,
): T & { tenant_id?: string | null } {
  return { ...data, ...shiftTenantStamp(scope, state) };
}

/* ------------------------------------------------------------------ *
 *  欄があるかを1回だけ見に行く（答えは覚えておく）
 * ------------------------------------------------------------------ */

let cached: Promise<ShiftsTenantState> | null = null;

/** テストと、貼り紙を流した直後のために、覚えた答えを忘れる */
export function forgetShiftsTenantState(): void {
  cached = null;
}

/**
 * 欄があるかを見に行く。**1回 聞いたら覚えておく**（毎回は聞かない）。
 *
 * @param run 倉庫に1行 読んでみる関数（画面側が supabase を渡す）
 * @param timeoutMs これだけ待って返事が無ければ unknown にする
 *
 * ★返事が来ないときは unknown ＝「今までどおり」に倒します。
 *   電波の悪い所で、出店予定の保存が何十秒も止まるのを防ぐためです。
 * ★unknown は覚えません（次に開いたときにもう一度 聞きます）。
 */
export async function shiftsTenantState(
  run: () => Promise<ColumnProbe>,
  timeoutMs: number = SHIFTS_PROBE_TIMEOUT_MS,
): Promise<ShiftsTenantState> {
  if (cached) return cached;
  const attempt = (async (): Promise<ShiftsTenantState> => {
    const answer = (async () => {
      try {
        return shiftsTenantStateOf(await run());
      } catch {
        return "unknown" as ShiftsTenantState;
      }
    })();
    const timeout = new Promise<ShiftsTenantState>((resolve) =>
      setTimeout(() => resolve("unknown"), timeoutMs),
    );
    return Promise.race([answer, timeout]);
  })();
  cached = attempt;
  const state = await attempt;
  // 分からなかっただけのときは覚えない（次の機会にもう一度 確かめる）
  if (state === "unknown" && cached === attempt) cached = null;
  return state;
}

/* ------------------------------------------------------------------ *
 *  外から1回 開くだけで分かるようにする（言葉に直すだけ）
 * ------------------------------------------------------------------ */

export type ShiftsTenantColumnReport = {
  /** よそのお店の出店予定を、混ぜずに扱えるか */
  usable: boolean;
  /** 欄の有無を確かめられたか（false＝分からなかっただけ） */
  known: boolean;
  note: string;
};

/** 調べた結果を、人が読める1文に直す（通信はしない） */
export function describeShiftsTenantColumn(
  probe: ColumnProbe | null | undefined,
): ShiftsTenantColumnReport {
  const state = shiftsTenantStateOf(probe);
  if (state === "ready") {
    return {
      usable: true,
      known: true,
      note: "欄はできています。出店予定はお店ごとに分けて読み書きします（手羽屋は印が空のままなので、見えるものは今までどおりです）。※ /shifts の画面そのものは、同居している「出店先 問い合わせ」の棚に印が付くまで、よそのお店には開きません",
    };
  }
  if (state === "missing") {
    return {
      usable: false,
      known: true,
      note: `まだ欄がありません。/keiri/sql の貼り紙（${SHIFTS_TENANT_MIGRATION} の⑤）を1回 流すと、その瞬間から分けて読み書きします（アプリを出し直す必要はありません。いまある行は1行も書き換わりません）`,
    };
  }
  return {
    usable: false,
    known: false,
    note: "確かめられませんでした（欄が無いのか、読みに行けなかったのかが分かりません）。分からないあいだは、これまでどおり絞らずに動かします",
  };
}
