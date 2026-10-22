/**
 * 日当（1日いくら払うか）の**決まりだけ**を置いたファイル（2026-10-22・f3-4）。
 *
 * ■ なぜ倉庫を読むファイルと分けたか
 *   lib/staffWage.ts は倉庫（スタッフマスタ）を読むので、決まりだけを確かめたくても
 *   倉庫との接続が要ってしまい、テストで固定できませんでした。
 *   場代（lib/boothFee.ts と lib/boothFeeMaster.ts）と同じ形に分けてあります。
 *   画面から使うときは、これまでどおり lib/staffWage.ts を読んでください
 *   （同じ関数をそのまま配っています）。
 *
 * ■ 決まり（CLAUDE.md 4-3「日当はスタッフマスタが正」）
 *   ① そのお店のスタッフマスタに日当があれば、それを使う
 *   ② 無ければ **手羽屋のときだけ** コードの中の表（保険）を使う
 *   ③ よそのお店では **金額を作らない**（0 のまま返し、画面が断りを出す）
 */

import {
  DEFAULT_DAILY_PAY,
  laborFor as fallbackLaborFor,
} from "./formState";
import {
  TEBAYA_SCOPE,
  normalizeTenantScope,
  type TenantScope,
} from "@/lib/tenantScope";

/** スタッフ名 → 日当（円）。マスタに日当が入っている人だけが入る */
export type StaffWageMap = Map<string, number>;

export type LaborSource = "master" | "tebaya-fallback" | "none";

/** 日当を1人ぶん決めた結果 */
export type LaborResolution = {
  /** 使う金額（円）。分からないときは 0 */
  amount: number;
  /** その金額に根拠があるか（false＝分からない） */
  known: boolean;
  /** どこから出た金額か */
  source: LaborSource;
};

/**
 * その人の日当を決める。
 *
 * ① そのお店のスタッフマスタに日当があればそれを使う（＝管理画面で変えられる）
 * ② 無ければ **手羽屋のときだけ** コードの表（保険）を使う
 * ③ よそのお店（経理パッケージを申し込んだお店）では **何も作らない**
 *
 * ★③がいちばん大事（2026-10-22・f3-4）
 *   コードの中の表には**手羽屋の日当**が書いてあります
 *   （イデ ¥9,000・じゅん ¥10,000 …／名前が無い人は ¥10,000）。
 *   これをよそのお店にも使うと、そのお店の日報の人件費・利益・現金に
 *   **手羽屋の金額が、そのお店が1円も入れていないのに入ります**。
 *   出どころの無い金額を帳簿に作らないこと（CLAUDE.md 4-3「日当はスタッフマスタが正」）。
 *   分からないときは 0 のまま返し、画面が「マスタに入っていません」と言います。
 *
 * isOther＝選択肢に無い「その他」の人。手羽屋の保険の表では ¥8,500 扱い。
 */
export function resolveLaborDetail(
  wages: StaffWageMap,
  staff: string,
  isOther = false,
  scope: TenantScope = TEBAYA_SCOPE,
): LaborResolution {
  const fromMaster = wages.get(staff);
  if (typeof fromMaster === "number" && fromMaster > 0) {
    return { amount: fromMaster, known: true, source: "master" };
  }
  // ★手羽屋（印が空）のときだけ、今までどおりコードの表を使う
  if (!normalizeTenantScope(scope)) {
    return {
      amount: fallbackLaborFor(staff, isOther),
      known: true,
      source: "tebaya-fallback",
    };
  }
  return { amount: 0, known: false, source: "none" };
}

/**
 * その人の日当（金額だけ）。
 * scope を渡さないときは手羽屋として扱う＝**今までと同じ答え**。
 */
export function resolveLabor(
  wages: StaffWageMap,
  staff: string,
  isOther = false,
  scope: TenantScope = TEBAYA_SCOPE,
): number {
  return resolveLaborDetail(wages, staff, isOther, scope).amount;
}

/**
 * 日当を返す関数を作る。画面側は `const laborFor = makeLaborFor(wages, scope)` として
 * これまでと同じ書き方で使える（scope を渡さなければ手羽屋＝今までどおり）。
 */
export function makeLaborFor(wages: StaffWageMap, scope: TenantScope = TEBAYA_SCOPE) {
  return (staff: string, isOther = false) =>
    resolveLabor(wages, staff, isOther, scope);
}

/**
 * その金額に根拠があるか（画面に「マスタに入っていません」と出すかどうか）。
 * 手羽屋では必ず true（保険の表があるので、今までどおり金額が決まる）。
 */
export function laborKnown(
  wages: StaffWageMap,
  staff: string,
  isOther = false,
  scope: TenantScope = TEBAYA_SCOPE,
): boolean {
  return resolveLaborDetail(wages, staff, isOther, scope).known;
}

/**
 * 日報に保存する日当を決める、ただ1か所（2026-10-22・f3-4）。
 *
 * ・手羽屋 … 空のときは今までどおり ¥10,000（lib/formState.ts の既定）で保存する
 * ・よそのお店 … 空のときは **0 のまま**。手羽屋の金額を勝手に入れない
 */
export function laborToSave(
  labor: number | null | undefined,
  scope: TenantScope = TEBAYA_SCOPE,
): number {
  const n = Number(labor);
  const entered = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (entered > 0) return entered;
  return normalizeTenantScope(scope) ? 0 : DEFAULT_DAILY_PAY;
}
