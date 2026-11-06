/**
 * 「倉庫（データのしまい場所）が、いま本当に読めているか」を**先に1回だけ**確かめる所。
 *
 * ■ なぜ要るのか（2026-11-06・f3-3／f3-4）
 *   合否を外から測る窓口は、**よその店として読んで0件だったこと**を手がかりにしています。
 *   ところが倉庫に届かないとき、読み方によっては
 *   **エラーにならずに「0件」**が返ってきます（前の答えを読む道具がためている、など）。
 *   そのまま判定すると「よその店の行が1件も出ませんでした＝合格」と読めてしまいます。
 *   ＝ **止まっているのに合格**。これがいちばん危ない形です。
 *
 *   2026-11-06 の朝、本番で実際に起きていました（版 62aa24b・同じ1分の中で）：
 *     ・/api/keiri/selfcheck … 10秒待っても読めない（手羽屋の棚）
 *     ・/api/keiri/shelves  … 「TypeError: fetch failed」が9件
 *     ・/api/keiri/firstmonth … **0.37秒で「読めました・0件」＝ok:true**
 *   最後のひとつだけが「合格」と答えていました。
 *
 * ■ どうするか（対照をとる）
 *   よその店が0件であることだけでは、何も証明できません。
 *   **同じつなぎ方で、手羽屋の行が1件以上あることを先に見せる**ことにします。
 *     ・1件以上 見えた … 倉庫は生きている（alive）。そのあとの0件は意味がある
 *     ・読めなかった   … 測れない（unreachable）。**合格にも不合格にもしない**
 *     ・読めたが0件    … 測れない（empty）。手羽屋の行は必ずあるはずなので、
 *                        0件は「つながっていない」か「中身が変わった」のどちらか
 *
 * ■ 守っていること
 *   ・**読むだけ**。1行も書き込みません
 *   ・**行の中身は1文字も持ち出しません**（数えるだけ・head で本文を受け取りません）
 *   ・金額・お店の名前・連絡先・鍵の値は返しません
 *   ・手羽屋が毎日使う画面（日報・シフト・レジ・LINE）からは呼ばれません（経理の窓口だけ）
 *   ・待つのをやめる線を必ず引きます（倉庫に届かない日に窓口が1分 白くならないため）
 */

import { raceWithDeadline } from "@/lib/keiri/readBudget";
import { TENANT_COLUMN } from "@/lib/tenantScope";

/** 対照に使う棚（手羽屋の日報。印が空の行が必ずある） */
export const ALIVE_PROBE_TABLE = "keiri_reports";

/** ここまでで諦める線（ミリ秒）。ふだんは1秒かからない */
export const ALIVE_PROBE_BUDGET_MS = 4_000;

export type WarehouseAliveState =
  /** 手羽屋の行が1件以上 見えた＝倉庫は生きている */
  | "alive"
  /** 倉庫に届かなかった・断られた＝**測れない** */
  | "unreachable"
  /** 読めたのに0件＝**測れない**（手羽屋の行は必ずあるはずなので） */
  | "empty";

export type WarehouseAlive = {
  /** そのまま判定に使ってよいか。false なら「測れません」と答えること */
  alive: boolean;
  state: WarehouseAliveState;
  /** 人が読む一言（鍵・金額・お店の名前は入れない） */
  reason: string;
};

/** 数えるだけの問い合わせの、ここで使う形だけ（テストでは偽物を渡す） */
export type AliveProbeClient = {
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => {
      is: (
        column: string,
        value: null,
      ) => PromiseLike<{ count?: number | null; error?: unknown }>;
    };
  };
};

/** 倉庫の返事から「生きているか」を決める（計算だけ。テストで固定する） */
export function aliveStateOf(page: {
  count?: number | null;
  error?: unknown;
}): WarehouseAlive {
  if (page.error) {
    return {
      alive: false,
      state: "unreachable",
      reason: "倉庫から返事がありませんでした",
    };
  }
  const count = typeof page.count === "number" && Number.isFinite(page.count) ? page.count : null;
  if (count === null) {
    return {
      alive: false,
      state: "unreachable",
      reason: "倉庫が件数を答えませんでした",
    };
  }
  if (count <= 0) {
    return {
      alive: false,
      state: "empty",
      reason:
        "倉庫は答えましたが、手羽屋の行が1件も見えませんでした" +
        "（必ずあるはずの行なので、つながっていないと見ます）",
    };
  }
  return {
    alive: true,
    state: "alive",
    reason: "手羽屋の行が見えました（倉庫は読めています）",
  };
}

/** 線に当たったときの形 */
export const ALIVE_PROBE_TIMED_OUT: WarehouseAlive = {
  alive: false,
  state: "unreachable",
  reason: "倉庫からの返事が時間内に来ませんでした",
};

/**
 * 倉庫が生きているかを1回だけ確かめる。**読むだけ・件数だけ。**
 *
 * @param db   倉庫につなぐもの（窓口と**同じつなぎ方**を渡すこと。別の鍵・別の道で
 *             確かめると「あちらは読めるがこちらは読めない」を見逃します）
 */
export async function probeWarehouseAlive(
  db: AliveProbeClient,
  opts?: { budgetMs?: number },
): Promise<WarehouseAlive> {
  const budgetMs = opts?.budgetMs ?? ALIVE_PROBE_BUDGET_MS;
  const work = (async (): Promise<WarehouseAlive> => {
    try {
      const page = await db
        .from(ALIVE_PROBE_TABLE)
        // ★head: true ＝ 本文を受け取らない（行の中身は1文字も持ち出さない）
        .select("id", { count: "exact", head: true })
        .is(TENANT_COLUMN, null);
      return aliveStateOf(page ?? {});
    } catch {
      return {
        alive: false,
        state: "unreachable",
        reason: "倉庫につなげませんでした",
      };
    }
  })();
  const got = await raceWithDeadline(work, budgetMs, () => ALIVE_PROBE_TIMED_OUT);
  return got.value;
}
