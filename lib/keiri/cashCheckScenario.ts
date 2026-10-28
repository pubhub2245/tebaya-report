/**
 * 「金庫を数えた金額と、計算上の現金を突き合わせる所が正しく動くか」を、
 * **架空のお店の数字で外から確かめる**ための筋書き（kp233・f1-4）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   突き合わせる仕組みそのものは、もう本物の経理画面（/keiri）と
 *   お試し版（/keiri/demo）の両方に入っています。ところが、
 *   **どちらも「金額を入れて［この金額で比べる］を押す」必要があります。**
 *   検査役（B2）が使う読み取りの道具はボタンを押せないので、
 *   2026-10-09 18:55 の検査でこう書かれました——
 *   「差の言葉や原因3つが正しく出るかは確かめられていません」。
 *   ＝ 仕組みが正しいかどうかを、外から一度も確かめられていない状態でした。
 *
 * ■ そこでやること
 *   架空のお店（お試し版と同じ数字）の「計算上の現金」に対して、
 *   **本物と同じ関数**（previewCashCount・reconcileLines・cashDiffCauses）で
 *   6通りを計算し、出てくる言葉と金額をそのまま並べます：
 *     ① ぴったり合う ② ほぼ合う（1,000円 未満のズレ）
 *     ③ 金庫のほうが少ない ④ 金庫のほうが多い
 *     ⑤ まだ1回も数えていない ⑥ 久しく数えていない（30日以上）
 *   そのうえで、言葉と数字のつじつまが合っているかを自分で検算し `ok` で返します。
 *
 * ★倉庫には1行も書き込みません（棚が無くても動きます）。
 * ★出る金額はすべて架空のお店のもので、手羽屋の実データは1円も入りません。
 */

import { calcCashPosition, type CashPosition } from "./aggregate";
import { previousMonthRange } from "./caseStats";
import {
  DIFF_CAUSES,
  NEAR_ENOUGH_YEN,
  STALE_DAYS,
  cashDiffCauses,
  cashRuleLines,
  diffDirection,
  notFromSafeSentence,
  previewCashCount,
  reconcileCash,
  reconcileLines,
  type CashReconcile,
} from "./cashCheck";
import {
  buildCashOpeningGapWindow,
  cashOpeningGapFit,
  cashOpeningGapLines,
  diffCausesToShow,
  expensesBeforeOpening,
  type CashOpeningGap,
  type CashOpeningGapFit,
} from "./cashOpeningGap";
import {
  CASH_VARIANT_LABEL,
  buildCashVariants,
  pickCashVariant,
  type CashVariantKey,
  type CashVariantMatch,
} from "./cashVariant";
import {
  DEMO_SHOP_NAME,
  demoAdvances,
  demoPayments,
  demoReports,
  demoSettings,
} from "./demo";

/**
 * 架空のお店の月。**終わった月（前の月）**を使う（2026-10-11・検査役 B2 の気づき）。
 *
 * ■ なぜ「今月」ではないのか
 *   この筋書きには「月の末日に金庫を数えた」「30日以上 数えていない」の2場面が要ります。
 *   今月を使うと末日が未来になり、6通りのうち2つが作れません。
 * ■ なぜ literal で書かないのか
 *   2026-09 と書き固めていたため、お試し版（/keiri/demo は『今月』）と月の表示が食い違い、
 *   検査役が「数字はお試し版と同じなのに月が9月」と迷いました（10/11 09:55 の気づき）。
 *   前の月を今日から出せば、迷う理由（書き固めた古い月）が消え、ひとりでに追いついていきます。
 */
export function cashCheckYm(today: Date = new Date()): string {
  return previousMonthRange(today).start.slice(0, 7);
}

/** 突き合わせる日（＝数えた日）。その月の末日。この日までの計算上の残高と比べる */
export function cashCheckCountedOn(today: Date = new Date()): string {
  return previousMonthRange(today).end;
}

/**
 * 「久しく数えていない」を試すための、ずっと前に数えた日。
 * ★数え始めの日（月の頭）より後にしてある（前にすると「数え始め前の残高」と
 *   比べることになり、画面に出ない場面になってしまう）。
 */
export function cashCheckStaleOn(today: Date = new Date()): string {
  return `${cashCheckYm(today)}-05`;
}

/** 以前の書き方で読んでいる所のために残す（中身は「前の月」） */
export const CASH_CHECK_YM = cashCheckYm();
export const CASH_CHECK_COUNTED_ON = cashCheckCountedOn();
export const CASH_CHECK_STALE_ON = cashCheckStaleOn();

/** ③で使うズレ（1,000円 以上＝原因を出す側） */
const SHORT_BY = 3576;
/** ④で使うズレ（金庫のほうが多い側） */
const OVER_BY = 12000;
/** ②で使うズレ（1,000円 未満＝おつりの誤差の範囲） */
const NEAR_BY = 500;
/**
 * 架空の「レジに残してあるつり銭」（2号車ぶん・2026-10-12・f1-4）。
 * ★手羽屋の実データは1円も使いません。おつりの誤差の線（1,000円）より
 *   はっきり大きい額にして、「金庫だけを数えた場面」が別の相手になることを確かめます。
 */
const DEMO_REGISTER_FLOAT_YEN = 60000;

/** 架空のお店の現金の様子（お試し版とまったく同じ作り方） */
export function cashCheckPosition(asOf: string = CASH_CHECK_COUNTED_ON): CashPosition {
  const ym = CASH_CHECK_YM;
  return calcCashPosition({
    reports: demoReports(ym),
    payments: demoPayments(),
    settings: demoSettings(ym),
    advances: demoAdvances(ym),
    asOf,
  });
}

export type CashCheckCase = {
  /** その場面の名前（検査役がそのまま読む） */
  name: string;
  /** 数えた日 */
  countedOn: string;
  /** 計算上の現金（数えた日の時点） */
  computed: number | null;
  /** 数えたことにした金額 */
  counted: number | null;
  /** 計算 − 実測。プラス＝金庫のほうが少ない */
  diff: number | null;
  /** 差の向きの言葉（ぴったり／金庫のほうが少ない／多い） */
  direction: string | null;
  /** 画面に出る3行（計算上・実際・差） */
  lines: string[];
  /** 差の言い方（1文） */
  verdict: string;
  /** 差が大きいときだけ出る、よくある原因 */
  causes: readonly string[];
  /** 「久しく数えていません」の一言（当てはまらなければ null） */
  stale: string | null;
};

/** 1場面ぶんを、本物と同じ関数で作る */
function caseOf(params: {
  name: string;
  r: CashReconcile;
  countedOn: string;
}): CashCheckCase {
  const { name, r, countedOn } = params;
  return {
    name,
    countedOn,
    computed: r.computed,
    counted: r.counted,
    diff: r.diff,
    direction: r.diff === null ? null : diffDirection(r.diff),
    // ★画面と同じ関数で作る（ここに文を書き写さない）
    lines: reconcileLines(r),
    verdict: r.verdict,
    causes: cashDiffCauses(r),
    stale: r.stale,
  };
}

/**
 * 「2通りの数え方のどちらに合うか」の1場面（2026-10-12・kp250・f1-4）。
 * ★検査役（B2）は合言葉の内側の経理画面を開けないので、ここで外から確かめられるようにする。
 */
export type CashVariantCase = {
  /** その場面の名前 */
  name: string;
  /** 数えたことにした金額 */
  counted: number;
  /** どちらに合ったか */
  match: CashVariantMatch;
  /** 合った数え方の名前（合わなければ null） */
  matchedLabel: string | null;
  /** 画面に出る行（本物と同じ関数が作ったもの） */
  lines: string[];
};

export type CashVariantCheck = {
  what: string;
  /** 架空の「前の月に立て替えて、この月に返した」額 */
  repaidEarlierYen: number;
  /** 架空の「レジに残してあるつり銭」（金庫の外にあるお金・2026-10-12・f1-4） */
  registerFloatYen: number;
  /** 数え方ごとの残高 */
  balances: {
    nowScreen: number;
    withEarlierRepaid: number;
    /** レジのつり銭を金庫の外として引いた金額（金庫だけを数えたとき） */
    nowScreenSafeOnly: number;
    withEarlierRepaidSafeOnly: number;
  };
  /** それぞれの数え方の名前 */
  labels: Record<CashVariantKey, string>;
  cases: CashVariantCase[];
  note: string;
};

export type CashCheckResult = {
  what: string;
  shopName: string;
  ym: string;
  /** なぜお試し版と月の表示が違うのか（検査役が迷わないように） */
  ymNote: string;
  /** 計算上の現金は、こう数えています（画面と同じ明細） */
  howComputed: string[];
  /** 金庫から出ていないので引いていないもの（無ければ null） */
  notFromSafe: string | null;
  /** 1,000円 未満は「ほぼ合っている」とする線 */
  nearEnoughYen: number;
  /** 何日 数えていなければ「久しく数えていない」と言うか */
  staleDays: number;
  /** 差が大きいときに出す原因の一覧（画面に出るものと同じ） */
  causeList: readonly string[];
  cases: CashCheckCase[];
  /**
   * 数え方が2通りに分かれたときに、どちらに合うかを言えるか（2026-10-12・kp250・f1-4）。
   * ★手羽屋の9月はここが分かれています（9行・493,700円）。
   */
  variants: CashVariantCheck;
  /**
   * 数え始めの日より前に払った経費で、差の理由がその場で分かるか
   * （2026-10-28・kp265・f1-4）。★架空のお店の数字です。
   */
  openingGap: CashOpeningGapCheck;
  /** 言葉と数字のつじつまが合っているか（検算の結果） */
  ok: boolean;
  /** 合っていなかったところ（ok が true なら空） */
  problems: string[];
  note: string;
};

/**
 * 外から確かめる窓口の中身を作る。
 *
 * @param countedYen 検査役が自分で金額を指定したいとき（?counted=…）。架空のお店に対して試す
 * @param today 今日（YYYY-MM-DD）。「久しく数えていない」の判定に使う
 */
export function buildCashCheck(params?: {
  countedYen?: number | null;
  today?: string;
}): CashCheckResult {
  const today = params?.today ?? new Date().toISOString().slice(0, 10);
  const ym = CASH_CHECK_YM;
  const pos = cashCheckPosition();
  const computed = pos.balance;

  const preview = (counted: number, countedOn = CASH_CHECK_COUNTED_ON): CashReconcile =>
    previewCashCount({
      computedAtCount: cashCheckPosition(countedOn).balance,
      countedOn,
      counted,
      today,
    });

  const cases: CashCheckCase[] = [
    caseOf({
      name: "① ぴったり合う",
      r: preview(computed),
      countedOn: CASH_CHECK_COUNTED_ON,
    }),
    caseOf({
      name: `② ほぼ合う（${NEAR_BY.toLocaleString("ja-JP")}円 のズレ＝おつりの誤差の範囲）`,
      r: preview(computed - NEAR_BY),
      countedOn: CASH_CHECK_COUNTED_ON,
    }),
    caseOf({
      name: `③ 金庫のほうが少ない（${SHORT_BY.toLocaleString("ja-JP")}円）`,
      r: preview(computed - SHORT_BY),
      countedOn: CASH_CHECK_COUNTED_ON,
    }),
    caseOf({
      name: `④ 金庫のほうが多い（${OVER_BY.toLocaleString("ja-JP")}円）`,
      r: preview(computed + OVER_BY),
      countedOn: CASH_CHECK_COUNTED_ON,
    }),
    caseOf({
      name: "⑤ まだ1回も数えていない",
      r: reconcileCash({ events: [], computedAtCount: computed, today }),
      countedOn: "",
    }),
    caseOf({
      name: `⑥ 久しく数えていない（${CASH_CHECK_STALE_ON} に数えたまま）`,
      r: reconcileCash({
        events: [
          { kind: "count", happened_on: CASH_CHECK_STALE_ON, amount: 120000 },
        ],
        computedAtCount: cashCheckPosition(CASH_CHECK_STALE_ON).balance,
        today,
      }),
      countedOn: CASH_CHECK_STALE_ON,
    }),
  ];

  if (params?.countedYen !== null && params?.countedYen !== undefined) {
    const asked = Math.max(0, Math.round(params.countedYen));
    cases.push(
      caseOf({
        name: `⑦ 指定された金額で試す（${asked.toLocaleString("ja-JP")}円）`,
        r: preview(asked),
        countedOn: CASH_CHECK_COUNTED_ON,
      }),
    );
  }

  const variants = buildCashVariantCheck({ today });
  const openingGap = buildCashOpeningGapCheck({ today });
  const problems = [
    ...checkCases(cases),
    ...checkVariantCases(variants),
    ...openingGap.problems,
  ];

  return {
    what:
      "金庫を数えた金額と、計算上の現金を突き合わせる所が正しく動くか（f1-4）。" +
      "ボタンを押さずに、外から読むだけで確かめられます",
    shopName: DEMO_SHOP_NAME,
    ym,
    ymNote:
      "この筋書きは**終わった月（前の月）**を使います。お試し版（/keiri/demo）と" +
      "1枚の見本（/keiri/monthly-sample）は『今月』を使うので、月の表示だけが違います。" +
      "1日ぶんの数字の作り方は同じ関数なので、金額はお試し版と同じです" +
      "（月の末日に数えた・30日以上 数えていない の2場面を作るために、終わった月が要ります）。",
    howComputed: cashRuleLines({
      openingDate: pos.openingDate,
      openingBalance: pos.openingBalance,
      sales: pos.sales,
      expensesCash: pos.expenseMeans.cash,
      paid: pos.paid,
      advancesSettled: pos.advancesSettled,
      deposits: pos.deposits,
      balance: pos.balance,
    }),
    notFromSafe: notFromSafeSentence({
      advance: pos.expenseMeans.advance,
      advanceCount: pos.expenseMeans.advanceCount,
      noncash: pos.expenseMeans.noncash,
      noncashCount: pos.expenseMeans.noncashCount,
    }),
    nearEnoughYen: NEAR_ENOUGH_YEN,
    staleDays: STALE_DAYS,
    causeList: DIFF_CAUSES,
    cases,
    variants,
    openingGap,
    ok: problems.length === 0,
    problems,
    note:
      "架空のお店（お試し版と同じ数字）です。手羽屋の実データ・お店の名前・連絡先・鍵の値は1文字も入っていません。" +
      "倉庫には1行も書き込みません。?counted=123456 を付けると、その金額でも試せます。" +
      "古い答えが返るときは ?v=いまの時刻 を付けて開き直してください。",
  };
}

/**
 * 言葉と数字のつじつまを、こちらで検算する（検査役が目で数えなくてよいように）。
 *
 * 見るのは4つだけ：
 *   ・差＝計算上 − 数えた（1円でも違えば不合格）
 *   ・差の向きの言葉が、符号と合っているか
 *   ・原因3つは、1,000円 以上のときだけ出ているか
 *   ・3行（計算上・実際・差）が、数えた場面では必ず出ているか
 */
export function checkCases(cases: CashCheckCase[]): string[] {
  const problems: string[] = [];
  for (const c of cases) {
    if (c.computed !== null && c.counted !== null) {
      if (c.diff !== c.computed - c.counted) {
        problems.push(`${c.name}：差が「計算上 − 数えた」になっていません`);
      }
      if (c.lines.length !== 3) {
        problems.push(`${c.name}：画面に出る3行がそろっていません`);
      }
      const want =
        c.diff === 0 ? "ぴったり" : (c.diff ?? 0) > 0 ? "金庫のほうが少ない" : "金庫のほうが多い";
      if (c.direction !== want) {
        problems.push(`${c.name}：差の向きの言葉が符号と合っていません`);
      }
      const big = Math.abs(c.diff ?? 0) >= NEAR_ENOUGH_YEN;
      if (big && c.causes.length !== DIFF_CAUSES.length) {
        problems.push(`${c.name}：差が大きいのに、よくある原因が出ていません`);
      }
      if (!big && c.causes.length !== 0) {
        problems.push(`${c.name}：差が小さいのに、よくある原因が出ています`);
      }
    } else if (c.causes.length !== 0 || c.lines.length !== 0) {
      problems.push(`${c.name}：数えていないのに、差や原因が出ています`);
    }
    if (!c.verdict) problems.push(`${c.name}：差の言い方が空です`);
  }
  return problems;
}

/**
 * 架空の「前の月に立て替えて、この月に返した」額（実データは1円も使わない）。
 *
 * ★架空のお店の残高の**半分**にする。手羽屋の実額（493,700円）をそのまま使うと、
 *   架空のお店の残高（約21万円）を超えて「金庫に −28万円 ある」という
 *   ありえない場面になり、読んだ人が迷います（2026-10-12 に本番で実測して気づいた）。
 */
function demoRepaidEarlierYen(nowScreen: number): number {
  return Math.max(1000, Math.round(nowScreen / 2 / 100) * 100);
}

/**
 * 「2通りの数え方のどちらに合うか」を、架空のお店の数字で外から確かめられる形にする
 * （2026-10-12・kp250・f1-4）。
 *
 * ■ なぜ要るか
 *   手羽屋の9月は、金庫の数え方が2通りに分かれています
 *   （前の月までに立て替えて9月に返した 9行・493,700円 を引くかどうか）。
 *   このままだと、じゅんが金庫を数えたときに
 *   「金庫のほうが49万円 少ない／書き忘れを探してください」と出てしまいます。
 *   直したつもりが本当に直っているかは、**合言葉の内側の画面**でしか見えないので、
 *   架空のお店で**本物と同じ関数**に4通りを計算させて、外から読めるようにします。
 *
 * ★架空の金額だけを使います（手羽屋の実データは1円も入りません）。
 */
export function buildCashVariantCheck(params?: { today?: string }): CashVariantCheck {
  void params;
  const nowScreen = cashCheckPosition().balance;
  const repaidEarlierYen = demoRepaidEarlierYen(nowScreen);
  const withRepaid = nowScreen - repaidEarlierYen;
  // 架空の「レジに残してあるつり銭」（2号車ぶん）。金庫の外にあるお金
  const registerFloatYen = DEMO_REGISTER_FLOAT_YEN;
  const variants = buildCashVariants({
    screenBalance: nowScreen,
    withRepaidBalance: withRepaid,
    registerFloat: registerFloatYen,
  });

  const one = (name: string, counted: number): CashVariantCase => {
    const pick = pickCashVariant({ variants, counted });
    return {
      name,
      counted,
      match: pick.match,
      matchedLabel: pick.matched ? pick.matched.label : null,
      lines: pick.lines,
    };
  };

  // ★どの数え方からも 1,000円 以上 離れた金額（いちばん大きい残高より さらに上）
  const farFromAll =
    variants.reduce((max, v) => Math.max(max, v.balance), 0) + NEAR_ENOUGH_YEN * 3;

  const cases: CashVariantCase[] = [
    one("① 金庫が「いまの画面の数え方」に合った", nowScreen),
    one("② 金庫が「前の月に返した分も引く数え方」に合った", withRepaid),
    one("③ どちらにも合わない（数え方では説明がつかない差）", farFromAll),
    // ★金庫だけを数えた（レジのつり銭は数えていない）場面。
    //   ここで「書き忘れを探してください」と出すと、無い探し物をさせてしまう（f1-4）
    one("⑤ 金庫だけを数えた（レジのつり銭は数えていない）", nowScreen - registerFloatYen),
    one(
      "⑥ 金庫だけを数えて、返した分も引く数え方に合った",
      withRepaid - registerFloatYen,
    ),
  ];

  // ④ 分かれていない月＝選択肢そのものを出さない
  const single = pickCashVariant({
    variants: buildCashVariants({
      screenBalance: nowScreen,
      withRepaidBalance: nowScreen,
      registerFloat: 0,
    }),
    counted: nowScreen,
  });
  cases.splice(3, 0, {
    name: "④ 数え方が分かれていない月（画面には何も増えない）",
    counted: nowScreen,
    match: single.match,
    matchedLabel: single.matched ? single.matched.label : null,
    lines: single.lines,
  });

  return {
    what:
      "金庫の現金の数え方が分かれたとき、入れた金額がどれに合うかを" +
      "画面が自分で言えるか（f1-4・kp250）。ボタンを押さずに外から読むだけで確かめられます",
    repaidEarlierYen,
    registerFloatYen,
    balances: {
      nowScreen,
      withEarlierRepaid: withRepaid,
      nowScreenSafeOnly: nowScreen - registerFloatYen,
      withEarlierRepaidSafeOnly: withRepaid - registerFloatYen,
    },
    labels: CASH_VARIANT_LABEL,
    cases,
    note:
      "①②⑤⑥は合った側を名指しし、③は「どれにも合いませんでした」と言い、" +
      "④は行が1行も出ません（＝画面に何も増えない）。" +
      "⑤⑥は「金庫だけを数えて、レジのつり銭は数えていない」場面で、" +
      "ここで『書き忘れを探してください』と出さないことを確かめています。" +
      "金額は架空のお店のもので、こちらで1円も直していません。",
  };
}

/**
 * 2通りの数え方の筋書きを検算する（検査役が目で数えなくてよいように）。
 *
 * 見るのは4つだけ：
 *   ① いまの画面の残高を入れたら「いまの画面の数え方」に合う
 *   ② 返した分を引いた残高を入れたら「返した分も引く数え方」に合う
 *   ③ どちらからも遠い金額なら「どちらでもない」と言う
 *   ④ 分かれていない月は、行が1行も出ない
 */
export function checkVariantCases(v: CashVariantCheck): string[] {
  const problems: string[] = [];
  const want: CashVariantMatch[] = [
    "nowScreen",
    "withEarlierRepaid",
    "neither",
    "single",
    "nowScreenSafeOnly",
    "withEarlierRepaidSafeOnly",
  ];
  v.cases.forEach((c, i) => {
    if (c.match !== want[i]) {
      problems.push(`${c.name}：合う側の見分けが「${c.match}」になっています`);
    }
  });
  const neither = v.cases.find((c) => c.match === "neither");
  if (neither && neither.matchedLabel !== null) {
    problems.push("どちらにも合わないのに、合った数え方の名前が出ています");
  }
  const single = v.cases.find((c) => c.match === "single");
  if (single && single.lines.length !== 0) {
    problems.push("数え方が分かれていない月なのに、画面に行が増えています");
  }
  for (const c of v.cases) {
    if (c.match !== "single" && c.lines.length === 0) {
      problems.push(`${c.name}：画面に出る行が空です`);
    }
    // ★金庫だけを数えた場面で「書き忘れ」と言わないこと（無い探し物をさせないため・f1-4）
    if (
      (c.match === "nowScreenSafeOnly" || c.match === "withEarlierRepaidSafeOnly") &&
      !c.lines.some((l) => l.includes("レジに残してあるつり銭"))
    ) {
      problems.push(`${c.name}：レジのつり銭のことが1行も出ていません`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 *  数え始めの日より前に払った経費（2026-10-28・kp265・f1-4）
 * ------------------------------------------------------------------ */

/**
 * 「金庫を数えて差が出たとき、その場で理由が分かるか」を
 * **架空のお店の数字で外から確かめる**ための筋書き。
 *
 * ■ なぜ要るか（やさしい説明）
 *   月の経費は「その月ぜんぶ」を数えるのに、現金は「数え始めの日」からしか数えません。
 *   ＝ 数え始めの日より前に払った経費は、月の経費には入るのに現金からは引かれないので、
 *   金庫を数えると、その分が差として出ます（手羽屋の9月では仕入4件）。
 *   画面はこれを差の内わけとして1行 出すようにしましたが、
 *   その画面は合言葉の内側なので、検査役（B2）もこちらも目で見られません。
 *   そこで**本物と同じ関数**に3通りを計算させて、外から読める形にします。
 *
 * ★架空の金額だけを使います（手羽屋の実データは1円も入りません）。
 * ★倉庫は読みません・1行も書き込みません。
 */
export type CashOpeningGapCase = {
  name: string;
  /** 計算上の残高 − 数えた金額（プラス＝金庫のほうが少ない） */
  diff: number | null;
  /** 差の内わけに出る行（本物と同じ関数。出ないときは空） */
  gapLines: string[];
  /** 「よくある原因3つ」が出るか（決め方は画面と同じ1か所） */
  causes: readonly string[];
  /** この分で差を説明できるか */
  fit: CashOpeningGapFit;
};

export type CashOpeningGapCheck = {
  what: string;
  /** 架空のお店の数え始めの日 */
  openingDate: string;
  /** 数え始めの日より前に払った経費（架空のお店・件数と金額） */
  count: number;
  total: number;
  firstDate: string | null;
  lastDate: string | null;
  cases: CashOpeningGapCase[];
  /** 本物の手羽屋ぶんは、金額を出さない形で /api/keiri/cashcount に出ています */
  realNote: string;
  ok: boolean;
  problems: string[];
  note: string;
};

/** 架空のお店の、数え始めの日より前の仕入3件（どれも作り物の金額） */
const GAP_DEMO_ROWS: Array<{ day: string; yen: number }> = [
  { day: "04", yen: 3000 },
  { day: "06", yen: 4000 },
  { day: "09", yen: 5000 },
];

/** 架空のお店の、数え始めの日（月の10日） */
function gapOpeningDate(ym: string): string {
  return `${ym}-10`;
}

/** 架空のお店の日報（数え始めの前の仕入3件＋数え始めのあとの売上1件） */
function gapDemoReports(ym: string) {
  const rows = GAP_DEMO_ROWS.map((r) => ({
    date: `${ym}-${r.day}`,
    location: "架空ひろば",
    staff_name: "見本",
    shop: "見本",
    sales_amount: 0,
    labor: 0,
    expenses: [{ description: "仕入", amount: r.yen }],
  }));
  rows.push({
    date: `${ym}-20`,
    location: "架空ひろば",
    staff_name: "見本",
    shop: "見本",
    sales_amount: 60000,
    labor: 0,
    expenses: [{ description: "氷", amount: 1000 }],
  });
  return rows as unknown as Parameters<typeof expensesBeforeOpening>[0]["reports"];
}

export function buildCashOpeningGapCheck(params?: { today?: string }): CashOpeningGapCheck {
  void params;
  const ym = CASH_CHECK_YM;
  const openingDate = gapOpeningDate(ym);
  const reports = gapDemoReports(ym);
  const gap: CashOpeningGap = expensesBeforeOpening({ reports, openingDate });

  /** 1場面ぶんを、本物と同じ関数で作る */
  const caseOfGap = (
    name: string,
    diff: number | null,
    g: CashOpeningGap = gap,
  ): CashOpeningGapCase => ({
    name,
    diff,
    gapLines: cashOpeningGapLines(g, diff),
    causes: diffCausesToShow({
      // 差が 1,000円 以上のときだけ出る3つ（画面と同じ入り口）
      causes: diff !== null && Math.abs(diff) >= NEAR_ENOUGH_YEN ? DIFF_CAUSES : [],
      variantMatched: false,
      gap: g,
      diff,
    }),
    fit: cashOpeningGapFit(g, diff),
  });

  const empty: CashOpeningGap = expensesBeforeOpening({ reports: [], openingDate });

  const cases: CashOpeningGapCase[] = [
    caseOfGap(
      `① 差が、数え始めの日より前の経費（${gap.total.toLocaleString("ja-JP")}円）とぴったり同じ`,
      gap.total,
    ),
    caseOfGap("② 差が、その分とは別の大きさ（200,000円）", 200000),
    caseOfGap("③ 金庫のほうが多い（差 −50,000円）", -50000),
    caseOfGap("④ 数え始めの日より前の経費が無いお店（行が出ない）", gap.total, empty),
    caseOfGap("⑤ まだ数えていない（差が無い）", null),
  ];

  const problems: string[] = [];
  if (gap.count !== GAP_DEMO_ROWS.length) {
    problems.push("架空のお店の『数え始めの日より前の経費』の件数が合っていません");
  }
  if (cases[0].fit !== "exact" || cases[0].gapLines.length !== 3) {
    problems.push("① ぴったり同じなのに、言い切る1行が出ていません");
  }
  if (cases[0].causes.length !== 0) {
    problems.push("① 理由が分かっているのに、よくある原因（探し物）が出ています");
  }
  if (cases[1].fit !== "no" || cases[1].causes.length !== DIFF_CAUSES.length) {
    problems.push("② 別の大きさの差なのに、よくある原因が出ていません");
  }
  if (cases[1].gapLines.length !== 2) {
    problems.push("② 内わけの2行（金額と説明）が出ていません");
  }
  if (cases[2].fit !== "no" || cases[2].causes.length !== DIFF_CAUSES.length) {
    problems.push("③ 金庫のほうが多いのに、この分で説明したことになっています");
  }
  if (cases[3].gapLines.length !== 0) {
    problems.push("④ 当てはまる行が無いのに、内わけの行が出ています");
  }
  if (cases[4].gapLines.length !== 2 || cases[4].causes.length !== 0) {
    problems.push("⑤ まだ数えていないのに、差の言い方が出ています");
  }

  const window = buildCashOpeningGapWindow({ gap, diff: gap.total });

  return {
    what:
      "金庫を数えて差が出たとき、『数え始めの日より前に払った経費』として" +
      "その場で理由が分かるか（f1-4）。ボタンを押さずに、外から読むだけで確かめられます",
    openingDate,
    count: gap.count,
    total: gap.total,
    firstDate: gap.firstDate,
    lastDate: gap.lastDate,
    cases,
    realNote:
      "本物の手羽屋ぶん（何件・いつからいつまで・差の説明がつくか）は " +
      "/api/keiri/cashcount の openingGap に出ています（金額は1円も出しません）。" +
      `いまの言い方：${window.note}`,
    ok: problems.length === 0,
    problems,
    note:
      "架空のお店の作り物の金額です（手羽屋の実データ・お店の名前・連絡先・鍵の値は1文字も入っていません）。" +
      "倉庫は読みません・1行も書き込みません。",
  };
}
