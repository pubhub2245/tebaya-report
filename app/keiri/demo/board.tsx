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
import {
  DISPLAY_EXPENSE_ACCOUNTS,
  JOURNAL_HEADERS,
  NEUTRAL_OUTSOURCING_ACCOUNT_LABEL,
  buildJournalRows,
  calcCashPosition,
  calcUnpaid,
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
  demoPayments,
  demoReports,
  demoSettings,
  emptyDemoInput,
  sortDemoReports,
} from "@/lib/keiri/demo";
import type { KeiriReport } from "@/lib/keiri";

/** 画面に出す仕訳の行数（全部はファイルに入れる） */
const JOURNAL_PREVIEW = 6;

export default function DemoBoard({ ym, today }: { ym: string; today: string }) {
  const [reports, setReports] = useState<KeiriReport[]>(() => demoReports(ym));
  const [input, setInput] = useState<DemoInput>(() => emptyDemoInput(today));
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState(0);

  const settings = useMemo(() => demoSettings(ym), [ym]);
  const payments = useMemo(() => demoPayments(), []);
  // 申し込んだお店と同じ「汎用」の対応表を使う（手羽屋だけの言葉は使わない）
  const template = useMemo(() => templateFor(GENERIC_TEMPLATE.code), []);

  const summary = useMemo(
    () => summarizeMonth({ ym, reports, template, settings }),
    [ym, reports, template, settings],
  );
  const cash = useMemo(
    () => calcCashPosition({ reports, payments, settings }),
    [reports, payments, settings],
  );
  const unpaid = useMemo(
    () => calcUnpaid({ reports, payments, settings, currentYm: ym }),
    [reports, payments, settings, ym],
  );
  const byLocation = useMemo(() => summarizeByLocation({ ym, reports }), [ym, reports]);
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
    () => buildJournalRows({ ym, reports, payments, template, settings }),
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
          <DemoNumber
            title="まだ払っていないお金"
            value={unpaid.total}
            color="text-amber-600"
            note={`給与 ${yen(unpaid.payroll)}・家賃 ${yen(unpaid.rent)}`}
          />
        </dl>
        {/* ★ここは正直に書く（9/19 の実測で分かったこと）。
             「まだ払っていないお金」は給与・外注費・家賃の3つだけを数えており、
             仕入れの掛け（今月末に払う肉代など）は入りません。 */}
        <p className="mt-3 rounded-lg bg-stone-100 px-4 py-3 text-xs text-stone-600 leading-relaxed">
          ※「まだ払っていないお金」に入るのは、<strong>給与・外注費・家賃の3つだけ</strong>です。
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

        {/* ★書き出せた直後に、申し込みへの道を1本置く（kp134）。
             お試し版は「買う前に手で触れる唯一の場所」で、いちばん心が動くのは
             CSV を自分の手で書き出せた直後。ところが申し込みへの入口は
             ページ中ほどと一番下の2か所だけだった（9/24 15:04 A 実測）。
             kp133 で紹介ページに入れた直しと同じ考え方を、ここにも入れる。
             新しい約束・新しい価格の言葉は足さない（行き先は下の枠と同じ /keiri/apply）。 */}
        <div className="mt-4 text-center">
          <Link
            href="/keiri/apply"
            className="inline-block rounded-xl border border-amber-400 bg-white px-5 py-3 text-sm font-bold text-amber-800 hover:bg-amber-50"
          >
            この形で毎月お届けします → お申し込みへ
          </Link>
          <p className="mt-2 text-xs text-stone-500">この画面でお支払いは発生しません。</p>
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
        <p className="mt-3 text-xs text-stone-500 leading-relaxed">
          「経費」は日報の経費と日当の合計です。家賃のような月ごとに決まるお金は、
          どの場所のぶんか決められないので場所別には入れていません。
        </p>
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
        <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/keiri/case"
            className="rounded-xl bg-amber-500 px-6 py-3 font-bold text-white hover:bg-amber-600"
          >
            価格と中身を見る
          </Link>
          <Link
            href="/keiri/apply"
            className="rounded-xl border border-stone-300 px-6 py-3 font-bold text-stone-700 hover:border-amber-300"
          >
            お申し込み
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
