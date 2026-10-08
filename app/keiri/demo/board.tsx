"use client";

/**
 * お試し版の中身（/keiri/demo）。
 *
 * ★**データの倉庫（Supabase）にはつなぎません。**
 *   この画面は supabase の部品を1つも読み込みません。
 *   ＝読み書きする道がそもそも無いので、誰が何を入れても保存されず、
 *   本物のお店の数字にも一切触れません。
 *   （tests/keiriDemo.test.ts が「読み込んでいないこと」を見張っています）
 *
 * ★**計算は本物と同じ関数をそのまま呼びます。**
 *   本物の経理画面（app/keiri/page.tsx）が呼んでいる
 *   summarizeMonth / calcCashPosition / calcUnpaid / summarizeByLocation を
 *   そのまま使っています。ここに計算を写し取らないこと
 *   （写すと、本物を直したときにお試し版だけ古い答えを出します）。
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import { yen, slashDate } from "@/lib/format";
import { cashRuleLines, notFromSafeSentence } from "@/lib/keiri/cashCheck";
import {
  buildTrialBalance,
  checkTrialBalance,
  trialBalanceCashNote,
  trialBalanceToCsv,
} from "@/lib/keiri/trialBalance";
import {
  DISPLAY_EXPENSE_ACCOUNTS,
  JOURNAL_HEADERS,
  NEUTRAL_OUTSOURCING_ACCOUNT_LABEL,
  buildJournalRows,
  calcCashPosition,
  calcUnpaid,
  locationProfitBridge,
  monthEnd,
  locationProfitBridgeLine,
  mergedExpenseByAccount,
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
import { GENERIC_TEMPLATE } from "@/lib/keiri/templates/generic";
import {
  DEMO_SHOP_NAME,
  type DemoInput,
  demoInputProblem,
  demoInputToReport,
  demoAdvances,
  demoPayments,
  demoReports,
  demoSettings,
  emptyDemoInput,
  sortDemoReports,
} from "@/lib/keiri/demo";
import type { KeiriReport } from "@/lib/keiri";
import { TRIAL_APPLY_HREF, TRIAL_CTA_LABEL, TRIAL_CTA_NOTE } from "@/lib/keiri/trial";

/** 画面に出す仕訳の行数（全部はファイルに入れる） */
const JOURNAL_PREVIEW = 6;

export default function DemoBoard({ ym, today }: { ym: string; today: string }) {
  const [reports, setReports] = useState<KeiriReport[]>(() => demoReports(ym));
  const [input, setInput] = useState<DemoInput>(() => emptyDemoInput(today));
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState(0);

  const settings = useMemo(() => demoSettings(ym), [ym]);
  const payments = useMemo(() => demoPayments(), []);
  /** 立替（誰かが自分のお金で先に払った経費）。お試し版では2件入れてあります */
  const advances = useMemo(() => demoAdvances(ym), [ym]);
  // 申し込んだお店と同じ「汎用」の対応表を使う（手羽屋だけの言葉は使わない）
  const template = useMemo(() => templateFor(GENERIC_TEMPLATE.code), []);

  const summary = useMemo(
    () => summarizeMonth({ ym, reports, template, settings, advances }),
    [ym, reports, template, settings],
  );
  const cash = useMemo(
    () => calcCashPosition({ reports, payments, settings, advances }),
    [reports, payments, settings],
  );
  /** その月の終わりの時点の現金（試算表の「現金」と突き合わせる相手・kp243） */
  const cashAtMonthEnd = useMemo(
    () =>
      calcCashPosition({ reports, payments, settings, advances, asOf: monthEnd(ym) })
        .balance,
    [reports, payments, settings, ym],
  );
  const unpaid = useMemo(
    () => calcUnpaid({ reports, payments, settings, currentYm: ym, advances }),
    [reports, payments, settings, ym],
  );
  const byLocation = useMemo(() => summarizeByLocation({ ym, reports }), [ym, reports]);
  /**
   * 場所ごとの利益を足した額と、今月の利益のつなぎ（2026-10-03・kp226-b2）。
   * ★式も金額もここに書かない。lib（aggregate.ts）が出した文をそのまま出す。
   */
  const bridge = useMemo(
    () => locationProfitBridge({ byLocation, summary }),
    [byLocation, summary],
  );
  const mergedExpense = useMemo(
    () => mergedExpenseByAccount(summary.expenseByAccount),
    [summary],
  );

  /**
   * 会計ソフト用のCSV（仕訳）。
   * ★本物の経理画面（app/keiri/page.tsx）が呼んでいる buildJournalRows を
   *   そのまま呼びます。ここに中身を書き写さないこと
   *   （写すと、本物を直したときにお試し版だけ古い形のCSVを出します）。
   * ★日報を1件足すと、この行が増えます。そこが見どころです。
   */
  const journalRows = useMemo(
    () => buildJournalRows({ ym, reports, payments, template, settings, advances }),
    [ym, reports, payments, template, settings],
  );

  /** いま書き出しているボタンの名前（押されているあいだだけ入る） */
  const [saving, setSaving] = useState<string | null>(null);

  /**
   * ファイルをお使いの端末に作る。
   * ★どこにも送りません。ブラウザの中で作った中身を、そのまま保存するだけです。
   */
  const saveFile = (bytes: BlobPart, fileName: string, type: string) => {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * 試算表（科目ごとの借方・貸方の合計）。**本物の経理画面と同じ関数**に
   * 同じ仕訳を渡して作る（お試し版だけ別の数え方にならないように）。
   */
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

  /** 試算表の「現金」が、上の現金とちがって見える所の説明（kp243・f1-7） */
  const trialCashNote = useMemo(
    () =>
      trialBalanceCashNote({
        trial,
        cashBalance: cashAtMonthEnd,
        balanceLabel:
          cashAtMonthEnd === cash.balance ? "いま手元にある現金" : "この月の終わりの現金",
      }),
    [trial, cashAtMonthEnd, cash.balance],
  );

  /** 「金庫から出ていないので引いていないもの」の1文（当てはまらなければ null） */
  const demoNotFromSafe = useMemo(
    () =>
      notFromSafeSentence({
        advance: cash.expenseMeans.advance,
        advanceCount: cash.expenseMeans.advanceCount,
        noncash: cash.expenseMeans.noncash,
        noncashCount: cash.expenseMeans.noncashCount,
      }),
    [cash],
  );

  /** 試算表のCSV（4列）。これも端末にファイルが1つできるだけ */
  const downloadTrialCsv = () => {
    saveFile(trialBalanceToCsv(trial), `keiri_demo_shisanhyo_${ym}.csv`, "text/csv;charset=utf-8;");
  };

  /** そのまま読める形の仕訳CSV（本物と同じ toCsv） */
  const downloadJournalCsv = () => {
    saveFile(toCsv(journalRows), `keiri_demo_${ym}.csv`, "text/csv;charset=utf-8;");
  };

  /** マネーフォワード クラウド会計の仕訳帳インポートの形（27列・本物と同じ関数） */
  const downloadMoneyForwardCsv = async (encoding: CsvEncoding) => {
    setSaving(encoding);
    try {
      const bytes = await encodeCsv(toMoneyForwardCsv(journalRows), encoding);
      saveFile(
        bytes,
        moneyForwardFileName(ym, encoding).replace("mf_shiwake_", "mf_shiwake_demo_"),
        encoding === "utf8" ? "text/csv;charset=utf-8;" : "text/csv;charset=shift_jis;",
      );
    } finally {
      setSaving(null);
    }
  };

  /**
   * 弥生会計（やよいの青色申告を含む）の形（25列・見出し行なし・Shift-JIS）。
   * 本物と同じ関数（toYayoiCsv / encodeCsv）で作る。
   */
  const downloadYayoiCsv = async () => {
    setSaving("yayoi");
    try {
      const bytes = await encodeCsv(toYayoiCsv(journalRows), "shift_jis");
      saveFile(
        bytes,
        yayoiFileName(ym).replace("yayoi_shiwake_", "yayoi_shiwake_demo_"),
        "text/csv;charset=shift_jis;",
      );
    } finally {
      setSaving(null);
    }
  };

  const set = (key: keyof DemoInput, value: string) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = demoInputProblem(input);
    if (bad) {
      setProblem(bad);
      return;
    }
    setProblem(null);
    setReports((prev) => sortDemoReports([...prev, demoInputToReport(input)]));
    setInput(emptyDemoInput(today));
    setAdded((n) => n + 1);
  };

  const reset = () => {
    setReports(demoReports(ym));
    setInput(emptyDemoInput(today));
    setProblem(null);
    setAdded(0);
  };

  const [y, m] = ym.split("-");

  return (
    <div className="space-y-8">
      {/* ---------- 3つの数字 ---------- */}
      <section>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-stone-900">
            {DEMO_SHOP_NAME}の {Number(y)}年{Number(m)}月
          </h2>
          <p className="text-xs text-stone-500">日報 {summary.reportCount}件から自動で出した数字</p>
        </div>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <DemoNumber
            title="今月の利益"
            value={summary.profit}
            color={summary.profit >= 0 ? "text-emerald-600" : "text-red-600"}
            note={`売上 ${yen(summary.sales)} − 経費 ${yen(summary.expenseTotal)}`}
          />
          <DemoNumber
            title="今の現金"
            value={cash.balance}
            color="text-stone-900"
            note={`${slashDate(cash.openingDate)} の ${yen(cash.openingBalance)} から数えた今の手元`}
          />
          {/* ★「立替」は2通りの意味で読まれる（2026-10-03・kp226-b2）。
               ここは**まだ返していない分だけ**。下の経費の内訳は**今月ぶん全部**。
               同じ言葉で違う金額が並ぶと、ページが間違っているように見える。 */}
          <DemoNumber
            title="まだ払っていないお金"
            value={unpaid.total}
            color="text-amber-600"
            note={`給与 ${yen(unpaid.payroll)}・家賃 ${yen(unpaid.rent)}・まだ返していない立替 ${yen(
              unpaid.advance,
            )}`}
          />
        </dl>
        {/* 現金の数え方（2026-10-08・kp233・f1-4）。
             「計算上の現金」が何通りにも読めると、金庫を数えても差の意味が分からない。
             足し引きの1行1行を、たたまずに出す。 */}
        <div className="mt-3 rounded-lg bg-stone-100 px-4 py-3 space-y-1">
          <p className="text-xs font-bold text-stone-700">現金の数え方</p>
          {cashRuleLines({
            openingDate: cash.openingDate,
            openingBalance: cash.openingBalance,
            sales: cash.sales,
            expensesCash: cash.expenseMeans.cash,
            paid: cash.paid,
            advancesSettled: cash.advancesSettled,
            deposits: cash.deposits,
            balance: cash.balance,
          }).map((l) => (
            <p key={l} className="text-sm text-stone-800 tabular-nums">
              {l}
            </p>
          ))}
          {demoNotFromSafe && (
            <p className="pt-1 text-xs text-amber-700 leading-relaxed">{demoNotFromSafe}</p>
          )}
          <p className="pt-1 text-xs text-stone-500 leading-relaxed">
            経費のうち<strong>金庫から出た分だけ</strong>を引いています。
            立替（だれかが自分のお金で払った分）と現金以外（PayPay・プリカなど）は、
            金庫から出ていないので引きません。月の経費には今までどおり入っています。
          </p>
        </div>
        {/* ★ここは正直に書く（9/19 の実測で分かったこと）。
             「まだ払っていないお金」は給与・外注費・家賃の3つだけを数えており、
             仕入れの掛け（今月末に払う肉代など）は入りません。 */}
        <p className="mt-3 rounded-lg bg-stone-100 px-4 py-3 text-xs text-stone-600 leading-relaxed">
          ※「まだ払っていないお金」に入るのは、
          <strong>給与・外注費・家賃と、まだ返していない立替</strong>です。
          仕入れの掛け（今月末にまとめて払う材料代など）は数えていません。
        </p>
      </section>

      {/* ---------- 日報を1件足す ---------- */}
      <section className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
        <h2 className="text-lg font-bold text-stone-900">日報を1件書いてみる</h2>
        <p className="mt-1 text-sm text-stone-600 leading-relaxed">
          営業が終わったスタッフが入れるのと同じ中身です。「この日報を足す」を押すと、
          上の3つの数字がその場で変わります。
          <strong>入れた数字はどこにも送られず、保存もされません。</strong>
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DemoField label="営業日">
              <input
                type="date"
                value={input.date}
                onChange={(e) => set("date", e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
            </DemoField>
            <DemoField label="出店場所">
              <input
                type="text"
                value={input.location}
                placeholder="駅前広場"
                onChange={(e) => set("location", e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
            </DemoField>
            <DemoField label="その日の売上" unit="円">
              <DemoAmount value={input.sales} onChange={(v) => set("sales", v)} placeholder="80000" />
            </DemoField>
            <DemoField label="その日の日当（合計）" unit="円">
              <DemoAmount value={input.labor} onChange={(v) => set("labor", v)} placeholder="8000" />
            </DemoField>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-bold text-stone-900">レジから払った経費（2件まで）</p>
            <p className="text-xs text-stone-500 leading-relaxed">
              「肉 仕入れ」「場代」「ガソリン」のように書くと、科目に自動で振り分けられます。
              分からない言葉は「雑費」に置いて、あとから人が直せるようにしています。
            </p>
            <DemoExpenseRow
              name={input.expense1Name}
              amount={input.expense1Amount}
              onName={(v) => set("expense1Name", v)}
              onAmount={(v) => set("expense1Amount", v)}
              placeholderName="肉 仕入れ"
              placeholderAmount="18000"
            />
            <DemoExpenseRow
              name={input.expense2Name}
              amount={input.expense2Amount}
              onName={(v) => set("expense2Name", v)}
              onAmount={(v) => set("expense2Amount", v)}
              placeholderName="場代"
              placeholderAmount="8000"
            />
          </div>

          {problem && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {problem}
            </p>
          )}

          <div className="flex gap-3 flex-wrap">
            <button
              type="submit"
              className="flex-1 min-w-[12rem] rounded-xl bg-amber-500 px-5 py-3 font-bold text-white hover:bg-amber-600"
            >
              この日報を足す
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-700 hover:border-stone-400"
            >
              最初の状態に戻す
            </button>
          </div>
          {added > 0 && (
            <p className="text-sm text-emerald-700">
              ✅ {added}件 足しました。上の3つの数字が変わっています。
            </p>
          )}
        </form>
      </section>

      {/* ---------- 科目ごとの表 ---------- */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">科目ごとの金額</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-stone-200">
                <td className="py-2 font-bold">売上高</td>
                <td className="py-2 text-right font-bold tabular-nums">{yen(summary.sales)}</td>
              </tr>
              {DISPLAY_EXPENSE_ACCOUNTS.map((a) => (
                <tr key={a.key} className="border-b border-stone-100">
                  {/* お試し版は架空のお店なので、手羽屋だけの外注先の呼び名は出さない */}
                  <td className="py-2 pl-3 text-stone-700">
                    {a.key === "outsourcing" ? NEUTRAL_OUTSOURCING_ACCOUNT_LABEL : a.label}
                  </td>
                  <td className="py-2 text-right tabular-nums">{yen(mergedExpense[a.key])}</td>
                </tr>
              ))}
              <tr className="border-b-2 border-stone-300">
                <td className="py-2 font-bold">経費合計</td>
                <td className="py-2 text-right font-bold tabular-nums">{yen(summary.expenseTotal)}</td>
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
        <p className="mt-3 text-xs text-stone-500 leading-relaxed">
          経費 {yen(summary.expenseTotal)} の内訳：レジのお金から出た分{" "}
          {yen(summary.expenseFromRegister)}／誰かが立て替えた分（今月ぶん全部）{" "}
          {yen(summary.expenseFromAdvance)}／日当 {yen(summary.payroll)}／家賃{" "}
          {yen(summary.rent)}。
          <strong>月の経費は、立替も含めた全部で1つに決めています。</strong>
          立て替えた日にはまだ金庫からお金が出ていないので、返すまでは
          「まだ払っていないお金」に出ます。
        </p>
        {summary.unmatched.length > 0 && (
          <p className="mt-3 text-xs text-stone-500 leading-relaxed">
            ※ 種類が分からず「雑費」に入れた経費：{summary.unmatched.length}件
            （{summary.unmatched.map((u) => u.description).join("・")}）。
            本物の画面では中身を開いて確かめられます。
          </p>
        )}
      </section>

      {/* ---------- 毎月お出しするもの（会計ソフト用のCSV） ----------
           ★ここが月15,000円のいちばん重い部分（毎月の締めをこちらでやって渡す）。
             これまでお試し版では「本物ではCSVも書き出せます」と**文章で書いてあるだけ**で、
             値上げの根拠そのものが、触ってみられる唯一の場所で触れませんでした。
             行は buildJournalRows が作ります（本物と同じ関数）。日報を足すと増えます。 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">会計ソフトに渡すファイル</h2>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          上の日報から、<strong>会計ソフトがそのまま読める形（仕訳）</strong>を作ります。
          いまこの月は <strong className="tabular-nums">{journalRows.length}行</strong>です。
          上で日報を1件足すと、この行数も増えます。
          帳簿づけとは、ふだんこの表を手で作る作業のことです。
        </p>

        {journalRows.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">この月の日報がないので、まだ行がありません。</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-stone-500 border-b border-stone-200">
                    {JOURNAL_HEADERS.map((h) => (
                      <th key={h} className="py-2 px-2 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {journalRows.slice(0, JOURNAL_PREVIEW).map((r, i) => (
                    <tr key={`${r.date}-${i}`} className="border-b border-stone-100">
                      <td className="py-2 px-2 tabular-nums">{slashDate(r.date)}</td>
                      <td className="py-2 px-2">{r.debitAccount}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{yen(r.debitAmount)}</td>
                      <td className="py-2 px-2">{r.creditAccount}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{yen(r.creditAmount)}</td>
                      <td className="py-2 px-2 text-stone-600">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {journalRows.length > JOURNAL_PREVIEW && (
              <p className="mt-2 text-xs text-stone-500">
                ここに出しているのは、はじめの {JOURNAL_PREVIEW} 行だけです（全 {journalRows.length} 行）。
                下のボタンを押すと、全部入ったファイルが手元にできます。
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadJournalCsv}
            disabled={journalRows.length === 0}
            className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-stone-900 disabled:opacity-40"
          >
            仕訳のCSVを書き出す（Excel向け）
          </button>
          <button
            type="button"
            onClick={() => downloadMoneyForwardCsv("utf8")}
            disabled={journalRows.length === 0 || saving !== null}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 hover:border-stone-400 disabled:opacity-40"
          >
            {saving === "utf8" ? "書き出しています…" : "マネーフォワード用（27列・UTF-8）"}
          </button>
          <button
            type="button"
            onClick={() => downloadMoneyForwardCsv("shift_jis")}
            disabled={journalRows.length === 0 || saving !== null}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 hover:border-stone-400 disabled:opacity-40"
          >
            {saving === "shift_jis" ? "書き出しています…" : "マネーフォワード用（27列・Shift_JIS）"}
          </button>
          <button
            type="button"
            onClick={downloadYayoiCsv}
            disabled={journalRows.length === 0 || saving !== null}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 hover:border-stone-400 disabled:opacity-40"
          >
            {saving === "yayoi" ? "書き出しています…" : "弥生会計用（25列・Shift_JIS）"}
          </button>
        </div>

        <p className="mt-4 rounded-lg bg-stone-100 px-4 py-3 text-xs text-stone-600 leading-relaxed">
          ・押すと、<strong>お使いの端末にファイルが1つできるだけ</strong>です。中身はどこにも送られません。
          <br />
          ・マネーフォワード クラウド会計は、取り込める文字コードが環境によって違うので2つ置いてあります
          （Windows なら Shift_JIS、Mac なら UTF-8 が入りやすいです）。
          <br />
          ・<strong>弥生会計・やよいの青色申告</strong>は、取り込むときに「この列は何ですか」と選ぶ画面が
          なく、並びが25列ぴったりに決まっています。そのため弥生専用の形（見出し行なし・Shift_JIS）で
          別に置いてあります。
          <br />
          ・<strong>freee</strong> は取り込んだあとに列を選べるので、上の「マネーフォワード用」を
          そのままお使いいただけます（取引日→発生日、取引No→伝票番号 の順に選びます）。
          <br />
          ・中身は<strong>架空のお店（{DEMO_SHOP_NAME}）の数字</strong>です。実在のお店の数字ではありません。
          <br />
          ・本物では、この書き出しを<strong>毎月こちらで行って、要約1枚と一緒にお渡しします</strong>
          （ご自身で押す必要はありません）。
        </p>

        {/* ---------- 試算表（税理士さんと会計ソフトが最初に見る表・f1-7） ----------
             ★本物の経理画面と同じ関数・同じ仕訳から作っています。
             ここが「左＝右」で、しかも上の利益と1円まで同じなら、
             CSV の中身も合っていることが目で見て分かります。 */}
        <details className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <summary className="cursor-pointer text-sm font-bold text-stone-800">
            試算表を見る（科目ごとの合計・左と右が合っているか）
            <span className="ml-2 text-xs font-normal text-stone-500">
              左 {yen(trial.debitTotal)}／右 {yen(trial.creditTotal)}
              {trial.balanced ? "・ぴったり" : "・合っていません"}
            </span>
          </summary>
          <p className="mt-2 text-xs text-stone-600 leading-relaxed">
            科目（お金を仕分ける箱の名前）ごとに「左（借方）にいくら・右（貸方）にいくら」を
            足し上げた表です。左と右の合計が同じなら、帳簿の形が崩れていないしるしです。
          </p>
          <div className="mt-3 -mx-1 overflow-x-auto">
            <table className="w-full min-w-[22rem] text-xs">
              <thead>
                <tr className="text-stone-500">
                  <th className="px-1 py-1 text-left font-bold whitespace-nowrap">科目</th>
                  <th className="px-1 py-1 text-right font-bold whitespace-nowrap">借方合計</th>
                  <th className="px-1 py-1 text-right font-bold whitespace-nowrap">貸方合計</th>
                  <th className="px-1 py-1 text-right font-bold whitespace-nowrap">残高</th>
                </tr>
              </thead>
              <tbody className="text-stone-700">
                {trial.lines.map((l) => (
                  <tr key={l.account} className="border-t border-stone-200">
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
                        <span className="ml-1 text-stone-400">{l.side}</span>
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
                  <td className="px-1 py-1 text-right whitespace-nowrap tabular-nums">{yen(0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs font-bold text-stone-700">
            → 試算表の売上 {yen(trial.revenueTotal)} − かかったお金 {yen(trial.expenseTotal)} ＝{" "}
            {yen(trial.profit)}
            {trialCheck.ok ? "（上の数字と1円まで同じです）" : "（上の数字と合っていません）"}
          </p>
          {/* 現金が上の「いま手元にある現金」とちがって見える所の説明（kp243・B2 の材料のまま） */}
          {trialCashNote && (
            <p className="mt-1 text-xs text-stone-600 leading-relaxed">
              {trialCashNote.text}
            </p>
          )}
          <button
            type="button"
            onClick={downloadTrialCsv}
            disabled={trial.lines.length === 0}
            className="mt-3 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 hover:border-stone-400 disabled:opacity-40"
          >
            試算表のCSVを書き出す（4列）
          </button>
        </details>

        {/* ★「毎月お渡しする1枚」への道（2026-10-03・f5-1／f5-2）。
             お試し版は数字を触る場所で、毎月お渡しするものの形は別の1枚にある。
             ここに道が無いと、触ったあとに「で、何が届くのか」が分からないまま
             申し込みの判断をさせることになる。 */}
        <p className="mt-3 text-center text-sm">
          <Link
            href="/keiri/monthly-sample"
            className="font-bold text-amber-700 underline hover:text-amber-800"
          >
            毎月お渡しする1枚の見本を見る →
          </Link>
        </p>

        {/* ★書き出せた直後に、申し込みへの道を1本置く（kp134）。
             お試し版は「買う前に手で触れる唯一の場所」で、いちばん心が動くのは
             CSV を自分の手で書き出せた直後。ところが申し込みへの入口は
             ページ中ほどと一番下の2か所だけだった（9/24 15:04 A 実測）。
             kp133 で紹介ページに入れた直しと同じ考え方を、ここにも入れる。
             新しい約束・新しい価格の言葉は足さない。
             ★2026-09-28（kp199）：行き先を「別の画面（/keiri/apply）」から
             **ご案内ページの入力欄そのもの**（/keiri/case?from=trial#apply）に変えた。
             押した瞬間に入力欄が出るので、画面が変わるところで手が止まらない。 */}
        <div className="mt-4 text-center">
          <Link
            href={TRIAL_APPLY_HREF}
            className="inline-block rounded-xl border border-amber-400 bg-white px-5 py-3 text-sm font-bold text-amber-800 hover:bg-amber-50"
          >
            この形で毎月お届けします → {TRIAL_CTA_LABEL}
          </Link>
          <p className="mt-2 text-xs text-stone-500">{TRIAL_CTA_NOTE}</p>
        </div>
      </section>

      {/* ---------- 場所ごと ---------- */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">出店場所ごとの成績</h2>
        {byLocation.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">この月の日報がありません。</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
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
                    <td className="py-2 text-right tabular-nums">{row.reportCount}</td>
                    <td className="py-2 text-right tabular-nums">{yen(row.sales)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(row.costTotal)}</td>
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
          <div className="mt-3 rounded-lg bg-stone-100 px-4 py-3">
            <p className="text-xs text-stone-700 leading-relaxed tabular-nums">
              {locationProfitBridgeLine(bridge)}
            </p>
            <p className="mt-1 text-xs text-stone-500 leading-relaxed">
              {bridge.matches
                ? "「経費」は日報の経費と日当の合計です。立替・外注費・家賃は、どの場所のぶんか決められないので場所別には入れていません。上の式のとおり、引くと今月の利益にぴったり合います。"
                : "場所ごとの利益と今月の利益が、足し引きで合っていません。数え方のどこかがずれています。"}
            </p>
          </div>
        )}
      </section>

      {/* ---------- この月の日報 ---------- */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">この月に入っている日報</h2>
        <ul className="mt-4 divide-y divide-stone-100 text-sm">
          {reports.map((r, i) => (
            <li key={`${r.date}-${i}`} className="flex items-baseline justify-between gap-4 py-2">
              <span className="text-stone-700">
                {slashDate(r.date)}　{r.location || "未設定"}
              </span>
              <span className="tabular-nums text-stone-900 font-semibold">
                {yen(Number(r.sales_amount) || 0)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- 次に進む ---------- */}
      <section className="rounded-2xl border border-amber-300 bg-white p-6 text-center">
        <p className="font-bold text-stone-900">
          同じものを、あなたのお店の数字で。
        </p>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          お試し版で触ったのと同じ画面が、そのままお店の経理になります。
          毎月の締めと会計ソフト用のCSVはこちらでお出しします。
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/keiri/monthly-sample"
            className="font-bold text-amber-700 underline hover:text-amber-800"
          >
            毎月お渡しする1枚の見本を見る →
          </Link>
        </p>
        <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/keiri/case"
            className="rounded-xl bg-amber-500 px-6 py-3 font-bold text-white hover:bg-amber-600"
          >
            価格と中身を見る
          </Link>
          <Link
            href={TRIAL_APPLY_HREF}
            className="rounded-xl border border-stone-300 px-6 py-3 font-bold text-stone-700 hover:border-amber-300"
          >
            {TRIAL_CTA_LABEL}
          </Link>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------
// 部品
// ------------------------------------------------------------------

function DemoNumber({
  title,
  value,
  note,
  color,
}: {
  title: string;
  value: number;
  note: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <dt className="text-sm font-semibold text-stone-500">{title}</dt>
      <dd className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{yen(value)}</dd>
      <p className="mt-1 text-xs text-stone-400 leading-relaxed">{note}</p>
    </div>
  );
}

function DemoField({
  label,
  unit,
  children,
}: {
  label: string;
  unit?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-stone-900">
        {label}
        {unit && <span className="ml-1 text-xs font-normal text-stone-500">（{unit}）</span>}
      </span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function DemoAmount({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-right tabular-nums focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
    />
  );
}

function DemoExpenseRow({
  name,
  amount,
  onName,
  onAmount,
  placeholderName,
  placeholderAmount,
}: {
  name: string;
  amount: string;
  onName: (v: string) => void;
  onAmount: (v: string) => void;
  placeholderName: string;
  placeholderAmount: string;
}) {
  return (
    <div className="flex gap-2">
      {/* ★min-w-0 を外さないこと。
           入力欄には「これ以上は縮まない」既定の幅があり、min-w-0 が無いと
           横に並べた2つが画面より広くなって、**スマホでページが横にずれる**。
           2026-09-19 に実機幅390pxで実測して9pxはみ出していた所（tests/keiriDemo.test.ts で固定）。 */}
      <input
        type="text"
        value={name}
        placeholder={placeholderName}
        aria-label="経費の内容"
        onChange={(e) => onName(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
      />
      <input
        type="text"
        inputMode="numeric"
        value={amount}
        placeholder={placeholderAmount}
        aria-label="経費の金額"
        onChange={(e) => onAmount(e.target.value)}
        className="w-28 shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-right tabular-nums focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
      />
    </div>
  );
}
