/**
 * 出店先ランク（S〜D）の「決め方」を、ここ1か所にまとめたファイル。
 *
 * ■ なぜ作ったか
 *   ランクが2種類あって、画面によって違う値が出ていた。
 *     ① 出店場所マスタ（locations.rank）… 手で決めた等級。目標額の元になっている
 *     ② 売上分析のバッジ               … 平均売上から画面が勝手に出していた評価
 *   同じ画面に「目標 ¥30,000（D）」と「B」が並んで、どっちが本当か分からなかった。
 *
 * ■ これからのルール
 *   **ランクは1本だけ。直近の実績から自動で判定して、マスタ（locations.rank /
 *   locations.target）を自動で書き換える。** 画面はマスタの値をそのまま出す。
 *
 * ■ 判定のしかた（小学生にも分かる言い方で）
 *   1. その出店先の「直近8回ぶん」の売上を見る（同じ日に日報が2枚あれば足す。
 *      手羽屋ともも屋が同じ日に同じ場所へ出ることがあるため）
 *   2. 8回ぶん集まらなくても、3回以上あれば判定する。2回以下なら判定しない
 *   3. その平均が、各ランクの目標額の9割以上なら「そのランクに届いている」と考える
 *   4. 上（S）から順に見て、最初に届いたランクを採用する。どれも届かなければ D
 *
 * ■ 数字を変えたくなったら、このファイルの上の方にある定数だけ直す。
 *   `tests/locationRank.test.ts` で固定してあるので、`npm test` が通るか必ず確認する。
 */

import { canonicalLocationName } from "@/lib/locationName";

/** ランクの種類。上（強い）から順に並べる */
export const RANK_ORDER = ["S", "A", "B", "C", "D"] as const;

export type RankCode = (typeof RANK_ORDER)[number];

/**
 * ランクごとの「1回の出店でここまで売りたい」目標額（円）。
 *
 * ★ここが目標額の唯一の置き場所。画面やDBに同じ数字を書き写さないこと。
 *   A/B/C/D は、もともと管理者ページ（出店場所マスタ）に書かれていた値と同じ。
 *   S だけは今までどこにも定義が無かったので 80,000 円を仮置きしている。
 */
export const RANK_TARGET: Record<RankCode, number> = {
  S: 80000,
  A: 60000,
  B: 50000,
  C: 40000,
  D: 30000,
};

/** 判定に使う「直近◯回」 */
export const RECENT_VISITS = 8;

/** これ未満の回数しか無ければ判定しない（今のランクのまま） */
export const MIN_VISITS_FOR_JUDGE = 3;

/** 目標額の何割に届いていればそのランクとみなすか（0.9＝9割） */
export const ACHIEVE_RATIO = 0.9;

/** 一番下のランク（どこにも届かなかったときの行き先） */
export const LOWEST_RANK: RankCode = RANK_ORDER[RANK_ORDER.length - 1];

/** 文字列が S〜D のどれかか */
export function isRankCode(v: string | null | undefined): v is RankCode {
  return !!v && (RANK_ORDER as readonly string[]).includes(v);
}

/** 日報1件ぶんの、判定に必要な最低限の中身 */
export type RankReport = {
  date: string;
  sales_amount: number | null;
};

/** 1日ぶんに合算した売上 */
export type DailySale = {
  date: string;
  sales: number;
};

/**
 * 日報を「1日1件」に合算して、新しい日が先になるよう並べる。
 * 同じ日に日報が2枚（手羽屋・もも屋）あれば足して1回ぶんとして数える。
 */
export function toDailySales(reports: RankReport[]): DailySale[] {
  const byDate = new Map<string, number>();
  for (const r of reports) {
    const date = (r.date || "").trim();
    if (!date) continue;
    byDate.set(date, (byDate.get(date) || 0) + (r.sales_amount || 0));
  }
  return [...byDate.entries()]
    .map(([date, sales]) => ({ date, sales }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 直近 n 回の平均売上と回数（1円未満は四捨五入） */
export function recentAverage(
  daily: DailySale[],
  n: number = RECENT_VISITS,
): { average: number; count: number } {
  const recent = daily.slice(0, n);
  if (recent.length === 0) return { average: 0, count: 0 };
  const sum = recent.reduce((s, d) => s + d.sales, 0);
  return { average: Math.round(sum / recent.length), count: recent.length };
}

/** 平均売上から、目標額の9割に届く一番上のランクを選ぶ */
export function rankFromAverage(average: number): RankCode {
  for (const code of RANK_ORDER) {
    if (average >= RANK_TARGET[code] * ACHIEVE_RATIO) return code;
  }
  return LOWEST_RANK;
}

/** 判定の結果 */
export type RankJudgement = {
  rank: RankCode;
  /** 直近8回の平均売上（円） */
  average: number;
  /** 判定に使った回数（3〜8） */
  sampleCount: number;
};

/**
 * 日報から、その出店先のランクを判定する。
 * 直近8回のうち3回未満しか無ければ null（＝判定しない＝今のランクのまま）。
 */
export function judgeRank(reports: RankReport[]): RankJudgement | null {
  const daily = toDailySales(reports);
  const { average, count } = recentAverage(daily);
  if (count < MIN_VISITS_FOR_JUDGE) return null;
  return { rank: rankFromAverage(average), average, sampleCount: count };
}

/**
 * 「次のランクまで あと ¥◯◯」を出す。
 * 一番上（S）のときは次が無いので null。
 */
export function nextRankInfo(
  rank: RankCode,
  average: number,
): { nextRank: RankCode; needed: number } | null {
  const idx = RANK_ORDER.indexOf(rank);
  if (idx <= 0) return null; // S は次が無い
  const nextRank = RANK_ORDER[idx - 1];
  const line = RANK_TARGET[nextRank] * ACHIEVE_RATIO;
  return { nextRank, needed: Math.max(0, Math.ceil(line - average)) };
}

// -----------------------------------------------------------------------------
// 出店場所マスタを「こう変えます」という予定を組み立てるところ
// （データベースには触らない純粋な計算。実際の書き換えは lib/locationRankUpdate.ts）
// -----------------------------------------------------------------------------

/** 出店場所マスタの1行（ランク判定に必要なぶんだけ） */
export type RankLocationRow = {
  id: number;
  name: string;
  rank: string | null;
  target: number | null;
  is_active: boolean;
  rank_locked: boolean | null;
};

/** 「こう変えます」の予定1件 */
export type RankPlan = {
  locationId: number;
  /** マスタの場所名 */
  name: string;
  /** いまのランク（マスタ） */
  currentRank: string | null;
  /** いまの目標額（マスタ） */
  currentTarget: number | null;
  /** 新しいランク（判定できなかったときは null） */
  newRank: RankCode | null;
  /** 新しい目標額（判定できなかったときは null） */
  newTarget: number | null;
  /** 直近8回の平均売上（円）。判定できなかったときは今ある回数の平均 */
  average: number;
  /** 判定に使った回数 */
  sampleCount: number;
  /** マスタを書き換える必要があるか */
  changed: boolean;
  /** 変えない場合の理由（人に見せる用） */
  skipReason: "locked" | "notEnoughData" | "noChange" | null;
};

/** 日報から、その場所ぶんだけ取り出す（名寄せして突き合わせる） */
export function reportsForLocation(
  reports: (RankReport & { location: string | null })[],
  locationName: string,
): RankReport[] {
  const key = canonicalLocationName(locationName);
  if (!key) return [];
  return reports.filter((r) => canonicalLocationName(r.location) === key);
}

/**
 * マスタ＋日報から「こう変えます」の一覧を作る純関数（DBに触らない）。
 * 画面のプレビューにも、実際の書き換えにも同じものを使う。
 */
export function buildRankPlans(
  locations: RankLocationRow[],
  reports: (RankReport & { location: string | null })[],
): RankPlan[] {
  const plans: RankPlan[] = [];
  for (const loc of locations) {
    if (!loc.is_active) continue;

    const mine = reportsForLocation(reports, loc.name);
    const judged = judgeRank(mine);

    // 判定できなかったときの参考表示用（今ある回数ぶんの平均）
    const fallbackCount = Math.min(
      RECENT_VISITS,
      new Set(mine.map((r) => r.date)).size,
    );
    const average = judged?.average ?? 0;
    const sampleCount = judged?.sampleCount ?? fallbackCount;

    if (loc.rank_locked) {
      plans.push({
        locationId: loc.id,
        name: loc.name,
        currentRank: loc.rank,
        currentTarget: loc.target,
        newRank: null,
        newTarget: null,
        average,
        sampleCount,
        changed: false,
        skipReason: "locked",
      });
      continue;
    }

    if (!judged) {
      plans.push({
        locationId: loc.id,
        name: loc.name,
        currentRank: loc.rank,
        currentTarget: loc.target,
        newRank: null,
        newTarget: null,
        average,
        sampleCount,
        changed: false,
        skipReason: "notEnoughData",
      });
      continue;
    }

    const newTarget = RANK_TARGET[judged.rank];
    const changed = loc.rank !== judged.rank || (loc.target ?? 0) !== newTarget;
    plans.push({
      locationId: loc.id,
      name: loc.name,
      currentRank: loc.rank,
      currentTarget: loc.target,
      newRank: judged.rank,
      newTarget,
      average: judged.average,
      sampleCount: judged.sampleCount,
      changed,
      skipReason: changed ? null : "noChange",
    });
  }
  return plans;
}
