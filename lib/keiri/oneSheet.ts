/**
 * 「1枚の要約」を組み立てるところ（架空のお店でも、本物のお店でも、ここ1つを通る）。
 *
 * ■ なぜ分けたか（2026-10-04・kp231）
 *   1枚の要約は **見本（架空のお店／lib/keiri/monthlySample.ts）だけ** にありました。
 *   実際のお店に毎月お渡しする1枚は、どこからも出せませんでした
 *   （経理画面には数字とCSVはあるが、そのまま渡せる1枚が無い）。
 *   かといって本物用にもう1つ作ると、**同じ1枚が2通りに育って数字がずれます**。
 *   そこで「数字の並べ方」をこのファイル1つに寄せ、
 *   見本は架空のお店のデータを、本物の1枚（/keiri/monthly）は倉庫から読んだデータを
 *   **同じ関数に入れるだけ**にしました。
 *
 * ■ 言葉と並び順（2026-10-04・kp231 ②・meta/keiri-material-onepage-real）
 *   店主が読む1枚なので、**会計の言葉を出しません**。
 *     「経費」→「かかったお金」／「利益」→「残ったお金（利益）」／
 *     「未払金」→「まだ払っていないお金」／「仕訳」→「会計ソフトに渡す表」。
 *   並び順は ①見出し ②大きな数字3つ ③かかったお金の中身 ④いま手元にある現金
 *   ⑤まだ払っていないお金 ⑥確かめてほしいこと ⑦会計ソフトに渡す表 ⑧断り書き。
 *
 * ■ 守ること（ここを崩さないこと）
 *   ① **金額を書かない。** 画面が呼んでいるのと同じ関数
 *      （aggregate.ts / journal.ts）に計算させ、ここでは並べるだけ。
 *   ② 月の経費の正しい合計は summarizeMonth の1つだけ（kp218）。
 *      3通りに数え直すのは「同じ数字か」を1枚の上で見せるためだけ（f1-2）。
 *   ③ 要確認（種類が分からなかった経費・同じ支払いが2か所にある疑い）は隠さない。
 *   ④ **検算が合わないときは1枚を出さない。** 合わない所を代わりに出す（verify）。
 *      数字の合っていない紙をお店に渡すほうが、出さないより悪いためです。
 */

import {
  calcCashPosition,
  calcUnpaid,
  mergedExpenseByAccount,
  monthEnd,
  summarizeMonth,
} from "./aggregate";
import {
  cashRuleLines,
  depositsOf,
  latestCount,
  notFromSafeSentence,
  type CashEvent,
} from "./cashCheck";
import { findDuplicateExpenses } from "./duplicates";
import { pendingSuspects, type IgnoreMarks } from "./expenseIgnores";
import {
  shopScopeNotes,
  shopScopeSentence,
  summarizeShopScope,
  type ShopCount,
} from "./shopScope";
import { expenseItemsOf } from "./classify";
import { DISPLAY_EXPENSE_ACCOUNTS } from "./accounts";
import { JOURNAL_HEADERS, buildJournalRows, journalExpenseTotal } from "./journal";
import {
  buildTrialBalance,
  checkTrialBalance,
  trialBalanceCashNote,
  type TrialBalance,
  type TrialBalanceCheck,
} from "./trialBalance";
import { MF_HEADERS } from "./moneyforward";
import { YAYOI_HEADERS } from "./yayoi";
import type {
  BusinessTemplate,
  KeiriAdvance,
  KeiriPayment,
  KeiriReport,
  KeiriSettings,
} from "./types";

/** 要約の1行（見出しと金額） */
export type SampleLine = { label: string; yen: number };

/** 仕訳の1行（人が読む6列ぶん） */
export type SampleJournalLine = {
  date: string;
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  note: string;
};

/** 月の経費を、別々の数え方で3通り数えた結果（同じ数字になるのが正しい） */
export type SampleExpenseCheck = {
  /** 画面（月次のまとめ）が出す合計 */
  screen: number;
  /** 科目ごとの内訳を足し上げた合計 */
  byAccount: number;
  /** 会計ソフト向けCSV（仕訳）の経費側を足し上げた合計 */
  csv: number;
  /** 3つとも同じ数字か */
  same: boolean;
};

/** いま手元にある現金（どこから計算したかも出す） */
export type SampleCash = {
  /** いまの手元の現金 */
  balance: number;
  /** 最後に実際に数えた日（YYYY-MM-DD） */
  countedOn: string;
  /** そのとき数えた額 */
  countedYen: number;
  /**
   * 「この現金は、こう数えています」の明細（kp233・f1-4）。
   * ★紙を渡された人が、足し引きを自分で追えるようにするため。
   */
  ruleLines: string[];
  /** 金庫から出ていないので引いていないもの（無ければ null） */
  notFromSafe: string | null;
  /** 立替と見分けた行の数 */
  advanceCount: number;
  /** 現金以外（PayPay・プリカなど）と見分けた行の数 */
  noncashCount: number;
};

/** まだ払っていないお金（相手ごとの内訳つき） */
export type SampleUnpaid = {
  total: number;
  /** 相手ごとに1行。合計は total と同じになること */
  lines: SampleLine[];
};

/** 同じ支払いが2か所に書かれているかもしれないもの */
export type SampleDuplicate = {
  /** 疑いの件数 */
  count: number;
  /** そのうち同じ月に2回入っている額（この月のかかったお金がこの分だけ多い） */
  sameMonthYen: number;
  /** 月をまたいでいる額（どちらの月に入れるかで動く） */
  crossMonthYen: number;
  /** 片方を数えないとき、かかったお金はいくらになるか */
  expenseAfter: number;
  /** 片方を数えないとき、残ったお金（利益）はいくらになるか */
  profitAfter: number;
};

/** 確かめてほしいこと（無ければ枠ごと出さない） */
export type SampleReview = {
  /** 種類が分からず「雑費」に入れたもの */
  unmatched: { date: string; description: string; amount: number }[];
  /** 同じ支払いが2か所にある疑い（無ければ null） */
  duplicate: SampleDuplicate | null;
  /**
   * レシートの写真が無い支払いの件数。
   * ★写真の有無が読めないデータのときは null（＝この行は出さない）。
   *   倉庫の軽い見え方（keiri_reports）は写真の住所を抜いているので、
   *   そこを通って来たデータでは分かりません。**分からないことを0件と書かない。**
   */
  noReceiptCount: number | null;
  /** 1つでも出すものがあるか */
  any: boolean;
};

/** 出す前の検算（3つとも合っていなければ1枚を出さない） */
export type SampleVerify = {
  /** かかったお金 ＝ 科目ごとの合計 ＝ CSVの経費側 */
  expenseOk: boolean;
  /** 売上 − かかったお金 ＝ 残ったお金 */
  profitOk: boolean;
  /** まだ払っていないお金の内訳の合計 ＝ その見出し */
  unpaidOk: boolean;
  /** 試算表の左右が合い、売上・かかったお金・利益が画面と同じか（f1-7） */
  trialOk: boolean;
  /** ぜんぶ合っているか */
  ok: boolean;
  /** 合っていない所の言葉（人が読んで直せるように） */
  problems: string[];
};

export type MonthlySample = {
  /** 「2026年8月」 */
  monthLabel: string;
  /** お店の名前（見本は架空のお店の名前） */
  shopName: string;
  /** いちばん上の見出し（「デモ食堂　2026年9月のまとめ」） */
  title: string;
  /** 見出しの下の小さい1行（「10月4日に作りました・日報12件から」） */
  madeOnLabel: string;
  /** 大きく出す数字3つ（売上・かかったお金・残ったお金（利益）） */
  headline: SampleLine[];
  /** 『売上 ◯ − かかったお金 ◯ ＝ 残ったお金 ◯』（計算から作る） */
  profitLine: string;
  /** かかったお金の中身（科目ごと・金額の大きい順。0円の科目は出さない） */
  expenses: SampleLine[];
  /** 会計ソフト用CSVの列の見出し（人が読む6列） */
  journalHeaders: readonly string[];
  /** 会計ソフト用CSVの中身（先頭の数行だけ見せる） */
  journalRows: SampleJournalLine[];
  /** 仕訳が全部で何行あるか（先頭だけ見せていることを正直に書くため） */
  journalRowCount: number;
  /**
   * 試算表（科目ごとの借方・貸方の合計）。会計ソフトと税理士さんが最初に見る表（f1-7）。
   * ★仕訳（journalRows のもと）だけから作ります。日報からは数え直しません。
   */
  trial: TrialBalance;
  /** 試算表と画面の数字を突き合わせた結果（売上・かかったお金・利益の3つと、左右の合計） */
  trialCheck: TrialBalanceCheck;
  /**
   * 試算表の「現金」が、画面の現金とちがって見える所に添える1文（kp243・f1-7）。
   * 現金の行が無い月は null（よけいな行を出さない）。
   */
  trialCashNote: string | null;
  /** マネーフォワードの仕訳帳インポートの列数（27列） */
  mfColumnCount: number;
  /** 弥生会計の仕訳インポートの列の数（25） */
  yayoiColumnCount: number;
  /** 月の経費の合計（これが正。画面・CSV・要約はこの1つを見る） */
  expenseTotal: number;
  /** 経費の合計の内訳（レジのお金から出た分・誰かが立て替えた分・人件費・家賃） */
  expenseBreakdown: SampleLine[];
  /** 月の経費を3通りに数えて突き合わせた結果（f1-2 を外から確かめられるようにする） */
  expenseCheck: SampleExpenseCheck;
  /** いま手元にある現金 */
  cash: SampleCash;
  /** まだ払っていないお金 */
  unpaid: SampleUnpaid;
  /** 確かめてほしいこと */
  review: SampleReview;
  /** 出す前の検算 */
  verify: SampleVerify;
  /** 種類が分からず「雑費」に入れた経費（要確認。黙って隠さない） */
  unmatched: { date: string; description: string; amount: number }[];
  /** 集計に使った日報の件数 */
  reportCount: number;
  /**
   * 「この数字は 手羽屋 12件・もも屋 3件 の日報 15件から数えています」の1行（kp234・f1-5）。
   * ★件数だけでは、どのお店の日報を数えているか分かりません。**必ず出します。**
   */
  scopeLabel: string;
  /** お店の区分ごとの件数と売上（内訳。合計の数字は変わりません） */
  scopeShops: ShopCount[];
  /**
   * 断り書き（2つのお店が混ざっている／見出しと範囲がずれている／立替は分けられない）。
   * ★無ければ空の配列。黙って混ぜない・黙って分けないために出します。
   */
  scopeNotes: string[];
};

/** 見本に見せる仕訳の行数（スマホで開くので、長くしない） */
export const SAMPLE_JOURNAL_PREVIEW_ROWS = 4;

/** いちばん下に必ず出す断り書き（税務の判断はしないことを毎月書く） */
export const ONE_SHEET_DISCLAIMER =
  "この1枚は日報から自動で作っています。税金の計算や申告の判断はしていません。申告はお店の税理士さんにお願いしてください。";

/** 1枚の要約を作るのに必要なもの（倉庫から読んだものでも、架空のお店のものでも同じ形） */
export type OneSheetInput = {
  /** どの月か（YYYY-MM） */
  ym: string;
  /** 画面に出す月の呼び名（「2026年9月」） */
  monthLabel: string;
  /** お店の名前 */
  shopName: string;
  reports: KeiriReport[];
  payments: KeiriPayment[];
  advances: KeiriAdvance[];
  settings: KeiriSettings;
  template: BusinessTemplate;
  /**
   * 「まだ払っていないお金」を数える基準の月（YYYY-MM）。
   * 家賃は「その月まで」を数えるので、ふだんは今日の月を渡す。
   * 省略すると ym（見本は月をあてはめているだけなので ym でよい）。
   */
  currentYm?: string;
  /** この1枚を作った日（YYYY-MM-DD）。省略すると日本時間の今日 */
  madeOn?: string;
  /** 仕訳を何行だけ見せるか */
  previewRows?: number;
  /**
   * お店の区分でしぼって渡しているか（kp234）。
   * ★しぼり込みそのものは呼ぶ側で行います（lib/keiri/shopScope.ts の filterReportsByShop）。
   *   ここに渡すのは「しぼった」ことを断り書きに出すためだけです。
   */
  shopFilter?: string | null;
  /**
   * 金庫を数えた記録と、銀行に入れた記録（kp233・f1-4）。
   * ★渡さなければ今までどおり（期首の金額を「最後に数えた額」として出す）。
   *   棚がまだ無い倉庫でも1枚は今までと同じ数字で出ます。
   */
  cashEvents?: CashEvent[];
  /**
   * 「同じ支払いが2か所にある」ときに、どちらを数えるかを人が決めた印（kp230・f1-5）。
   * ★渡さなければ印なし＝**いままでとまったく同じ1枚**になります。
   *   印があるときは、月の経費・利益がその分だけ下がり、
   *   「確かめてほしいこと」から**決めた組が外れます**。
   */
  ignoreMarks?: IgnoreMarks;
};

/** 日本時間の今日（YYYY-MM-DD）。置いてあるサーバーの時計は日本時間ではないため */
function jstToday(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 「2026-10-04」→「10月4日」（読む人のための書き方） */
export function sheetDayLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  if (!m) return String(date ?? "");
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/**
 * 1枚の要約を組み立てる。
 *
 * ★計算はしない。**本物と同じ関数に計算させて、並べ替えるだけ**。
 */
export function buildOneSheet(input: OneSheetInput): MonthlySample {
  const {
    ym,
    monthLabel,
    shopName,
    reports,
    payments,
    advances,
    settings,
    template,
    currentYm = ym,
    madeOn = jstToday(),
    previewRows = SAMPLE_JOURNAL_PREVIEW_ROWS,
    shopFilter = null,
    cashEvents = [],
    ignoreMarks,
  } = input;

  const summary = summarizeMonth({ ym, reports, template, settings, advances, ignoreMarks });
  // 銀行に入れた分は**現金だけ**を減らす（経費・利益には1円も入れない・kp233）
  const cash = calcCashPosition({
    reports,
    payments,
    settings,
    advances,
    deposits: depositsOf(cashEvents),
  });
  // 「最後に実際に数えた日」は、金庫を数えた記録があればそちらが正。
  // 無ければ今までどおり期首（数え始めの日）を出す。
  /**
   * その月の終わりの時点の現金（試算表の「現金」と突き合わせるため・kp243）。
   * 上の `cash` は**今日まで**を数えた額なので、終わった月の試算表と並べると
   * 足し算が合いません。だから月末で切った額を別に出します。
   */
  const cashAtMonthEnd = calcCashPosition({
    reports,
    payments,
    settings,
    advances,
    deposits: depositsOf(cashEvents),
    asOf: monthEnd(ym),
  });
  const counted = latestCount(cashEvents);
  const unpaid = calcUnpaid({ reports, payments, settings, currentYm, advances });

  const merged = mergedExpenseByAccount(summary.expenseByAccount);
  // ★かかったお金の中身は「金額の大きい順」（店主がまず見たいのは重い科目）
  const expenses: SampleLine[] = DISPLAY_EXPENSE_ACCOUNTS.map((a) => ({
    label: a.label,
    yen: merged[a.key] ?? 0,
  }))
    .filter((e) => e.yen > 0)
    .sort((a, b) => b.yen - a.yen);

  // ★CSV（仕訳）も、画面と同じ印を見る。見ないと3通りの数え方がずれて1枚が出せない
  const rows = buildJournalRows({
    ym,
    reports,
    payments,
    template,
    settings,
    advances,
    ignoreMarks,
  });

  // ★月の経費を、別々の道で3通り数える（f1-2）。
  //   ここで数え直すのは「同じ数字になっているか」をページの上で見せるためで、
  //   正しい合計は summary.expenseTotal の1つだけです（kp218）。
  const byAccountTotal = DISPLAY_EXPENSE_ACCOUNTS.reduce(
    (sum, a) => sum + (merged[a.key] ?? 0),
    0,
  );
  const csvTotal = journalExpenseTotal(rows);
  const expenseCheck: SampleExpenseCheck = {
    screen: summary.expenseTotal,
    byAccount: byAccountTotal,
    csv: csvTotal,
    same: summary.expenseTotal === byAccountTotal && summary.expenseTotal === csvTotal,
  };

  // ---- 試算表（会計ソフト・税理士さん用。f1-7）----
  //   ★仕訳の行だけから作ります。日報を数え直すと、CSVと試算表が別々に育つため。
  const trial = buildTrialBalance(rows);
  const trialCheck = checkTrialBalance({
    trial,
    sales: summary.sales,
    expenseTotal: summary.expenseTotal,
    profit: summary.profit,
    yen: sheetYen,
  });

  // 試算表の「現金」が、画面の現金と5万円ちがって見える所の説明（kp243・B2 の材料のまま）
  const sameAsNow = cashAtMonthEnd.balance === cash.balance;
  const cashNote = trialBalanceCashNote({
    trial,
    cashBalance: cashAtMonthEnd.balance,
    balanceLabel: sameAsNow ? "いま手元にある現金" : "この月の終わりの現金",
    yen: sheetYen,
  });

  // ---- まだ払っていないお金（相手ごと）----
  const unpaidLines: SampleLine[] = [
    { label: "日当（まだ払っていない分）", yen: unpaid.payroll },
    { label: "家賃（まだ払っていない分）", yen: unpaid.rent },
    { label: "外注費（まだ払っていない分）", yen: unpaid.outsourcing },
    { label: "立て替えてもらった分（まだ返していない）", yen: unpaid.advance },
  ].filter((l) => l.yen !== 0);

  // ---- 確かめてほしいこと ----
  // ★人が「どちらを数えるか」を決めた組は、確かめてほしいことから外す（kp230）
  const found = findDuplicateExpenses({ ym, reports, advances });
  const dup = ignoreMarks
    ? pendingSuspects(found.suspects, ignoreMarks)
    : found;
  const duplicate: SampleDuplicate | null =
    dup.suspects.length > 0
      ? {
          count: dup.suspects.length,
          sameMonthYen: dup.doubleCountedTotal,
          crossMonthYen: dup.crossMonthTotal,
          expenseAfter: summary.expenseTotal - dup.doubleCountedTotal,
          profitAfter: summary.profit + dup.doubleCountedTotal,
        }
      : null;

  const unmatched = summary.unmatched.map((u) => ({
    date: u.date,
    description: u.description,
    amount: u.amount,
  }));

  const review: SampleReview = {
    unmatched,
    duplicate,
    noReceiptCount: countExpensesWithoutReceipt(reports, ym),
    any: false,
  };
  review.any =
    review.unmatched.length > 0 ||
    review.duplicate !== null ||
    (review.noReceiptCount ?? 0) > 0;

  // ---- 出す前の検算（3つとも合わなければ1枚を出さない）----
  const unpaidSum = unpaidLines.reduce((s, l) => s + l.yen, 0);
  const problems: string[] = [];
  if (!expenseCheck.same) {
    problems.push(
      `かかったお金の数え方が3か所でそろっていません（画面 ${sheetYen(
        expenseCheck.screen,
      )}／科目ごと ${sheetYen(expenseCheck.byAccount)}／会計ソフトに渡す表 ${sheetYen(
        expenseCheck.csv,
      )}）。`,
    );
  }
  if (summary.sales - summary.expenseTotal !== summary.profit) {
    problems.push("「売上 − かかったお金 ＝ 残ったお金」が合っていません。");
  }
  if (unpaidSum !== unpaid.total) {
    problems.push(
      `まだ払っていないお金の内訳（${sheetYen(unpaidSum)}）と合計（${sheetYen(
        unpaid.total,
      )}）が合っていません。`,
    );
  }
  // 試算表が合っていないときは、その中身をそのまま出す（黙って合わせない）
  for (const p of trialCheck.problems) problems.push(p);

  // ---- どのお店の日報を数えたか（kp234・f1-5）----
  //   ★合計の数字は1円も変えません。「何を数えているか」を出すだけです。
  const scope = summarizeShopScope(reports, ym);
  const scopeLabel = shopScopeSentence({
    shops: scope.shops,
    reportCount: scope.reportCount,
  });
  const scopeNotes = shopScopeNotes({
    shopName,
    shops: scope.shops,
    filtered: !!String(shopFilter ?? "").trim(),
  });

  const verify: SampleVerify = {
    expenseOk: expenseCheck.same,
    profitOk: summary.sales - summary.expenseTotal === summary.profit,
    unpaidOk: unpaidSum === unpaid.total,
    trialOk: trialCheck.ok,
    ok: problems.length === 0,
    problems,
  };

  return {
    monthLabel,
    shopName,
    title: `${shopName ? `${shopName}　` : ""}${monthLabel}のまとめ`,
    madeOnLabel: `${sheetDayLabel(madeOn)}に作りました・日報${summary.reportCount}件から`,
    headline: [
      { label: "売上", yen: summary.sales },
      { label: "かかったお金", yen: summary.expenseTotal },
      { label: "残ったお金（利益）", yen: summary.profit },
    ],
    profitLine: `売上 ${sheetYen(summary.sales)} − かかったお金 ${sheetYen(
      summary.expenseTotal,
    )} ＝ 残ったお金 ${sheetYen(summary.profit)}`,
    expenses,
    journalHeaders: JOURNAL_HEADERS,
    journalRows: rows.slice(0, previewRows).map((r) => ({
      date: r.date,
      debitAccount: r.debitAccount,
      debitAmount: r.debitAmount,
      creditAccount: r.creditAccount,
      creditAmount: r.creditAmount,
      note: r.note,
    })),
    journalRowCount: rows.length,
    trial,
    trialCheck,
    trialCashNote: cashNote ? cashNote.text : null,
    mfColumnCount: MF_HEADERS.length,
    yayoiColumnCount: YAYOI_HEADERS.length,
    expenseTotal: summary.expenseTotal,
    expenseBreakdown: [
      { label: "レジのお金から出た分", yen: summary.expenseFromRegister },
      { label: "誰かが立て替えた分", yen: summary.expenseFromAdvance },
      { label: "人件費（日当）", yen: summary.payroll },
      { label: "家賃（事務所）", yen: summary.rent },
      { label: "外注費", yen: summary.outsourcing },
    ].filter((e) => e.yen > 0),
    expenseCheck,
    cash: {
      balance: cash.balance,
      countedOn: counted ? counted.happened_on : cash.openingDate,
      countedYen: counted ? counted.amount : cash.openingBalance,
      // 現金の数え方（kp233・f1-4）。★ここでも金額は作らず、cash の中身を並べるだけ
      ruleLines: cashRuleLines({
        openingDate: cash.openingDate,
        openingBalance: cash.openingBalance,
        sales: cash.sales,
        expensesCash: cash.expenseMeans.cash,
        paid: cash.paid,
        advancesSettled: cash.advancesSettled,
        deposits: cash.deposits,
        balance: cash.balance,
      }),
      notFromSafe: notFromSafeSentence({
        advance: cash.expenseMeans.advance,
        advanceCount: cash.expenseMeans.advanceCount,
        noncash: cash.expenseMeans.noncash,
        noncashCount: cash.expenseMeans.noncashCount,
      }),
      advanceCount: cash.expenseMeans.advanceCount,
      noncashCount: cash.expenseMeans.noncashCount,
    },
    unpaid: { total: unpaid.total, lines: unpaidLines },
    review,
    verify,
    unmatched,
    reportCount: summary.reportCount,
    scopeLabel,
    scopeShops: scope.shops,
    scopeNotes,
  };
}

/**
 * レシートの写真が無い支払いの件数。
 *
 * ★写真の有無が**読めないデータ**のときは null を返します（画面はこの行を出しません）。
 *   倉庫の軽い見え方（keiri_reports）は写真の住所の欄そのものを抜いているので、
 *   そこを通って来たデータでは「無い」のか「分からない」のか区別できません。
 *   分からないものを「0件」と書くと、**写真が1枚も無い月を「全部そろっている」**と
 *   見せてしまいます（2026-10-04・f1-5）。
 */
function countExpensesWithoutReceipt(
  reports: KeiriReport[],
  ym: string,
): number | null {
  let known = false;
  let missing = 0;
  for (const r of reports) {
    if (!String(r.date ?? "").startsWith(ym)) continue;
    for (const item of expenseItemsOf(r.expenses)) {
      if (!("receipt_image_url" in (item as object))) continue;
      known = true;
      if (!item.receipt_image_url) missing += 1;
    }
  }
  return known ? missing : null;
}

/** 金額の表示（「82,000円」）。マイナスは「−1,200円（赤字）」と書く */
export function sheetYen(yen: number): string {
  const n = Math.round(yen);
  const abs = Math.abs(n).toLocaleString("ja-JP");
  return n < 0 ? `−${abs}円（赤字）` : `${abs}円`;
}
