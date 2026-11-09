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

import { NEAR_ENOUGH_YEN, monthDay, type CashReconcile } from "./cashCheck";
import type { CashBooksGap } from "./cashBooksGap";
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
  /**
   * 合っていたか（2026-11-09・f1-4）。
   *
   * ★差の内わけの窓口（diffCoverage.howto）は「上の matched で見てください」と
   *   案内していますが、**その名前の欄をこの窓口は返していませんでした**。
   *   読む人は matchedVariant（合った数え方の**名前**）と取り違えるか、
   *   何も無いので「分かりません」側に落ちます。
   *   ＝ 案内どおりに読むと、**ぴったり合っている月でも合格にできません**
   *   （数え方が1通りの月は matchedVariant が null のままのため）。
   *   そこで案内と同じ名前で、合っていたかを true／false／null で返します。
   *   まだ数えていない日は null（合格にも不合格にもしない）。
   */
  matched: boolean | null;
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
      matched: null,
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
      matched: false,
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
    matched: verdict !== "合っていない",
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
  /**
   * 日報が今日の近くまで入っているか（2026-11-01・f1-4）。
   *
   * ★ここが false のときに数えると、**入っていない日の売上と経費のぶんだけ
   *   必ず食い違います**。差の理由は画面に名指しで出ますが、
   *   「合っている」とは言えない答えになります（1分がはっきりした結果になりません）。
   *   日報が1件も読めないときは、判断しないので true のままにします。
   */
  booksUpToDate: boolean;
  /** 日報のいちばん新しい日（金額ではない・無ければ null） */
  booksLastDate: string | null;
  /** そこから何日 空いているか（無ければ null） */
  booksGapDays: number | null;
  /** 比べる相手の数（0なら比べられない） */
  ways: number;
  /** 比べる相手の名前（金額は出さない） */
  wayLabels: string[];
  /** 「金庫だけを数えたとき」の相手が並ぶか（つり銭を別に置いた相手） */
  safeOnlyIncluded: boolean;
  /** つり銭に使った日報の日付（金額ではない）。1件も無ければ null */
  registerFloatOn: string | null;
  /**
   * 空いている日が「お休みだけ」と読めたか（2026-11-09・f1-4）。
   *
   * ★これが true なら、空きがあっても食い違いの元になりません
   *   ＝ いま数えてもらって大丈夫です。読めなかった日は false のままにします
   *   （「お休みでした」と言い切らない）。
   */
  gapIsHolidaysOnly: boolean;
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
  /** 日報がどこまで入っているか（渡さなければ、判断しない＝今までどおり） */
  booksGap?: CashBooksGap | null;
  /** 空いている日の正体（渡さなければ、今までどおり「営業した日があれば」と言う） */
  gapOpen?: { readable: boolean; openDays: number; holidaysOnly: boolean } | null;
}): CashCountReady {
  const { variants, registerFloatOn } = params;
  const booksGap = params.booksGap ?? null;
  const gapOpen = params.gapOpen ?? null;
  const wayLabels = variants.map((v) => v.label);
  const safeOnlyIncluded = variants.some(
    (v) => v.key === "nowScreenSafeOnly" || v.key === "withEarlierRepaidSafeOnly",
  );
  const canCompare = variants.length > 0;

  // ★日報が空いているかは、相手がそろっているかとは別の話（2026-11-01・f1-4）。
  //   相手は4通り そろっていても、日報が2週間 入っていなければ必ず食い違います。
  const booksUpToDate = !(booksGap?.wide ?? false);
  const holidaysOnly = gapOpen?.holidaysOnly ?? false;
  const booksLine = !booksUpToDate && booksGap?.lastDate
    ? // ★空きの正体が「お休みだけ」と読めた日は、無い探し物をさせない（2026-11-09）
      holidaysOnly
      ? `日報は ${monthDay(booksGap.lastDate)} までですが、` +
        `そこからの ${booksGap.days}日は**ぜんぶ出店の予定が無い日（お休み）**でした` +
        "＝この空きで食い違うことはありません。いま数えていただいて大丈夫です"
      : gapOpen?.readable
        ? `ただし**出店の予定があったのに日報が入っていない日が ${gapOpen.openDays}日 あります**` +
          `（日報は ${monthDay(booksGap.lastDate)} まで）。` +
          "そのぶんは必ず食い違います。**先にその日報を入れてから数えてください**" +
          "（いま数えても、差の理由は画面に名指しで出ます）"
        : `ただし**日報が ${monthDay(booksGap.lastDate)} までしか入っていません**` +
          `（そこから ${booksGap.days}日）。それ以降に営業した日があると、` +
          "そのぶんだけ必ず食い違います。先に日報を入れてから数えると、差の意味がはっきりします" +
          "（いま数えても、差の理由は画面に名指しで出ます）"
    : "";

  const base = !canCompare
    ? "いま数えてもらっても、計算上の現金が出せないので合否が出ません（お店の設定が読めていません）"
    : safeOnlyIncluded
      ? `用意はできています。比べる相手が ${variants.length} 通り 並び、` +
        "「金庫だけを数えたとき」の相手も入っています（レジのつり銭を入れ忘れても、" +
        "そのぶんで食い違ったとは言いません）"
      : `用意はできています（比べる相手は ${variants.length} 通り）。` +
        "ただし**レジに残したつり銭の相手が並びません**" +
        "（閉店後のレジ金が日報から読めていません）。" +
        "金庫だけを数えると、つり銭ぶんだけ食い違って見えるおそれがあります";

  const line = booksLine ? `${base}。${booksLine}` : base;

  return {
    canCompare,
    booksUpToDate,
    booksLastDate: booksGap?.lastDate ?? null,
    booksGapDays: booksGap?.days ?? null,
    ways: variants.length,
    wayLabels,
    safeOnlyIncluded,
    registerFloatOn,
    gapIsHolidaysOnly: holidaysOnly,
    line,
  };
}

/* ------------------------------------------------------------------ *
 *  倉庫が眠っている日に「合っていません」と読める形で返さない
 *  （2026-11-08・f1-4）
 * ------------------------------------------------------------------ */

/**
 * ■ なぜ要るか（11/8 に本番で実測した形）
 *   金庫（＝手元の現金）を突き合わせる窓口（/api/keiri/cashcount）は、
 *   倉庫（データのしまい場所）が眠っている日に **ok: false** を返していました。
 *   この窓口は f1-4「いまの現金残高が、実際の金庫の残高と合うか」を測る所なので、
 *   読んだ人には **「合っていません＝不合格」**と読めます。
 *   ところが日報を1枚も読めていないので、**合っているかどうかは分かりません**。
 *   ＝ **止まっているだけの日を不合格にする**形でした。
 *
 * ■ これからの答え方
 *   読めた日 … 今までと1文字も変わりません（ok: true ＋ 中身ぜんぶ）
 *   読めない日 … measurable: false・ok: **null**・
 *                「いまは測れませんでした。合格にも不合格にもしていません」
 *
 * ★この関数は計算だけです（倉庫に聞きません）。試験で固定してあります。
 */
export type CashCountNotMeasurable = {
  /** 合否。測れていない日は null（合格にも不合格にもしない） */
  ok: null;
  measurable: false;
  /** 止まった場所（人が読む一言。金額・鍵・お店の名前は入れない） */
  reason: string;
  summary: string;
};

export function cashCountNotMeasurable(reason: string): CashCountNotMeasurable {
  return {
    ok: null,
    measurable: false,
    reason,
    summary:
      `いまは測れませんでした（${reason}）。` +
      "合格にも不合格にもしていません（金庫と合っていないという意味ではありません）。" +
      "倉庫が読めるようになってから、もう一度 開いてください。",
  };
}

/* ------------------------------------------------------------------ *
 *  まだ数えていない日に「合っています」と読める形で返さない
 *  （2026-11-09・f1-4）
 * ------------------------------------------------------------------ */

/**
 * ■ なぜ要るか（2026-11-09 に本番で実測した形）
 *   この窓口（/api/keiri/cashcount）の `ok` は、**合否**の欄です
 *   （11/8 に「測れない日は ok: null＝合格にも不合格にもしない」と決めたとおり）。
 *   ところが読めた日は **`ok: true` が決め打ち**になっていました。
 *   ＝ **まだ一度も金庫を数えていない日でも ok: true** を返し
 *   （実測：counted false・verdict「まだ数えていません」なのに ok true）、
 *   読んだ人には f1-4「いまの現金残高が、実際の金庫の残高と合うか」が
 *   **合格**と読めます。数えていないので、合っているかは分かりません。
 *   ＝ 11/8 に直した「止まっている日を不合格にする」の、**裏返しの嘘**でした。
 *
 * ■ これからの答え方（合否は1か所だけで決める）
 *   まだ数えていない        … ok: **null**（合格にも不合格にもしない）
 *   ぴったり／ほぼ／数え方のちがいで説明がつく … ok: true
 *   合っていない            … 差に名前が付いたか（covered）で決める
 *                             covered true  → ok: true（説明のつく差）
 *                             covered null  → ok: **null**（読めていない所がある）
 *                             covered false → ok: false
 *
 * ★この関数は計算だけです（倉庫に聞きません）。試験で固定してあります。
 */
export type CashCountOk = {
  /** 合否。まだ数えていない日・読めていない所がある日は null */
  ok: boolean | null;
  /** 合否の読み方（人が読む1行） */
  okMeans: string;
};

export function cashCountOk(params: {
  verdict: CashCountVerdict;
  /** 差に名前が付いたか（diffCoverage.covered）。渡さなければ null と同じ */
  covered?: boolean | null;
}): CashCountOk {
  const covered = params.covered ?? null;

  if (params.verdict === "まだ数えていません") {
    return {
      ok: null,
      okMeans:
        "まだ金庫を1回も数えていないので、合否は付けていません" +
        "（合っているという意味でも、合っていないという意味でもありません）。" +
        "金庫を1回 数えると、ここに合否が出ます。",
    };
  }

  if (params.verdict !== "合っていない") {
    return {
      ok: true,
      okMeans: `数えた結果は「${params.verdict}」です＝合っている側です。`,
    };
  }

  if (covered === true) {
    return {
      ok: true,
      okMeans:
        "金額はちがいますが、その差には**ぜんぶ名前が付いています**" +
        "（説明のつく範囲に収まっています）＝合っている側です。",
    };
  }

  if (covered === null) {
    return {
      ok: null,
      okMeans:
        "金額がちがい、しかも**読めていない所があります**ので、合否は付けていません" +
        "（合っていないという意味ではありません）。",
    };
  }

  return {
    ok: false,
    okMeans: "金額がちがい、その差に**名前の付かない分が残っています**＝合っていません。",
  };
}
