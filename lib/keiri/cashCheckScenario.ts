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
  /** 2通りの残高 */
  balances: { nowScreen: number; withEarlierRepaid: number };
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
  const problems = [...checkCases(cases), ...checkVariantCases(variants)];

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
  const variants = buildCashVariants({
    screenBalance: nowScreen,
    withRepaidBalance: withRepaid,
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

  const cases: CashVariantCase[] = [
    one("① 金庫が「いまの画面の数え方」に合った", nowScreen),
    one("② 金庫が「前の月に返した分も引く数え方」に合った", withRepaid),
    // ★どちらからも 1,000円 以上 離れた金額（2つの残高のちょうど真ん中）
    one(
      "③ どちらにも合わない（数え方では説明がつかない差）",
      Math.round((nowScreen + withRepaid) / 2),
    ),
  ];

  // ④ 分かれていない月＝選択肢そのものを出さない
  const single = pickCashVariant({
    variants: buildCashVariants({ screenBalance: nowScreen, withRepaidBalance: nowScreen }),
    counted: nowScreen,
  });
  cases.push({
    name: "④ 数え方が分かれていない月（画面には何も増えない）",
    counted: nowScreen,
    match: single.match,
    matchedLabel: single.matched ? single.matched.label : null,
    lines: single.lines,
  });

  return {
    what:
      "金庫の現金の数え方が2通りに分かれたとき、入れた金額がどちらに合うかを" +
      "画面が自分で言えるか（f1-4・kp250）。ボタンを押さずに外から読むだけで確かめられます",
    repaidEarlierYen,
    balances: { nowScreen, withEarlierRepaid: withRepaid },
    labels: CASH_VARIANT_LABEL,
    cases,
    note:
      "①②は合った側を名指しし、③は「どちらにも合いませんでした」と言い、" +
      "④は行が1行も出ません（＝画面に何も増えない）。" +
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
  const want: CashVariantMatch[] = ["nowScreen", "withEarlierRepaid", "neither", "single"];
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
  }
  return problems;
}
