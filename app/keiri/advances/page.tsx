"use client";

/**
 * 経理層：立替経費の入力フォーム（/keiri/advances）
 *
 * ■ これは何？
 *   スタッフが自分のお金で先に払った経費を、その場でスマホから記録する画面です。
 *   保存先は keiri_advance_expenses テーブル（経理層のテーブルは keiri_ で始まります）。
 *
 * ■ 入力するのは5つ ＋ レシート写真（任意）
 *   ① 日付 ② 立替した人 ③ 金額 ④ 種類 ⑤ メモ（任意） ＋ 📷 レシート写真（任意）
 *   写真は 2026-08 に川畑さんの指示で追加。任意なので、撮らなくても登録できます。
 *   理由：現場の入力負担を増やさないのが3層設計の大前提だからです。
 *   ★ これ以上、項目を足したくなったら、勝手に足さずに必ず相談すること。
 *
 * ■ 日報は一切変えていません
 *   日報（/report）の入力フローや画面には手を付けていません。これは別の入り口です。
 *
 * ■ 税務判断はしません
 *   「種類」を選ぶと勘定科目と税区分が表示されますが、これは
 *   keiri_account_mapping に入っている「税理士に見てもらうための叩き台」です。
 *   このアプリは税務判断をしません／させません。最終確定は必ず税理士のレビューで行います。
 *   （税務判断は税理士の独占業務であり、このアプリの提供範囲は記帳の効率化までです）
 *
 * TODO（次ステージ）：ここのデータを keiri_account_mapping で仕訳に変換し、
 *                     マネーフォワード クラウド会計の仕訳インポートCSVを出力する。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen, slashDate, businessDateStr } from "@/lib/format";
import { STAFF_OPTIONS } from "@/lib/formState";
import { resizeImage } from "@/lib/imageResize";

/** 業態コード。手羽屋のみなので画面には出さず固定 */
const BUSINESS_TYPE_CODE = "tebaya";

type Mapping = {
  source_type: string;
  label: string;
  account_title: string | null;
  sub_account: string | null;
  tax_category: string;
  entry_side: string;
  needs_tax_advisor_review: boolean;
  sort_order: number;
};

type AdvanceRow = {
  id: number;
  expense_date: string;
  payer: string;
  amount: number;
  source_type: string;
  memo: string | null;
  receipt_image_url: string | null;
};

export default function KeiriAdvancesPage() {
  // ── 選択肢のマスタ ──
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [staffNames, setStaffNames] = useState<string[]>(STAFF_OPTIONS);
  const [recent, setRecent] = useState<AdvanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── 入力する5項目 ──
  const [expenseDate, setExpenseDate] = useState(businessDateStr());
  const [payer, setPayer] = useState("");
  const [amount, setAmount] = useState(0);
  const [sourceType, setSourceType] = useState("");
  const [memo, setMemo] = useState("");
  /** レシート写真（任意）。縮小済みのデータURL文字列 */
  const [photo, setPhoto] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from("keiri_advance_expenses")
      .select("id, expense_date, payer, amount, source_type, memo, receipt_image_url")
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(10);
    setRecent((data as AdvanceRow[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [mapRes, staffRes] = await Promise.all([
          supabase
            .from("keiri_account_mapping")
            .select(
              "source_type, label, account_title, sub_account, tax_category, entry_side, needs_tax_advisor_review, sort_order",
            )
            .eq("business_type_code", BUSINESS_TYPE_CODE)
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("staff_members")
            .select("name")
            .eq("is_active", true)
            .order("name"),
        ]);
        if (mapRes.error) throw mapRes.error;

        // 「種類」に出すのは費用の科目だけ。
        //   entry_side='debit'  … 借方＝費用側（売上の行を立替経費として選べてしまうのを防ぐ）
        //   account_title あり  … 「立替経費」の行そのものは科目を持たない指定用の行なので除く
        const expenseOnly = ((mapRes.data as Mapping[]) ?? []).filter(
          (m) => m.entry_side === "debit" && !!m.account_title,
        );
        setMappings(expenseOnly);

        const names = ((staffRes.data as { name: string }[]) ?? [])
          .map((s) => s.name)
          .filter(Boolean);
        if (names.length > 0) setStaffNames(names);
      } catch (e: any) {
        setLoadError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
      loadRecent();
    })();
  }, [loadRecent]);

  const selected = useMemo(
    () => mappings.find((m) => m.source_type === sourceType) ?? null,
    [mappings, sourceType],
  );

  const labelOf = useCallback(
    (st: string) => mappings.find((m) => m.source_type === st)?.label ?? st,
    [mappings],
  );

  /** レシート写真を選んだとき。大きい写真は縮めてから持っておく */
  const onPhoto = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert("写真が大きすぎます（20MB以下にしてください）");
      return;
    }
    try {
      setPhoto(await resizeImage(file));
    } catch (e: any) {
      alert("写真の読み込みに失敗しました: " + (e?.message || e));
    }
  };

  const canSave = !!expenseDate && !!payer && amount > 0 && !!sourceType;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      const { error } = await supabase.from("keiri_advance_expenses").insert({
        business_type_code: BUSINESS_TYPE_CODE,
        expense_date: expenseDate,
        payer,
        amount,
        source_type: sourceType,
        memo: memo.trim() || null,
        receipt_image_url: photo,
      });
      if (error) throw error;
      setSavedMsg(`${payer}さん / ${yen(amount)} を登録しました`);
      // 日付と立替者は続けて入力しやすいように残す
      setAmount(0);
      setSourceType("");
      setMemo("");
      setPhoto(null);
      loadRecent();
      setTimeout(() => setSavedMsg(null), 4000);
    } catch (e: any) {
      alert("登録に失敗しました: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-5 pb-10 space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-brand-dark">🧾 立替経費</h1>
        <Link href="/" className="btn-secondary text-sm">
          🏠 トップ
        </Link>
      </header>

      <p className="text-sm text-stone-500 leading-relaxed">
        自分のお金で先に払った経費を記録します。入力は5つだけです。
        <br />
        ※ 日報の「立替経費」とは別の入り口です。同じものを二重に登録しないでください。
      </p>

      {loadError && (
        <div className="card text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
          ❌ 読込エラー: {loadError}
        </div>
      )}
      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {!loading && (
        <section className="card space-y-4">
          {/* ① 日付 */}
          <div>
            <label className="label">① 日付</label>
            <input
              type="date"
              className="field"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>

          {/* ② 立替した人 */}
          <div>
            <label className="label">② 立替した人</label>
            <div className="flex gap-2 flex-wrap">
              {staffNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPayer(name)}
                  className={`px-4 py-3 rounded-full text-base font-semibold border ${
                    payer === name
                      ? "bg-brand text-white border-brand"
                      : "bg-white text-stone-600 border-stone-300"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* ③ 金額 */}
          <div>
            <label className="label">③ 金額</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
                ¥
              </span>
              <input
                type="number"
                inputMode="numeric"
                className="field pl-8 text-right text-xl font-bold"
                placeholder="0"
                value={amount || ""}
                onChange={(e) =>
                  setAmount(Math.max(0, parseInt(e.target.value || "0", 10)))
                }
              />
            </div>
          </div>

          {/* ④ 種類 */}
          <div>
            <label className="label">④ 種類</label>
            <select
              className="field"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
            >
              <option value="">選んでください</option>
              {mappings.map((m) => (
                <option key={m.source_type} value={m.source_type}>
                  {m.label}
                </option>
              ))}
            </select>

            {/* 選んだ種類の科目・税区分の表示（確認用。入力項目ではありません） */}
            {selected && (
              <div className="mt-2 rounded-xl bg-stone-50 border border-stone-200 p-3 space-y-1">
                <div className="text-sm text-stone-700">
                  勘定科目：<b>{selected.account_title}</b>
                  {selected.sub_account && `（${selected.sub_account}）`}
                </div>
                <div className="text-sm text-stone-700">
                  税区分：<b>{selected.tax_category}</b>
                </div>
                <div className="text-xs text-stone-500">
                  ※ これは税理士に見てもらうための下書きです。このアプリは税務の判断をしません。
                </div>
                {selected.needs_tax_advisor_review && (
                  <div className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    ⚠️ 要税理士確認：この科目は判断が割れます。必ず税理士に確認してください。
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ⑤ メモ（任意） */}
          <div>
            <label className="label">⑤ メモ（任意）</label>
            <input
              type="text"
              className="field"
              placeholder="例：スーパーでまとめ買い"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          {/* 📷 レシート写真（任意） */}
          <div>
            <label className="label">📷 レシート写真（任意）</label>
            <label className="block">
              <span className="btn-secondary inline-block w-full text-center cursor-pointer">
                {photo ? "📷 撮り直す" : "📷 レシートを撮影する"}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPhoto(f);
                  // 同じ写真をもう一度選べるように入力欄を空に戻す
                  e.target.value = "";
                }}
              />
            </label>
            {photo && (
              <div className="mt-2 space-y-2">
                <img
                  src={photo}
                  alt="レシート"
                  className="w-full max-h-48 object-contain rounded-lg border border-stone-200"
                />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="text-sm text-red-500 underline"
                >
                  写真を消す
                </button>
              </div>
            )}
            <p className="text-xs text-stone-400 mt-1">
              なくても登録できます。撮ると、あとで金額を確かめるのが楽になります。
            </p>
          </div>

          {savedMsg && (
            <div className="text-sm font-semibold rounded-xl px-3 py-2 bg-green-50 text-green-700 border border-green-200">
              ✅ {savedMsg}
            </div>
          )}

          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving}
            className="btn-primary w-full"
          >
            {saving ? "登録中…" : "登録する"}
          </button>
          {!canSave && (
            <p className="text-xs text-stone-400 text-center">
              日付・立替した人・金額・種類を入れると登録できます
            </p>
          )}
        </section>
      )}

      {/* 直近の登録（入力できたか確認するための表示） */}
      {!loading && recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-stone-700 text-sm">最近の登録</h2>
          {recent.map((r) => (
            <div key={r.id} className="card py-3 space-y-1">
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-stone-600">
                  {slashDate(r.expense_date)} ／ 👤 {r.payer}
                </span>
                <span className="font-bold font-mono">{yen(r.amount)}</span>
              </div>
              <div className="text-sm text-stone-700">
                {labelOf(r.source_type)}
              </div>
              {r.memo && (
                <div className="text-xs text-stone-500">📝 {r.memo}</div>
              )}
              {r.receipt_image_url && (
                <img
                  src={r.receipt_image_url}
                  alt="レシート"
                  className="w-full max-h-40 object-contain rounded-lg border border-stone-200"
                />
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
