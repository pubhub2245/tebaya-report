/**
 * 「金庫を数えた結果が、計算上の現金と合っていたか」を**外から1回で**読める形にする
 * （2026-10-13・kp245・f1-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   f1-4（計算上の現金と、実際の金庫が合うか）は、じゅんが金庫を数えて金額を
 *   入れたときに画面で分かります。ところが じゅんの経理の画面は合言葉の内側なので、
 *   こちら（Claude）からは開けません。＝ **入れてもらっても、合っていたかを
 *   こちら側で確かめられず、合否を付けられませんでした。**
 *
 *   そこで「合っていたか」だけを、**金額を1円も出さずに**外へ出します。
 *   これで じゅんの1分（金庫を数える）が終わった時点で、f1-4 の合否が決まります。
 *
 * ■ 外に出さないもの（ここが大事）
 *   金額は1円も返しません（計算上の現金・数えた金額・差のどれも）。
 *   返すのは「合っていたか」「差が1,000円より小さいか」「どの数え方に合ったか」
 *   「数えた日」だけです。合言葉・鍵・お店の名前は1文字も返しません。
 */

import { NEAR_ENOUGH_YEN, type CashReconcile } from "./cashCheck";
import { CASH_VARIANT_LABEL, type CashVariantPick } from "./cashVariant";

/** 数えた記録がどこにあるか */
export type CashCountPlace =
  /** 置き場（keiri_cash_events）に残っている */
  | "棚"
  /** 置き場がまだ無いので、経理の設定のおまけ欄に控えてある */
  | "控え";

/** 合っていたかの言い方 */
export type CashCountVerdict =
  | "まだ数えていません"
  | "ぴったり合っている"
  | "ほぼ合っている"
  | "数え方のちがいで説明がつく"
  | "合っていない";

/** 差の帯（金額そのものは出さない） */
export type CashCountBand = "0円" | "1,000円より小さい" | "1,000円以上";

export type CashCountWindow = {
  /** 数えた記録が1件でもあるか */
  counted: boolean;
  place: CashCountPlace | null;
  /** 数えた日（金額は返さない） */
  countedOn: string | null;
  /** 最後に数えてから何日たったか */
  daysSince: number | null;
  verdict: CashCountVerdict;
  band: CashCountBand | null;
  /** 2通りの数え方のうち、合ったほうの名前（分かれていない月は null） */
  matchedVariant: string | null;
  /** 仕上げチェック表のどの項目か */
  check: "f1-4";
  /** いま何をすれば前に進むか（1行） */
  next: string;
  /** この窓口が何を返さないか */
  note: string;
};

const NOTE =
  "金額は1円も返しません（計算上の現金・数えた金額・差のどれも）。" +
  "返すのは『合っていたか』と『数えた日』だけです。1行も書き込みません。";

/** 差の帯を決める。金額は出さない */
function bandOf(diff: number): CashCountBand {
  if (diff === 0) return "0円";
  return Math.abs(diff) < NEAR_ENOUGH_YEN ? "1,000円より小さい" : "1,000円以上";
}

/**
 * 突き合わせの結果を、外に出してよい形に畳む。
 *
 * @param reconcile 画面と同じ関数（reconcileCash）の結果
 * @param pick      数え方が2通りに分かれている月だけ渡す（分かれていなければ null）
 * @param place     記録がどこにあるか（置き場／控え）
 */
export function buildCashCountWindow(params: {
  reconcile: CashReconcile;
  pick: CashVariantPick | null;
  place: CashCountPlace | null;
}): CashCountWindow {
  const { reconcile, pick, place } = params;

  if (reconcile.neverCounted || reconcile.counted === null) {
    return {
      counted: false,
      place: null,
      countedOn: null,
      daysSince: null,
      verdict: "まだ数えていません",
      band: null,
      matchedVariant: null,
      check: "f1-4",
      next:
        "/keiri の「🔐 金庫を数えて、合っているか見る」に、いま金庫にある現金を" +
        "1回 入れてください（1分）。入れた時点で、この窓口に合否が出ます",
      note: NOTE,
    };
  }

  // 計算上の現金が出せなかった（お店の設定が読めていない）
  if (reconcile.computed === null || reconcile.diff === null) {
    return {
      counted: true,
      place,
      countedOn: reconcile.countedOn,
      daysSince: reconcile.daysSince,
      verdict: "合っていない",
      band: null,
      matchedVariant: null,
      check: "f1-4",
      next: "計算上の現金が出せませんでした（お店の設定が読めていません）。設定の行を確かめます",
      note: NOTE,
    };
  }

  const band = bandOf(reconcile.diff);
  const matched = pick?.matched ?? null;

  // ★順番が大事：まず「ぴったり／ほぼ」を見る。そのあと「数え方のちがい」。
  //   数え方のちがいは、差が大きいのに説明がつく場合の言い方。
  const verdict: CashCountVerdict =
    reconcile.diff === 0
      ? "ぴったり合っている"
      : band === "1,000円より小さい"
        ? "ほぼ合っている"
        : matched
          ? "数え方のちがいで説明がつく"
          : "合っていない";

  const next =
    verdict === "合っていない"
      ? "差の理由は人が決めます（こちらで金額は直しません）。書き忘れた現金の支払い・" +
        "銀行に入れた分・レジに残したつり銭のどれかを確かめます"
      : "f1-4（計算上の現金と、実際の金庫が合うか）は、この結果で合格にできます";

  return {
    counted: true,
    place,
    countedOn: reconcile.countedOn,
    daysSince: reconcile.daysSince,
    verdict,
    band,
    matchedVariant: matched ? CASH_VARIANT_LABEL[matched.key] : null,
    check: "f1-4",
    next,
    note: NOTE,
  };
}

/**
 * 「じゅんが1分 数えたら、その結果でちゃんと合否が出るか」を**数える前に**答える所
 * （2026-10-16・kp245・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も出しません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   比べる相手（数え方）は、いまの作りでは**数えたあとに初めて組み立てられます**。
 *   ＝ じゅんが1分 使うまで、「金庫だけを数えたとき用の相手が並ぶのか」が
 *   こちら側から分かりませんでした。
 *   もし並ばないまま金庫だけを数えると、つり銭ぶん（号車ごとに数万円）だけ必ず食い違い、
 *   **合っているのに「書き忘れた支払いを探してください」と出ます**（registerFloat.ts の経緯）。
 *   1分 使ってもらったのに、無い探し物をさせることになります。
 *
 * ■ どうするか
 *   数える前の時点で相手を組み立て、**名前と数だけ**を外に出します。
 *   金額（計算上の現金・つり銭・差）は1円も出しません。
 *   これで「いま数えてもらえば合否が出る」ことを、頼む前に確かめられます。
 */
export type CashCountReady = {
  /** いま数えてもらえば、合否を出せるか */
  canCompare: boolean;
  /** 比べる相手の数（0なら比べられない） */
  ways: number;
  /** 比べる相手の名前（金額は出さない） */
  wayLabels: string[];
  /** 「金庫だけを数えたとき」の相手が並ぶか（つり銭を別に置いた相手） */
  safeOnlyIncluded: boolean;
  /** つり銭に使った日報の日付（金額ではない）。1件も無ければ null */
  registerFloatOn: string | null;
  /** 人が読む1行 */
  line: string;
};

/**
 * 数える前の用意ができているかを畳む。
 *
 * @param variants        いま数えたとして組み立てた相手（buildCashVariants の結果）
 * @param registerFloatOn つり銭に使った日報のいちばん新しい日（latestRegisterFloat の latestOn）
 */
export function buildCashCountReady(params: {
  variants: { key: string; label: string }[];
  registerFloatOn: string | null;
}): CashCountReady {
  const { variants, registerFloatOn } = params;
  const wayLabels = variants.map((v) => v.label);
  const safeOnlyIncluded = variants.some(
    (v) => v.key === "nowScreenSafeOnly" || v.key === "withEarlierRepaidSafeOnly",
  );
  const canCompare = variants.length > 0;

  const line = !canCompare
    ? "いま数えてもらっても、計算上の現金が出せないので合否が出ません（お店の設定が読めていません）"
    : safeOnlyIncluded
      ? `用意はできています。比べる相手が ${variants.length} 通り 並び、` +
        "「金庫だけを数えたとき」の相手も入っています（レジのつり銭を入れ忘れても、" +
        "そのぶんで食い違ったとは言いません）"
      : `用意はできています（比べる相手は ${variants.length} 通り）。` +
        "ただし**レジに残したつり銭の相手が並びません**" +
        "（閉店後のレジ金が日報から読めていません）。" +
        "金庫だけを数えると、つり銭ぶんだけ食い違って見えるおそれがあります";

  return { canCompare, ways: variants.length, wayLabels, safeOnlyIncluded, registerFloatOn, line };
}
