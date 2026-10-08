"use client";

/**
 * 経理（けいり）画面。管理者だけが見られます。
 *
 * ★設計は docs/keiri.md。計算は lib/keiri/ にまとめてあり、この画面は
 *   「読み込む → 呼び出す → 並べる」だけです（別の業態にも使い回せるように）。
 *
 * ★既存の日報・シフト・LINE通知の仕組みには一切さわっていません。
 *   読み取るだけです（keiri_reports ビュー＝日報からレシート写真を抜いた見え方）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { supabase } from "@/lib/supabase";
import {
  businessCodeForScope,
  tenantStamp,
  type TenantScope,
} from "@/lib/tenantScope";
import { yen, slashDate, todayStr } from "@/lib/format";
import AdminGate from "@/app/components/AdminGate";
import { keiriLoginNoScriptHtml } from "@/lib/keiri/noscriptFallback";
import {
  DISPLAY_EXPENSE_ACCOUNTS,
  buildJournalRows,
  calcCashPosition,
  calcUnpaid,
  type CashPosition,
  defaultSettingsFor,
  expenseSlices,
  mergedExpenseByAccount,
  isTenantBusinessCode,
  monthEnd,
  monthKey,
  outsourcingAccountLabelFor,
  outsourcingLabelFor,
  findDuplicateExpenses,
  locationProfitBridge,
  locationProfitBridgeLine,
  summarizeByLocation,
  summarizeMonth,
  templateFor,
  toCsv,
} from "@/lib/keiri";
import {
  encodeCsv,
  moneyForwardFileName,
  toMoneyForwardCsv,
  type CsvEncoding,
} from "@/lib/keiri/moneyforward";
import { toYayoiCsv, yayoiFileName } from "@/lib/keiri/yayoi";
import {
  buildTrialBalance,
  checkTrialBalance,
  trialBalanceCashNote,
  trialBalanceToCsv,
} from "@/lib/keiri/trialBalance";
import { loadKeiriMonth } from "@/lib/keiri/loadMonth";
import { readAuthedKeiriScope } from "@/lib/keiri/readSource";
import {
  cashRuleLines,
  depositsOf,
  latestCount,
  monthDay,
  notFromSafeSentence,
  reconcileCash,
  reconcileLines,
  type CashEvent,
} from "@/lib/keiri/cashCheck";
import { shopScopeSentence } from "@/lib/keiri/shopScope";
import {
  PAYMENT_KIND_LABEL,
  type KeiriPayment,
  type KeiriAdvance,
  type KeiriReport,
  type KeiriSettings,
  type PaymentKind,
} from "@/lib/keiri";

/**
 * この画面が扱う業態。
 *
 * ★2026-09-18（kp35）まで "tebaya" 固定でした。経理パッケージを他のお店に売ると、
 *   そのお店の画面に手羽屋の売上が出てしまうため、
 *   「いまどのお店として開いているか」（lib/tenantScope.ts）から決めるようにしました。
 *   **手羽屋は印が空なので、いままでどおり "tebaya" になります。**
 */

/** ドーナツグラフの色（科目の並び順に対応） */
const SLICE_COLORS = [
  "#f97316", // 仕入（材料）
  "#0ea5e9", // 出店料
  "#8b5cf6", // 家賃（事務所）
  "#14b8a6", // 人件費
  "#a855f7", // 外注費（Alpha）
  "#eab308", // 車両費
  "#ec4899", // 消耗品費
  "#64748b", // 通信費
  "#94a3b8", // 雑費
];

type Tab = "table" | "chart" | "location";

export default function KeiriPage() {
  return (
    <>
      {/* ★JavaScript が動かない端末への逃げ道（2026-09-26・B）。
          この画面は中身をぜんぶ画面側で描くので、JavaScript が動かないと
          題名だけのページで終わり、連絡する先も出ない。
          **お金を払ったお店が毎日開く画面**なので、そこで詰まると
          「払ったのに使えない・どこに言えばいいか分からない」になる。
          初回設定（/keiri/welcome・kp180）とお申し込み（/keiri/apply）には
          先に同じ逃げ道があり、**入室の画面だけ抜けていた**。
          中身は lib/keiri/noscriptFallback.ts の1か所で作る。
          <noscript> は JavaScript が動く端末には1ピクセルも出ないので、
          ふだんの見た目は1文字も変わらない。 */}
      <noscript dangerouslySetInnerHTML={{ __html: keiriLoginNoScriptHtml() }} />
      {/* ★申し込んだお店も、自分の合言葉で入れる画面（kp39）。
          手羽屋の入り方はこれまでどおり（app/components/AdminGate.tsx） */}
      <AdminGate allowShops>
        <KeiriInner />
      </AdminGate>
    </>
  );
}

/**
 * いま開いているお店の業態コードを返す。
 * 手羽屋（印が空）のときは "tebaya" ＝ いままでどおり。
 */
function currentBusinessCode(): string {
  return businessCodeForScope(readAuthedKeiriScope());
}

function KeiriInner() {
  const now = new Date();
  // いまどのお店として開いているか（null＝手羽屋。手羽屋は今までどおり）
  // ★どのお店の帳簿を読む／書くかは「入室の印」だけで決める（kp239・f3-4）。
  //   端末の控え（localStorage）は日報の印のための物で、入室の印と食い違うことがあり、
  //   空のときに手羽屋と見なされて、お店の画面に手羽屋の数字が出ていた。
  //   手羽屋は印を持たないので、ここは今までどおり null（＝1行も変わらない）。
  const scope = useMemo(() => readAuthedKeiriScope(), []);
  const BUSINESS_CODE = useMemo(() => businessCodeForScope(scope), [scope]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>("table");

  const [settings, setSettings] = useState<KeiriSettings | null>(null);
  const [reports, setReports] = useState<KeiriReport[]>([]);
  const [payments, setPayments] = useState<(KeiriPayment & { id: number })[]>([]);
  /**
   * 立替（誰かが自分のお金で先に払った経費）。
   * ★月の経費は「立替も含めた全部」で1つに決めています（kp218）。
   */
  const [advances, setAdvances] = useState<KeiriAdvance[]>([]);
  // 金庫を数えた記録・銀行に入れた記録（kp233・f1-4）。
  // ★棚（keiri_cash_events）がまだ無い倉庫では空のまま＝この画面は今までどおり。
  const [cashEvents, setCashEvents] = useState<CashEvent[]>([]);
  const [cashShelfMissing, setCashShelfMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * そのお店ぶんの「設定の行」が見つからなかったか。
   * 見つからないと、数え始めの日・手元の現金・家賃・外注費の率が分かりません。
   * ★手羽屋には起きません（'tebaya' の行は必ずあります）。
   */
  const [settingsMissing, setSettingsMissing] = useState(false);

  /**
   * 設定が読めなかったときに使う値。
   * 手羽屋はこれまでどおり手羽屋の決めごと、
   * 申し込んだお店は**決めごとを1つも持たない値**（家賃0円・外注費0%）。
   * ここを手羽屋の値のままにすると、よそのお店の経費に
   * 払っていない家賃35,000円と売上の10%が出てしまいます。
   */
  const fallbackSettings = useMemo(
    () => defaultSettingsFor(BUSINESS_CODE),
    [BUSINESS_CODE],
  );

  /** 外注先の呼び名（手羽屋は「Alpha」、申し込んだお店は「外注費」） */
  const outsourcingLabel = useMemo(
    () => outsourcingLabelFor(BUSINESS_CODE),
    [BUSINESS_CODE],
  );

  /** 「科目ごとの表」に出す外注費の科目名（手羽屋は「外注費（Alpha）」のまま） */
  const outsourcingAccountLabel = useMemo(
    () => outsourcingAccountLabelFor(BUSINESS_CODE),
    [BUSINESS_CODE],
  );

  const ym = monthKey(year, month);
  const template = useMemo(() => templateFor(BUSINESS_CODE), [BUSINESS_CODE]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ★読む手順は lib/keiri/loadMonth.ts の1か所にまとめてあります（2026-10-04・kp231）。
      //   実際のお店にお渡しする1枚（/keiri/monthly）も同じ関数を通るので、
      //   どちらかだけ数字が変わることがありません。読み方は1行も変えていません。
      const data = await loadKeiriMonth({
        ym,
        scope,
        businessCode: BUSINESS_CODE,
        fallbackSettings,
      });
      setSettingsMissing(data.settingsMissing);
      setSettings(data.settings);
      setReports(data.reports);
      setPayments(data.payments);
      setAdvances(data.advances);
      setCashEvents(data.cashEvents);
      setCashShelfMissing(data.cashShelfMissing);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [ym, scope, BUSINESS_CODE, fallbackSettings]);

  useEffect(() => {
    load();
  }, [load]);

  const effective = settings ?? fallbackSettings;

  const summary = useMemo(
    () => summarizeMonth({ ym, reports, template, settings: effective, advances }),
    [ym, reports, template, effective, advances],
  );

  // 銀行に入れた分は**現金だけ**を減らす（経費・利益には入れない・kp233）
  const deposits = useMemo(() => depositsOf(cashEvents), [cashEvents]);

  const cash = useMemo(
    () =>
      calcCashPosition({ reports, payments, settings: effective, advances, deposits }),
    [reports, payments, effective, advances, deposits],
  );

  /**
   * 金庫を数えた記録との突き合わせ（kp233・f1-4）。
   *
   * ★今日の計算上の残高を、2週間前に数えた金額と比べても意味がないので、
   *   **数えた日の時点の計算上の残高**（asOf）と比べる。
   */
  const lastCount = useMemo(() => latestCount(cashEvents), [cashEvents]);

  const computedAtCount = useMemo(() => {
    if (!lastCount) return null;
    return calcCashPosition({
      reports,
      payments,
      settings: effective,
      advances,
      deposits,
      asOf: lastCount.happened_on,
    }).balance;
  }, [lastCount, reports, payments, effective, advances, deposits]);

  const reconcile = useMemo(
    () => reconcileCash({ events: cashEvents, computedAtCount, today: todayStr() }),
    [cashEvents, computedAtCount],
  );

  // 家賃は「今月まで」を数えるので、今日の月を渡す
  const todayYm = useMemo(() => todayStr().slice(0, 7), []);

  const unpaid = useMemo(
    () =>
      calcUnpaid({
        reports,
        payments,
        settings: effective,
        currentYm: todayYm,
        advances,
      }),
    [reports, payments, effective, todayYm, advances],
  );

  const byLocation = useMemo(
    () => summarizeByLocation({ ym, reports }),
    [ym, reports],
  );

  /**
   * 場所ごとの利益を足した額と、今月の利益のつなぎ（2026-10-03・kp226-b2）。
   * 場所別の表には立替・外注費・家賃が入っていないので、足すと必ず合いません。
   * その差を式で1行出します（式も金額も lib が出したものをそのまま使う）。
   */
  const locationBridge = useMemo(
    () => locationProfitBridge({ byLocation, summary }),
    [byLocation, summary],
  );

  /**
   * 同じ支払いが「日報の経費」と「立替台帳」の2か所に書かれていないか（2026-10-03・f1-5）。
   * ★見つけても金額は直しません。直すかどうかは人が決めることなので、ここでは出すだけです。
   *   立替は前の月のぶんも渡します（台帳は 8/28・日報は 9/12 のような書き方を拾うため）。
   */
  const duplicates = useMemo(
    () => findDuplicateExpenses({ ym, reports, advances }),
    [ym, reports, advances],
  );

  const slices = useMemo(() => expenseSlices(summary), [summary]);
  // 表に出す金額。「人件費（当日払い）」は「人件費」の行にまとめる（docs/keiri.md 3-3）
  const mergedExpense = useMemo(
    () => mergedExpenseByAccount(summary.expenseByAccount),
    [summary],
  );

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  /**
   * この月の仕訳（会計ソフトに渡す行）。**書き出しはぜんぶここ1つを使う。**
   *
   * ★ここに advances（立替）を渡し忘れると、
   *   画面の「かかったお金」には立替が入っているのに、
   *   **書き出したCSVからは立替がまるごと落ちます**（2026-10-07・f1-7 で見つけた）。
   *   そうならないように、書き出し3つ（ふつう・MF・弥生）と試算表が
   *   同じこの1つを見るようにしてあります。
   */
  const journalRows = useMemo(
    () =>
      buildJournalRows({
        ym,
        reports,
        payments,
        template,
        settings: effective,
        advances,
      }),
    [ym, reports, payments, template, effective, advances],
  );

  /** 試算表（科目ごとの借方・貸方の合計）。CSVと同じ仕訳から作る */
  const trial = useMemo(() => buildTrialBalance(journalRows), [journalRows]);
  const trialCheck = useMemo(
    () =>
      checkTrialBalance({
        trial,
        sales: summary.sales,
        expenseTotal: summary.expenseTotal,
        profit: summary.profit,
      }),
    [trial, summary],
  );

  /**
   * 試算表の「現金」と、上の「今の現金」がちがって見える所の説明（kp243・f1-7）。
   * ★試算表はその月に動いた分だけ、上の数字は今日までの額。
   *   だから比べる相手は**その月の終わりの時点の現金**にする（asOf で切る）。
   */
  const cashAtMonthEnd = useMemo(
    () =>
      calcCashPosition({
        reports,
        payments,
        settings: effective,
        advances,
        deposits,
        asOf: monthEnd(ym),
      }).balance,
    [reports, payments, effective, advances, deposits, ym],
  );

  const trialCashNote = useMemo(
    () =>
      trialBalanceCashNote({
        trial,
        cashBalance: cashAtMonthEnd,
        balanceLabel:
          cashAtMonthEnd === cash.balance ? "今の現金" : "この月の終わりの現金",
      }),
    [trial, cashAtMonthEnd, cash.balance],
  );

  const downloadCsv = () => {
    const rows = journalRows;
    const blob = new Blob([toCsv(rows)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keiri_${ym}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * マネーフォワード クラウド会計に読み込ませる形（27列）で書き出す。
   * 文字コードは2つあるので、取り込めたほうを使ってもらう。
   */
  const downloadMoneyForwardCsv = async (encoding: CsvEncoding) => {
    const rows = journalRows;
    const bytes = await encodeCsv(toMoneyForwardCsv(rows), encoding);
    const blob = new Blob([bytes], {
      type: encoding === "utf8" ? "text/csv;charset=utf-8;" : "text/csv;charset=shift_jis;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = moneyForwardFileName(ym, encoding);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * 弥生会計（やよいの青色申告を含む）の仕訳日記帳インポート用のCSVを書き出す。
   *
   * 弥生には「この列は何ですか」と選ぶ画面が無く、25列ぴったりに決まっている。
   * 見出し行は付けず、文字コードは Shift-JIS で出す（lib/keiri/yayoi.ts）。
   */
  const downloadYayoiCsv = async () => {
    const rows = journalRows;
    const bytes = await encodeCsv(toYayoiCsv(rows), "shift_jis");
    const blob = new Blob([bytes], { type: "text/csv;charset=shift_jis;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = yayoiFileName(ym);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** 試算表を4列のCSVで書き出す（税理士さんに渡す用） */
  const downloadTrialCsv = () => {
    const blob = new Blob([trialBalanceToCsv(trial)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keiri_shisanhyo_${ym}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const ratePct = Math.round(effective.outsourcing_rate * 1000) / 10;

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">🧮 経理</h1>
        <div className="flex gap-2">
          <Link href="/keiri/help" className="btn-secondary text-sm">
            ❓ 困ったとき
          </Link>
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
          <Link href="/admin" className="btn-secondary text-sm">
            管理者ページ
          </Link>
        </div>
      </header>

      {/* 月の切り替え */}
      <div className="card flex items-center justify-between">
        <button className="btn-secondary text-sm" onClick={() => shiftMonth(-1)}>
          ← 前の月
        </button>
        <div className="text-xl font-bold text-brand-dark">
          {year}年{month}月
        </div>
        <button className="btn-secondary text-sm" onClick={() => shiftMonth(1)}>
          次の月 →
        </button>
      </div>

      {error && (
        <p className="card bg-red-50 text-red-700 border border-red-200 text-sm">
          読み込みに失敗しました：{error}
        </p>
      )}
      {loading && <p className="text-stone-500 text-sm px-1">読み込み中…</p>}

      {/*
        お店の設定が読めなかったときのお知らせ。
        黙って別の値で計算すると、こちらが数字を作ったことになるので、
        読めていないことをそのまま出します。
      */}
      {settingsMissing && !loading && isTenantBusinessCode(BUSINESS_CODE) && (
        <p className="card bg-amber-50 text-amber-800 border border-amber-200 text-sm leading-relaxed">
          お店の設定（数え始めの日・その日の手元の現金）が、まだ読めていません。
          家賃や外注費のような「毎月決まって出ていくお金」は
          <strong>0円として計算しています</strong>（こちらで金額を作りません）。
          下の「⚙️ 設定」から入れるか、「❓ 困ったとき」からご一報ください。
        </p>
      )}

      {/* 上段：大きな3つの数字 */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BigNumber
          title="今月の利益"
          value={summary.profit}
          signed
          color={summary.profit >= 0 ? "text-emerald-600" : "text-red-600"}
          note={`売上 ${yen(summary.sales)} − 経費 ${yen(summary.expenseTotal)}`}
        />
        <BigNumber
          title="今の現金"
          value={cash.balance}
          color="text-brand-dark"
          note={`${slashDate(cash.openingDate)} の ${yen(
            cash.openingBalance,
          )} から数えた今の手元`}
        />
        <BigNumber
          title="まだ払っていないお金"
          value={unpaid.total}
          color="text-amber-600"
          note={`給与 ${yen(unpaid.payroll)}・${outsourcingLabel} ${yen(
            unpaid.outsourcing,
          )}・家賃 ${yen(unpaid.rent)}・まだ返していない立替 ${yen(unpaid.advance)}`}
        />
      </section>

      {/* 現金の数え方（2026-10-08・kp233・f1-4）。
          ★「計算上の現金」が人によって何通りにも読めてしまうと、
            金庫を数えても出てきた差が何の差なのか分かりません。
            そこで足し引きの1行1行を、いつでも見えるところに出します。 */}
      <CashRuleCard cash={cash} />

      {/* タブ */}
      <div className="flex gap-2">
        <TabButton active={tab === "table"} onClick={() => setTab("table")}>
          科目ごとの表
        </TabButton>
        <TabButton active={tab === "chart"} onClick={() => setTab("chart")}>
          グラフ
        </TabButton>
        <TabButton active={tab === "location"} onClick={() => setTab("location")}>
          場所別
        </TabButton>
      </div>

      {tab === "table" && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold text-brand-dark">
            {year}年{month}月の科目ごとの金額
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-stone-200">
                  <td className="py-2 font-bold">売上高</td>
                  <td className="py-2 text-right font-bold tabular-nums">
                    {yen(summary.sales)}
                  </td>
                </tr>
                {DISPLAY_EXPENSE_ACCOUNTS.map((a) => (
                  <tr key={a.key} className="border-b border-stone-100">
                    <td className="py-2 pl-3 text-stone-700">
                      {a.key === "outsourcing" ? outsourcingAccountLabel : a.label}
                      {/*
                        率や家賃が 0 のときは「（売上高の0%・自動計算）」と
                        書かない。決めごとが無いだけなのに、
                        「0%と決まっている」ように読めてしまうため。
                      */}
                      {a.key === "outsourcing" && effective.outsourcing_rate > 0 && (
                        <span className="text-xs text-stone-400">
                          （売上高の{ratePct}%・自動計算）
                        </span>
                      )}
                      {a.key === "payroll" && (
                        <span className="text-xs text-stone-400">
                          （日報の日当の合計
                          {summary.payrollDaily > 0 && (
                            <>／うち当日払い {yen(summary.payrollDaily)}</>
                          )}
                          ）
                        </span>
                      )}
                      {a.key === "rent" && effective.monthly_rent > 0 && (
                        <span className="text-xs text-stone-400">
                          （毎月 {yen(effective.monthly_rent)}・自動計算）
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {yen(mergedExpense[a.key])}
                    </td>
                  </tr>
                ))}
                <tr className="border-b-2 border-stone-300">
                  <td className="py-2 font-bold">経費合計</td>
                  <td className="py-2 text-right font-bold tabular-nums">
                    {yen(summary.expenseTotal)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-bold text-base">利益</td>
                  <td
                    className={`py-3 text-right font-bold text-base tabular-nums ${
                      summary.profit >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {yen(summary.profit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-400">
            集計は日報の「営業日」で数えています（入力した日時ではありません）。
            対象の日報：{summary.reportCount}件
          </p>
          {/* ★どのお店の日報を数えているか（kp234・f1-5）。
               件数だけでは、手羽屋ともも屋が混ざっていても気づけません。
               数字は1円も変えていません（内訳を出すだけ）。 */}
          <p className="text-xs text-stone-500 leading-relaxed">
            {shopScopeSentence({
              shops: summary.shops,
              reportCount: summary.reportCount,
            })}
            {summary.shops.length > 1 && (
              <>
                （
                {summary.shops
                  .map((s) => `${s.shop} 売上 ${yen(s.sales)}`)
                  .join("／")}
                ）お店ごとに分けた1枚は「毎月お渡しする1枚」で選べます。
              </>
            )}
          </p>

          {/* ★月の経費は「立替も含めた全部」で1つ（2026-10-02・kp218）。
               金庫から出た分も見たい数字なので、内訳として残す。 */}
          <p className="text-xs text-stone-500 leading-relaxed">
            経費 {yen(summary.expenseTotal)} の内訳：レジのお金から出た分{" "}
            {yen(summary.expenseFromRegister)}／立替（誰かが先に払った分・今月ぶん全部）{" "}
            {yen(summary.expenseFromAdvance)}
            {summary.advanceCount > 0 && <>（{summary.advanceCount}件）</>}／日当{" "}
            {yen(summary.payroll)}／{outsourcingLabel} {yen(summary.outsourcing)}／家賃{" "}
            {yen(summary.rent)}。
            <br />
            立て替えた日には金庫からお金が出ていないので、返すまでは「まだ払っていないお金」に
            出ます（返した日に現金から引きます）。
          </p>

          {/* ★同じ支払いが2か所に書かれていないか（2026-10-03・f1-5）。
               9月の実データでは、立替台帳の9月の行のうち 90,571円 が
               9/12 の日報の経費行と金額までそのまま一致していた（同じ支払いが2か所）。
               **金額は直さない。**どちらを消すかは人が決めることなので、ここでは出すだけ。 */}
          {duplicates.suspects.length > 0 && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <p className="font-bold">
                同じ支払いが2か所に書かれている疑い：{duplicates.suspects.length}組
              </p>
              <p className="leading-relaxed">
                日報の「レジから払った経費」と立替台帳の両方に、
                <strong>金額が1円まで同じで、説明に同じ言葉が入っている行</strong>があります。
                同じ支払いなら、どちらか片方を消してください（
                <Link href="/keiri/advances" className="underline font-bold">
                  立替の入り口
                </Link>
                ）。
                {duplicates.doubleCountedTotal > 0 && (
                  <>
                    <br />
                    同じ月の中で重なっている分：
                    <strong>{yen(duplicates.doubleCountedTotal)}</strong>
                    。この月の経費は、この額だけ多く出ているおそれがあります。
                  </>
                )}
                {duplicates.crossMonthTotal > 0 && (
                  <>
                    <br />
                    月をまたいで重なっている分：
                    <strong>{yen(duplicates.crossMonthTotal)}</strong>
                    。どちらの月の経費にするかで、この額が動きます。
                  </>
                )}
              </p>
              <ul className="space-y-1">
                {duplicates.suspects.slice(0, 8).map((d, i) => (
                  <li key={i} className="tabular-nums">
                    {yen(d.amount)}　日報 {d.report.date}／立替 {d.advance.date}
                    {!d.sameMonth && <>（月をまたいでいます）</>}
                    <br />
                    <span className="text-amber-800">
                      {d.report.description} ／ {d.advance.description}
                    </span>
                  </li>
                ))}
              </ul>
              {duplicates.suspects.length > 8 && (
                <p>…ほか {duplicates.suspects.length - 8}組</p>
              )}
              <p className="text-amber-800">
                ※ 金額が同じだけの別の支払いのこともあります。中身を確かめてから直してください。
                こちらで金額を変えることはしません。
              </p>
            </div>
          )}

          {summary.advanceSkipped.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-bold">
                経費に数えなかった立替：{summary.advanceSkipped.length}件
              </p>
              {summary.advanceSkipped.map((a, i) => (
                <p key={i}>
                  {slashDate(a.date)}　{a.description}　{yen(a.amount)}
                  <br />
                  <span className="text-amber-700">{a.reason}</span>
                </p>
              ))}
            </div>
          )}

          <UnmatchedNote unmatched={summary.unmatched} />
        </section>
      )}

      {tab === "chart" && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold text-brand-dark">
            {year}年{month}月の経費の内訳
          </h2>
          {slices.length === 0 ? (
            <p className="text-sm text-stone-500">この月の経費はまだありません。</p>
          ) : (
            <div className="h-80">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="45%"
                    outerRadius="75%"
                    paddingAngle={2}
                  >
                    {slices.map((s, i) => (
                      <Cell
                        key={s.key}
                        fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => yen(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-xs text-stone-400">
            経費合計 {yen(summary.expenseTotal)}（人件費・外注費を含む）
          </p>
        </section>
      )}

      {tab === "location" && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold text-brand-dark">
            {year}年{month}月の出店場所ごとの成績
          </h2>
          {byLocation.length === 0 ? (
            <p className="text-sm text-stone-500">この月の日報はまだありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-stone-500 border-b border-stone-200">
                    <th className="text-left py-2">出店場所</th>
                    <th className="text-right py-2">日数</th>
                    <th className="text-right py-2">売上</th>
                    <th className="text-right py-2">経費</th>
                    <th className="text-right py-2">利益</th>
                  </tr>
                </thead>
                <tbody>
                  {byLocation.map((row) => (
                    <tr key={row.location} className="border-b border-stone-100">
                      <td className="py-2">{row.location}</td>
                      <td className="py-2 text-right tabular-nums">
                        {row.reportCount}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {yen(row.sales)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {yen(row.costTotal)}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums font-semibold ${
                          row.profit >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {yen(row.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {byLocation.length > 0 && (
            <div className="rounded-lg bg-stone-100 px-4 py-3">
              <p className="text-xs text-stone-700 leading-relaxed tabular-nums">
                {locationProfitBridgeLine(locationBridge)}
              </p>
              {!locationBridge.matches && (
                <p className="mt-1 text-xs font-bold text-red-600">
                  場所ごとの利益と今月の利益が、足し引きで合っていません。数え方のどこかがずれています。
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-stone-400">
            「経費」は日報の経費と人件費（日当）の合計です。
            立替・外注費・家賃（事務所）は月ごとに決まるお金なので、
            場所別には入れていません（どの場所のぶんか決められないため）。
            上の式のとおり、その分を引くと今月の利益に合います。
            出店場所が空の日報は「未設定」にまとめています。
          </p>
        </section>
      )}

      {/* 金庫の突き合わせ（2026-10-05・kp233・f1-4）。
          ★棚（keiri_cash_events）がまだ無いあいだは**何も出さない**。
            流す前の本番が今までどおり動くため（kp237 ⑤）。 */}
      {!cashShelfMissing && (
        <CashCountCard
          reconcile={reconcile}
          balanceNow={cash.balance}
          depositsTotal={cash.deposits}
          scope={scope}
          onSaved={load}
        />
      )}

      {/* 毎月お渡しする1枚（2026-10-04・kp231）。
          数字は書き写しません。この画面と同じ計算（lib/keiri/oneSheet.ts）を通ります。 */}
      <section className="card space-y-2">
        <h2 className="text-lg font-bold text-brand-dark">📄 毎月お渡しする1枚</h2>
        <p className="text-sm text-stone-600 leading-relaxed">
          この画面の数字を、お店にお渡しする1枚（印刷して紙1枚）にまとめた形で開きます。
          数字はこの画面とまったく同じ計算から出ています。
        </p>
        <Link href="/keiri/monthly" className="btn-primary w-full block text-center">
          1枚の要約を開く
        </Link>
      </section>

      {/* CSV書き出し */}
      <section className="card space-y-2">
        <h2 className="text-lg font-bold text-brand-dark">📤 CSV書き出し</h2>
        <p className="text-sm text-stone-600 leading-relaxed">
          {year}年{month}月のぜんぶの売上と経費を、会計ソフトが読める形で書き出します。
          Excelで開いても文字化けしません。
        </p>
        <button className="btn-primary w-full" onClick={downloadCsv}>
          この月のCSVをダウンロード
        </button>

        <div className="pt-3 mt-1 border-t border-stone-200 space-y-2">
          <h3 className="text-sm font-bold text-brand-dark">
            マネーフォワード クラウド会計に取り込む場合
          </h3>
          <p className="text-sm text-stone-600 leading-relaxed">
            会計ソフトが読める並び（27列）で書き出します。文字コード（文字の書き表し方）は
            2つあります。まず「UTF-8」を試して、取り込めなければ「Shift-JIS」を使ってください。
            税区分は空にしてあります（税務のことはこのアプリでは決めません）。
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn-secondary text-sm flex-1"
              onClick={() => void downloadMoneyForwardCsv("utf8")}
            >
              MF用CSV（UTF-8）
            </button>
            <button
              className="btn-secondary text-sm flex-1"
              onClick={() => void downloadMoneyForwardCsv("shift_jis")}
            >
              MF用CSV（Shift-JIS）
            </button>
          </div>
        </div>

        <div className="pt-3 mt-1 border-t border-stone-200 space-y-2">
          <h3 className="text-sm font-bold text-brand-dark">
            弥生会計・やよいの青色申告に取り込む場合
          </h3>
          <p className="text-sm text-stone-600 leading-relaxed">
            弥生は取り込むときに「この列は何ですか」と選ぶ画面がなく、並びが25列ぴったりに
            決まっています。そこで弥生専用の形（見出し行なし・Shift-JIS・日付は
            2026/09/01 の形）で書き出します。弥生の［ファイル］→［インポート］から、
            このファイルを選んでください。税区分は空にしてあります
            （税務のことはこのアプリでは決めません）。
          </p>
          <button
            className="btn-secondary text-sm w-full"
            onClick={() => void downloadYayoiCsv()}
          >
            弥生用CSV（25列・Shift-JIS）
          </button>
        </div>
      </section>

      {/* 試算表（税理士さん・会計ソフト用） */}
      <section className="card space-y-2">
        <h2 className="text-lg font-bold text-brand-dark">🧮 試算表</h2>
        <p className="text-sm text-stone-600 leading-relaxed">
          科目（かもく＝お金を仕分ける箱の名前）ごとに「左（借方）にいくら・右（貸方）に
          いくら」を足し上げた表です。税理士さんと会計ソフトが最初に見る表で、
          <span className="font-bold">左と右の合計がぴったり同じ</span>
          なら、帳簿の形が崩れていないしるしです。上のCSVと<span className="font-bold">同じ仕訳</span>
          から作っているので、ここが合っていればCSVも合っています。
        </p>
        {!trialCheck.ok && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-bold text-red-700">
              合っていない所があります（金額はこちらで直しません）
            </p>
            <ul className="mt-1 space-y-1 text-sm text-red-700">
              {trialCheck.problems.map((t) => (
                <li key={t}>・{t}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="text-stone-500 text-xs">
                <th className="px-1 py-1 text-left font-bold whitespace-nowrap">科目</th>
                <th className="px-1 py-1 text-right font-bold whitespace-nowrap">借方合計</th>
                <th className="px-1 py-1 text-right font-bold whitespace-nowrap">貸方合計</th>
                <th className="px-1 py-1 text-right font-bold whitespace-nowrap">残高</th>
              </tr>
            </thead>
            <tbody className="text-stone-700">
              {trial.lines.map((l) => (
                <tr key={l.account} className="border-t border-stone-100">
                  <td className="px-1 py-1 whitespace-nowrap">{l.account}</td>
                  <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                    {yen(l.debit)}
                  </td>
                  <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                    {yen(l.credit)}
                  </td>
                  <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                    {yen(l.balanceAbs)}
                    {l.side !== "なし" && (
                      <span className="ml-1 text-xs text-stone-400">{l.side}</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-300 font-bold">
                <td className="px-1 py-1 whitespace-nowrap">合計</td>
                <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                  {yen(trial.debitTotal)}
                </td>
                <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                  {yen(trial.creditTotal)}
                </td>
                <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">
                  {yen(0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-stone-700 leading-relaxed">
          試算表の売上 {yen(trial.revenueTotal)} − かかったお金 {yen(trial.expenseTotal)} ＝{" "}
          {yen(trial.profit)}
          {trialCheck.ok
            ? "（上の月次まとめの数字と1円まで同じです）"
            : "（上の月次まとめの数字と合っていません）"}
        </p>
        {/* 現金が上の「今の現金」とちがって見える所の説明（kp243・B2 の材料のまま） */}
        {trialCashNote && (
          <p className="text-xs text-stone-600 leading-relaxed">{trialCashNote.text}</p>
        )}
        <button className="btn-secondary text-sm w-full" onClick={downloadTrialCsv}>
          試算表のCSVをダウンロード（4列）
        </button>
        <p className="text-xs text-stone-500 leading-relaxed">
          税区分や税金の計算はしていません（税務のことはこのアプリでは決めません）。
          申告は税理士さんにお願いしてください。
        </p>
      </section>

      {/* 支払いの記録 */}
      <PaymentSection
        payments={payments}
        onSaved={load}
        outsourcingLabel={outsourcingLabel}
        unpaidPayroll={unpaid.payroll}
        unpaidOutsourcing={unpaid.outsourcing}
        unpaidRent={unpaid.rent}
      />

      {/* 設定 */}
      <SettingsSection
        settings={effective}
        onSaved={load}
        outsourcingLabel={outsourcingLabel}
      />
    </main>
  );
}

// ------------------------------------------------------------------
// 部品
// ------------------------------------------------------------------

function BigNumber({
  title,
  value,
  note,
  color,
  signed,
}: {
  title: string;
  value: number;
  note?: string;
  color: string;
  signed?: boolean;
}) {
  const text = signed && value > 0 ? `+${yen(value)}` : yen(value);
  return (
    <div className="card">
      <p className="text-sm font-semibold text-stone-500">{title}</p>
      <p className={`text-3xl font-bold tabular-nums mt-1 ${color}`}>{text}</p>
      {note && <p className="text-xs text-stone-400 mt-1 leading-relaxed">{note}</p>}
    </div>
  );
}

/**
 * 「現金の数え方」をそのまま出すところ（2026-10-08・kp233・f1-4）。
 *
 * ■ なぜ画面に出すのか
 *   同じ9月のデータから「計算上の金庫残高」が3通り（928,010円／126,552円／79,695円）
 *   読めてしまっていました。数え方が決まっていないと、じゅんが金庫を数えても
 *   出てきた「差」が何の差なのか分かりません。
 *   そこで足し引きを1行ずつ出して、**数え方を1つに固定**します。
 *
 * ■ 決めたこと（この画面に書いてあるとおり）
 *   ・金庫は1つとして数える（手羽屋ともも屋を分けない。お金の置き場が1つだから）
 *   ・経費のうち**金庫から出た分だけ**を引く。立替と現金以外（PayPay・プリカなど）は引かない
 */
function CashRuleCard({ cash }: { cash: CashPosition }) {
  const lines = cashRuleLines({
    openingDate: cash.openingDate,
    openingBalance: cash.openingBalance,
    sales: cash.sales,
    expensesCash: cash.expenseMeans.cash,
    paid: cash.paid,
    advancesSettled: cash.advancesSettled,
    deposits: cash.deposits,
    balance: cash.balance,
  });
  const notFromSafe = notFromSafeSentence({
    advance: cash.expenseMeans.advance,
    advanceCount: cash.expenseMeans.advanceCount,
    noncash: cash.expenseMeans.noncash,
    noncashCount: cash.expenseMeans.noncashCount,
  });
  return (
    <section className="card space-y-2">
      <h2 className="text-base font-bold text-brand-dark">💴 現金の数え方</h2>
      <div className="rounded-lg bg-stone-100 px-4 py-3 space-y-1">
        {lines.map((l) => (
          <p key={l} className="text-sm text-stone-800 tabular-nums">
            {l}
          </p>
        ))}
      </div>
      {notFromSafe && (
        <p className="text-xs text-amber-700 leading-relaxed">{notFromSafe}</p>
      )}
      <p className="text-xs text-stone-500 leading-relaxed">
        金庫は1つとして数えています（手羽屋ともも屋を分けません。お金の置き場が1つだからです。
        屋号ごとの売上は「お店の区分」の所に出ています）。
        金額はどれも日報に入っているものをそのまま足し引きしただけで、ここでは作っていません。
      </p>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
        active
          ? "bg-brand text-white shadow"
          : "bg-stone-200 text-stone-700 hover:bg-stone-300"
      }`}
    >
      {children}
    </button>
  );
}

/** 対応表に当たらず雑費に入れた明細のお知らせ（あとから直せるように） */
function UnmatchedNote({
  unmatched,
}: {
  unmatched: { date: string; description: string; amount: number }[];
}) {
  const [open, setOpen] = useState(false);
  if (unmatched.length === 0) {
    return (
      <p className="text-xs text-stone-400">
        ※ この月は、種類が分からずに「雑費」へ入れた経費はありません。
      </p>
    );
  }
  const total = unmatched.reduce((s, u) => s + u.amount, 0);
  return (
    <div className="text-xs text-stone-500 space-y-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="underline hover:text-stone-700"
      >
        ※ 種類が分からず「雑費」に入れた経費：{unmatched.length}件・{yen(total)}
        （{open ? "閉じる" : "中身を見る"}）
      </button>
      {open && (
        <ul className="pl-4 space-y-0.5">
          {unmatched.map((u, i) => (
            <li key={`${u.date}-${i}`}>
              {slashDate(u.date)} {u.description} … {yen(u.amount)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 給与・Alphaに実際に払った記録 */
function PaymentSection({
  payments,
  onSaved,
  unpaidPayroll,
  unpaidOutsourcing,
  unpaidRent,
  outsourcingLabel,
}: {
  payments: (KeiriPayment & { id: number })[];
  onSaved: () => void;
  unpaidPayroll: number;
  unpaidOutsourcing: number;
  unpaidRent: number;
  /** 外注先の呼び名（手羽屋は「Alpha」） */
  outsourcingLabel: string;
}) {
  const [paidOn, setPaidOn] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<PaymentKind>("payroll");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(amount || "0", 10);
    if (!paidOn) return setMsg("❌ 支払日を入れてください");
    if (!n || n <= 0) return setMsg("❌ 金額を入れてください");
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.from("keiri_payments").insert({
      business_type_code: currentBusinessCode(),
      paid_on: paidOn,
      amount: n,
      kind,
      memo: memo.trim() || null,
    });
    setSaving(false);
    if (error) {
      setMsg(`❌ 保存できませんでした：${error.message}`);
      return;
    }
    setAmount("");
    setMemo("");
    setMsg("✅ 記録しました");
    onSaved();
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold text-brand-dark">
        💴 給与・{outsourcingLabel}・家賃に払ったお金の記録
      </h2>
      <p className="text-sm text-stone-600 leading-relaxed">
        月に1回、実際に払ったときにここへ入れてください。
        入れると「今の現金」からその分が引かれ、「まだ払っていないお金」が減ります。
        <br />
        いま残っている未払い：給与 {yen(unpaidPayroll)}・{outsourcingLabel}{" "}
        {yen(unpaidOutsourcing)}・家賃 {yen(unpaidRent)}
      </p>

      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">支払日</label>
          <input
            type="date"
            className="field"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </div>
        <div>
          <label className="label">種別</label>
          <select
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value as PaymentKind)}
          >
            <option value="payroll">{PAYMENT_KIND_LABEL.payroll}</option>
            <option value="outsourcing">{PAYMENT_KIND_LABEL.outsourcing}</option>
            <option value="rent">{PAYMENT_KIND_LABEL.rent}</option>
          </select>
        </div>
        <div>
          <label className="label">金額（円）</label>
          <input
            type="number"
            inputMode="numeric"
            className="field"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例：294200"
          />
        </div>
        <div>
          <label className="label">メモ（任意）</label>
          <input
            type="text"
            className="field"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例：8月分"
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? "保存中…" : "記録する"}
          </button>
        </div>
      </form>
      {msg && <p className="text-sm font-semibold">{msg}</p>}

      {payments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-stone-500 border-b border-stone-200">
                <th className="text-left py-2">支払日</th>
                <th className="text-left py-2">種別</th>
                <th className="text-right py-2">金額</th>
                <th className="text-left py-2">メモ</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-stone-100">
                  <td className="py-2">{slashDate(p.paid_on)}</td>
                  <td className="py-2">{PAYMENT_KIND_LABEL[p.kind]}</td>
                  <td className="py-2 text-right tabular-nums">{yen(p.amount)}</td>
                  <td className="py-2 text-stone-500">{p.memo ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** 数え始めの日・期首残高・Alphaの率の設定 */
function SettingsSection({
  settings,
  onSaved,
  outsourcingLabel,
}: {
  settings: KeiriSettings;
  onSaved: () => void;
  /** 外注先の呼び名（手羽屋は「Alpha」） */
  outsourcingLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [openingDate, setOpeningDate] = useState(settings.opening_date);
  const [openingBalance, setOpeningBalance] = useState(
    String(settings.opening_balance),
  );
  const [ratePct, setRatePct] = useState(
    String(Math.round(settings.outsourcing_rate * 1000) / 10),
  );
  const [rent, setRent] = useState(String(settings.monthly_rent));
  const [rentStart, setRentStart] = useState(settings.rent_start_month);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setOpeningDate(settings.opening_date);
    setOpeningBalance(String(settings.opening_balance));
    setRatePct(String(Math.round(settings.outsourcing_rate * 1000) / 10));
    setRent(String(settings.monthly_rent));
    setRentStart(settings.rent_start_month);
  }, [settings]);

  const save = async () => {
    const bal = parseInt(openingBalance || "0", 10);
    const pct = Number(ratePct);
    const rentN = parseInt(rent || "0", 10);
    if (!openingDate) return setMsg("❌ 数え始めの日を入れてください");
    if (Number.isNaN(bal)) return setMsg("❌ 金額を入れてください");
    if (Number.isNaN(pct) || pct < 0 || pct > 100)
      return setMsg("❌ 率は0〜100の数字で入れてください");
    if (Number.isNaN(rentN) || rentN < 0)
      return setMsg("❌ 家賃は0円以上で入れてください");
    if (rentStart && !/^\d{4}-(0[1-9]|1[0-2])$/.test(rentStart))
      return setMsg("❌ 家賃を数え始める月は「2026-08」の形で入れてください");
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from("keiri_settings")
      .update({
        opening_date: openingDate,
        opening_balance: bal,
        outsourcing_rate: pct / 100,
        monthly_rent: rentN,
        rent_start_month: rentStart || null,
        updated_at: new Date().toISOString(),
      })
      .eq("business_type_code", currentBusinessCode());
    setSaving(false);
    if (error) {
      setMsg(`❌ 保存できませんでした：${error.message}`);
      return;
    }
    setMsg("✅ 保存しました");
    onSaved();
  };

  return (
    <section className="card space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-lg font-bold text-brand-dark"
      >
        ⚙️ 経理の設定 {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-stone-600 leading-relaxed">
            「数え始めの日」は、手元の現金をここから数え直す日です。
            いまは {slashDate(settings.opening_date)} に {yen(settings.opening_balance)}{" "}
            から数えています（7月分の給与を払い終えて残高がちょうど0円になった日）。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">数え始めの日</label>
              <input
                type="date"
                className="field"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">その日の現金（円）</label>
              <input
                type="number"
                inputMode="numeric"
                className="field"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{outsourcingLabel}の率（％）</label>
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                className="field"
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value)}
              />
            </div>
          </div>

          <p className="text-sm text-stone-600 leading-relaxed">
            事務所の家賃は日報には入りません。ここに入れた金額が
            <strong>毎月きまって</strong>科目の表に出ます。
            レジのお金から払ったら、上の「払ったお金の記録」に入れてください。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">事務所の家賃（毎月・円）</label>
              <input
                type="number"
                inputMode="numeric"
                className="field"
                value={rent}
                onChange={(e) => setRent(e.target.value)}
              />
            </div>
            <div>
              <label className="label">家賃を数え始める月</label>
              <input
                type="month"
                className="field"
                value={rentStart}
                onChange={(e) => setRentStart(e.target.value)}
              />
            </div>
          </div>
          <button className="btn-primary w-full" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "設定を保存する"}
          </button>
          {msg && <p className="text-sm font-semibold">{msg}</p>}
        </div>
      )}
    </section>
  );
}

/* ================================================================
 *  金庫を数えた記録と、銀行に入れた記録（kp233・f1-4）
 *
 *  ■ なぜ要るのか
 *    「今の現金」はこれまで計算上の値だけで、**実際に数えた相手が無い**ため
 *    合っているかを確かめられませんでした。さらに売上の現金を銀行に入れた記録も
 *    無かったので、計算上の現金は増え続ける一方でした。
 *
 *  ■ 差が出ても黙って合わせない
 *    金額をこちらで直すことはしません。何が足りていないかを言葉で出して、
 *    人に確かめてもらいます（レシートの税込と同じ考え方・CLAUDE.md 4-12）。
 *
 *  ■ 画面の言葉
 *    司令室の材料（meta/keiri-material-kinko-kotoba・B2）をそのまま使っています。
 * ================================================================ */
function CashCountCard({
  reconcile,
  balanceNow,
  depositsTotal,
  scope,
  onSaved,
}: {
  reconcile: ReturnType<typeof reconcileCash>;
  balanceNow: number;
  depositsTotal: number;
  scope: TenantScope;
  onSaved: () => void;
}) {
  const [countOn, setCountOn] = useState(todayStr());
  const [countYen, setCountYen] = useState("");
  const [countNote, setCountNote] = useState("");
  const [depositOn, setDepositOn] = useState(todayStr());
  const [depositYen, setDepositYen] = useState("");
  const [saving, setSaving] = useState<null | "count" | "deposit">(null);
  const [msg, setMsg] = useState("");

  const save = async (kind: "count" | "deposit") => {
    const on = kind === "count" ? countOn : depositOn;
    const raw = kind === "count" ? countYen : depositYen;
    const amount = Number(raw);
    if (!on || !Number.isFinite(amount) || amount < 0 || raw === "") {
      setMsg("日付と金額を入れてください（金額は0以上）");
      return;
    }
    setSaving(kind);
    setMsg("");
    const { error } = await supabase.from("keiri_cash_events").insert({
      kind,
      happened_on: on,
      amount: Math.round(amount),
      note: kind === "count" ? countNote || null : null,
      ...tenantStamp(scope),
    });
    setSaving(null);
    if (error) {
      setMsg(`保存できませんでした：${error.message}`);
      return;
    }
    if (kind === "count") {
      setCountYen("");
      setCountNote("");
    } else {
      setDepositYen("");
    }
    setMsg("✅ 記録しました");
    onSaved();
  };

  const lines = reconcileLines(reconcile);

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold text-brand-dark">🔐 金庫を数えて、合っているか見る</h2>

      {reconcile.neverCounted ? (
        <p className="text-sm text-stone-700 leading-relaxed">{reconcile.verdict}</p>
      ) : (
        <div className="rounded-lg bg-stone-100 px-4 py-3 space-y-1">
          {lines.map((l) => (
            <p key={l} className="text-sm text-stone-800 tabular-nums">
              {l}
            </p>
          ))}
          <p
            className={
              "text-sm font-bold " +
              (reconcile.diff === 0 ? "text-emerald-700" : "text-stone-900")
            }
          >
            {reconcile.verdict}
          </p>
          {reconcile.stale && (
            <p className="text-xs text-amber-700">{reconcile.stale}</p>
          )}
        </div>
      )}

      <p className="text-xs text-stone-500 leading-relaxed">
        いまの計算上の現金は {yen(balanceNow)} です
        {depositsTotal > 0 ? `（うち銀行に入れた ${yen(depositsTotal)} は引いてあります）` : ""}。
        数えた日の時点までで比べているので、数えたあとの売上や支払いは上の差には入りません。
      </p>

      {/* ① 金庫を数えた */}
      <div className="pt-3 border-t border-stone-200 space-y-2">
        <h3 className="text-sm font-bold text-brand-dark">金庫を数えた日</h3>
        <p className="text-xs text-stone-600 leading-relaxed">
          お札と小銭を数えた金額を、そのまま入れてください。月に1回で大丈夫です。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">数えた日</label>
            <input
              type="date"
              className="field"
              value={countOn}
              onChange={(e) => setCountOn(e.target.value)}
            />
          </div>
          <div>
            <label className="label">金庫にあった金額（円）</label>
            <input
              type="number"
              inputMode="numeric"
              className="field"
              value={countYen}
              onChange={(e) => setCountYen(e.target.value)}
              placeholder="例：145000"
            />
          </div>
          <div>
            <label className="label">ひとこと（書かなくてもよい）</label>
            <input
              type="text"
              className="field"
              value={countNote}
              onChange={(e) => setCountNote(e.target.value)}
              placeholder="例：差の理由に心当たりなし"
            />
          </div>
        </div>
        <button
          className="btn-primary w-full"
          onClick={() => void save("count")}
          disabled={saving !== null}
        >
          {saving === "count" ? "保存中…" : "この金額で記録する"}
        </button>
      </div>

      {/* ② 銀行に入れた */}
      <div className="pt-3 border-t border-stone-200 space-y-2">
        <h3 className="text-sm font-bold text-brand-dark">売上を銀行に入れた</h3>
        <p className="text-xs text-stone-600 leading-relaxed">
          金庫から銀行に移した金額を入れてください。利益は変わらず、金庫の現金だけ減ります。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">入れた日</label>
            <input
              type="date"
              className="field"
              value={depositOn}
              onChange={(e) => setDepositOn(e.target.value)}
            />
          </div>
          <div>
            <label className="label">金額（円）</label>
            <input
              type="number"
              inputMode="numeric"
              className="field"
              value={depositYen}
              onChange={(e) => setDepositYen(e.target.value)}
              placeholder="例：300000"
            />
          </div>
        </div>
        <button
          className="btn-secondary w-full"
          onClick={() => void save("deposit")}
          disabled={saving !== null}
        >
          {saving === "deposit" ? "保存中…" : "預け入れを記録する"}
        </button>
      </div>

      {msg && <p className="text-sm font-semibold">{msg}</p>}
      {reconcile.countedOn && (
        <p className="text-xs text-stone-400">
          最後に数えた日：{monthDay(reconcile.countedOn)}
        </p>
      )}
    </section>
  );
}
