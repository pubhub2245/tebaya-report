"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";
import {
  FormState,
  initialForm,
  STORAGE_KEY,
} from "@/lib/formState";
import { generateLineText } from "@/lib/lineText";

const TOTAL_STEPS = 7;

const LOCATION_OPTIONS = [
  "ながやま 鷹尾店",
  "ながやま 若葉店",
  "ながやま 三股店",
  "ながやま 都北店",
  "ながやま 山田店",
  "ながやま 志比田店",
  "マンガ倉庫",
  "PASIO高城店",
  "PASIO早鈴店",
  "ニクルの朝市",
  "まるまる朝市",
  "BIG OPUS",
  "Aコープ木花",
  "イオンモール",
];

const STAFF_OPTIONS = ["イデ", "じゅん", "かずき", "なぎさ"];

const COINS: { key: keyof FormState["coins"]; label: string; value: number }[] = [
  { key: "c10", label: "10円", value: 10 },
  { key: "c50", label: "50円", value: 50 },
  { key: "c100", label: "100円", value: 100 },
  { key: "c500", label: "500円", value: 500 },
  { key: "b1000", label: "1,000円", value: 1000 },
  { key: "b5000", label: "5,000円", value: 5000 },
  { key: "b10000", label: "10,000円", value: 10000 },
];

export default function Page() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm());
  const [cumulative, setCumulative] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [lineText, setLineText] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Load draft from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.form) setForm({ ...initialForm(), ...parsed.form });
        if (typeof parsed?.step === "number") setStep(parsed.step);
      }
    } catch {}
    setLoaded(true);
  }, []);

  // Persist draft (strip heavy data URLs to avoid quota errors)
  useEffect(() => {
    if (!loaded) return;
    try {
      const slim = {
        ...form,
        expenses: form.expenses.map((e) => ({
          ...e,
          receipt_image_url: e.receipt_image_url?.startsWith("data:")
            ? null
            : e.receipt_image_url ?? null,
        })),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ form: slim, step }));
    } catch (err) {
      console.warn("sessionStorage persist failed", err);
    }
  }, [form, step, loaded]);

  // Fetch cumulative sales
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("daily_reports")
          .select("sales_amount");
        const sum = (data || []).reduce(
          (s: number, r: any) => s + (r.sales_amount || 0),
          0
        );
        setCumulative(sum + (form.sales_amount || 0));
      } catch {}
    })();
  }, [form.sales_amount]);

  const registerTotal = useMemo(
    () =>
      COINS.reduce(
        (s, c) => s + (form.coins[c.key] || 0) * c.value,
        0
      ),
    [form.coins]
  );

  const expensesTotal = useMemo(
    () => form.expenses.reduce((s, e) => s + (e.amount || 0), 0),
    [form.expenses]
  );

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  const canNext = () => {
    if (step === 1)
      return form.date && form.location.trim() && form.staff_name.trim();
    if (step === 2) return form.sales_amount > 0;
    return true;
  };

  const handleGenerate = () => {
    const text = generateLineText(form, cumulative);
    setLineText(text);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lineText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const text = lineText || generateLineText(form, cumulative);
      if (!lineText) setLineText(text);
      const { data, error } = await supabase
        .from("daily_reports")
        .insert({
          date: form.date,
          location: form.location,
          staff_name: form.staff_name,
          sales_amount: form.sales_amount,
          cumulative_sales: cumulative,
          register_total: registerTotal,
          register_ok: form.register_ok,
          register_diff: form.register_diff || 0,
          remaining_tebasaki: form.remaining.tebasaki,
          remaining_gyoza: form.remaining.gyoza,
          remaining_potato: form.remaining.potato,
          remaining_tornado: form.remaining.tornado,
          expenses: form.expenses,
          handover: form.handover,
          line_text: text,
        })
        .select("id")
        .single();
      if (error) throw error;
      setSavedId(data.id);
      sessionStorage.removeItem(STORAGE_KEY);
      setStep(8);
    } catch (e: any) {
      alert("保存に失敗しました: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    if (!savedId && !confirm("入力内容をクリアして最初から始めますか？")) return;
    sessionStorage.removeItem(STORAGE_KEY);
    setForm(initialForm());
    setStep(1);
    setLineText("");
    setSavedId(null);
  };

  if (!loaded) return null;

  if (step === 8) {
    return (
      <main className="max-w-md mx-auto px-4 py-5 min-h-screen flex items-center justify-center">
        <section className="card text-center space-y-4 w-full">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-bold">日報を送信しました！</h2>
          <p className="text-stone-600">お疲れさまでした</p>
          <button onClick={resetAll} className="btn-primary w-full">
            新しい日報を入力する
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-4 py-5 pb-32">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-brand-dark">手羽屋 営業後日報</h1>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-stone-600 mb-1">
            <span>STEP {step} / {TOTAL_STEPS}</span>
            <span>
              {[
                "基本情報",
                "売上",
                "レジ確認",
                "在庫残り",
                "立替経費",
                "引き継ぎ",
                "確認・生成",
              ][step - 1]}
            </span>
          </div>
          <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand transition-all"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>
      </header>

      {step === 1 && (
        <Step1 form={form} update={update} />
      )}
      {step === 2 && (
        <Step2 form={form} update={update} cumulative={cumulative} />
      )}
      {step === 3 && (
        <Step3
          form={form}
          update={update}
          registerTotal={registerTotal}
        />
      )}
      {step === 4 && <Step4 form={form} update={update} />}
      {step === 5 && (
        <Step5
          form={form}
          update={update}
          expensesTotal={expensesTotal}
        />
      )}
      {step === 6 && <Step6 form={form} update={update} />}
      {step === 7 && (
        <Step7
          form={form}
          cumulative={cumulative}
          registerTotal={registerTotal}
          expensesTotal={expensesTotal}
          lineText={lineText}
          onGenerate={handleGenerate}
          onCopy={handleCopy}
          copied={copied}
          onSave={handleSave}
          saving={saving}
          savedId={savedId}
          onReset={resetAll}
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-3">
        <div className="max-w-md mx-auto flex gap-2">
          <button
            onClick={goPrev}
            disabled={step === 1}
            className="btn-secondary flex-1 disabled:opacity-30"
          >
            戻る
          </button>
          {step < TOTAL_STEPS && (
            <button
              onClick={goNext}
              disabled={!canNext()}
              className="btn-primary flex-[2]"
            >
              次へ
            </button>
          )}
        </div>
      </nav>
    </main>
  );
}

/* ---------- STEP 1 ---------- */
function Step1({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  const [isOther, setIsOther] = useState(
    form.location.length > 0 && !LOCATION_OPTIONS.includes(form.location)
  );
  return (
    <section className="card space-y-4">
      <h2 className="text-lg font-bold">基本情報</h2>
      <div>
        <label className="label">日付</label>
        <input
          type="date"
          className="field"
          value={form.date}
          onChange={(e) => update("date", e.target.value)}
        />
      </div>
      <div>
        <label className="label">出店場所</label>
        <select
          className="field"
          value={isOther ? "__other__" : form.location}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__other__") {
              setIsOther(true);
              update("location", "");
            } else {
              setIsOther(false);
              update("location", v);
            }
          }}
        >
          <option value="">選択してください</option>
          {LOCATION_OPTIONS.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
          <option value="__other__">その他（自由入力）</option>
        </select>
        {isOther && (
          <input
            className="field mt-2"
            placeholder="出店場所を入力"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
          />
        )}
      </div>
      <div>
        <label className="label">担当者名</label>
        <select
          className="field"
          value={form.staff_name}
          onChange={(e) => update("staff_name", e.target.value)}
        >
          <option value="">選択してください</option>
          {STAFF_OPTIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

/* ---------- STEP 2 ---------- */
function Step2({
  form,
  update,
  cumulative,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  cumulative: number;
}) {
  return (
    <section className="card space-y-4">
      <h2 className="text-lg font-bold">売上</h2>
      <div>
        <label className="label">本日売上</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
            ¥
          </span>
          <input
            type="number"
            inputMode="numeric"
            className="field pl-8 text-right text-2xl font-bold"
            value={form.sales_amount || ""}
            onChange={(e) =>
              update("sales_amount", parseInt(e.target.value || "0", 10))
            }
            placeholder="0"
          />
        </div>
      </div>
      <div className="bg-stone-100 rounded-xl p-4">
        <div className="text-xs text-stone-600">累計売上（自動計算）</div>
        <div className="text-xl font-bold text-brand-dark">
          {yen(cumulative)}
        </div>
      </div>
    </section>
  );
}

/* ---------- STEP 3 ---------- */
function Step3({
  form,
  update,
  registerTotal,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  registerTotal: number;
}) {
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">レジ確認</h2>
      <p className="text-sm text-stone-600">金種ごとに枚数を入力</p>
      <div className="space-y-2">
        {COINS.map((c) => {
          const n = form.coins[c.key] || 0;
          return (
            <div
              key={c.key}
              className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2"
            >
              <div className="w-20 text-right font-semibold">{c.label}</div>
              <span className="text-stone-400">×</span>
              <input
                type="number"
                inputMode="numeric"
                className="field flex-1 text-right"
                value={n || ""}
                onChange={(e) =>
                  update("coins", {
                    ...form.coins,
                    [c.key]: parseInt(e.target.value || "0", 10),
                  })
                }
                placeholder="0"
              />
              <span className="text-xs text-stone-500 w-16 text-right">
                枚 = {yen(n * c.value)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="bg-stone-100 rounded-xl p-4 flex justify-between items-center">
        <span className="text-stone-600">レジ合計</span>
        <span className="text-2xl font-bold text-brand-dark">
          {yen(registerTotal)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            update("register_ok", true);
            update("register_diff", 0);
          }}
          className={`rounded-xl py-3 font-bold border-2 ${
            form.register_ok
              ? "bg-green-600 text-white border-green-600"
              : "bg-white text-stone-700 border-stone-300"
          }`}
        >
          ✓ 確認OK
        </button>
        <button
          type="button"
          onClick={() => update("register_ok", false)}
          className={`rounded-xl py-3 font-bold border-2 ${
            !form.register_ok
              ? "bg-red-600 text-white border-red-600"
              : "bg-white text-stone-700 border-stone-300"
          }`}
        >
          ! 差異あり
        </button>
      </div>
      {!form.register_ok && (
        <div>
          <label className="label">
            差異金額（不足の場合はマイナスで入力）
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
              ¥
            </span>
            <input
              type="number"
              inputMode="numeric"
              className="field pl-8 text-right"
              placeholder="例：-500"
              value={form.register_diff || ""}
              onChange={(e) =>
                update("register_diff", parseInt(e.target.value || "0", 10))
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- STEP 4 ---------- */
function Step4({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  const items: { key: keyof FormState["remaining"]; label: string }[] = [
    { key: "tebasaki", label: "手羽先" },
    { key: "gyoza", label: "手羽餃子" },
    { key: "potato", label: "ポテト" },
    { key: "tornado", label: "トルネードポテト" },
  ];
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">在庫残り本数</h2>
      {items.map((it) => {
        const v = form.remaining[it.key] || 0;
        return (
          <div
            key={it.key}
            className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2"
          >
            <div className="flex-1 font-semibold">{it.label}</div>
            <button
              type="button"
              onClick={() =>
                update("remaining", {
                  ...form.remaining,
                  [it.key]: Math.max(0, v - 1),
                })
              }
              className="w-10 h-10 rounded-full bg-stone-200 text-xl font-bold"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              className="field w-20 text-center"
              value={v || ""}
              onChange={(e) =>
                update("remaining", {
                  ...form.remaining,
                  [it.key]: parseInt(e.target.value || "0", 10),
                })
              }
              placeholder="0"
            />
            <span className="text-stone-500">本</span>
            <button
              type="button"
              onClick={() =>
                update("remaining", {
                  ...form.remaining,
                  [it.key]: v + 1,
                })
              }
              className="w-10 h-10 rounded-full bg-stone-200 text-xl font-bold"
            >
              ＋
            </button>
          </div>
        );
      })}
    </section>
  );
}

/* ---------- STEP 5 ---------- */
function Step5({
  form,
  update,
  expensesTotal,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  expensesTotal: number;
}) {
  const [ocrIdx, setOcrIdx] = useState<number | null>(null);

  const addExpense = () =>
    update("expenses", [
      ...form.expenses,
      { description: "", amount: 0, receipt_image_url: null },
    ]);

  const removeExpense = (i: number) =>
    update(
      "expenses",
      form.expenses.filter((_, idx) => idx !== i)
    );

  const updateExpense = (i: number, patch: Partial<FormState["expenses"][0]>) =>
    update(
      "expenses",
      form.expenses.map((e, idx) => (idx === i ? { ...e, ...patch } : e))
    );

  const resizeImage = (file: File, maxDim = 1600, quality = 0.8) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("読み込みに失敗しました"));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("画像の解析に失敗しました"));
        img.onload = () => {
          try {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("canvas未対応"));
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", quality));
          } catch (err) {
            reject(err);
          }
        };
        img.src = fr.result as string;
      };
      fr.readAsDataURL(file);
    });

  const handlePhoto = async (i: number, file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert("画像サイズが大きすぎます（20MB以下にしてください）");
      return;
    }
    try {
      setOcrIdx(i);
      const dataUrl = await resizeImage(file);
      updateExpense(i, { receipt_image_url: dataUrl });
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataUrl, mediaType: "image/jpeg" }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`OCR失敗 (${res.status}) ${text}`);
      }
      const json = await res.json();
      if (json?.amount) updateExpense(i, { amount: json.amount });
    } catch (e: any) {
      console.error("handlePhoto error", e);
      alert("読み取り失敗: " + (e?.message || e));
    } finally {
      setOcrIdx(null);
    }
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">立替経費</h2>
      {form.expenses.length === 0 && (
        <p className="text-sm text-stone-500">
          経費がなければそのまま「次へ」でOK
        </p>
      )}
      {form.expenses.map((e, i) => (
        <div
          key={i}
          className="border border-stone-200 rounded-xl p-3 space-y-2"
        >
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-stone-600">
              #{i + 1}
            </span>
            <button
              type="button"
              onClick={() => removeExpense(i)}
              className="text-xs text-red-600"
            >
              削除
            </button>
          </div>
          <input
            className="field"
            placeholder="内容（例：割り箸）"
            value={e.description}
            onChange={(ev) => updateExpense(i, { description: ev.target.value })}
          />
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500">
              ¥
            </span>
            <input
              type="number"
              inputMode="numeric"
              className="field pl-8 text-right"
              placeholder="金額"
              value={e.amount || ""}
              onChange={(ev) =>
                updateExpense(i, {
                  amount: parseInt(ev.target.value || "0", 10),
                })
              }
            />
          </div>
          <label className="block">
            <span className="btn-secondary inline-block w-full text-center cursor-pointer">
              {ocrIdx === i
                ? "読み取り中…"
                : e.receipt_image_url
                ? "📷 レシート再撮影"
                : "📷 レシートを撮影"}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (file) handlePhoto(i, file);
              }}
            />
          </label>
          {e.receipt_image_url && (
            <img
              src={e.receipt_image_url}
              alt="receipt"
              className="w-full max-h-40 object-contain rounded-lg border"
            />
          )}
        </div>
      ))}
      <button onClick={addExpense} className="btn-secondary w-full">
        ＋ 経費を追加
      </button>
      <div className="bg-stone-100 rounded-xl p-4 flex justify-between items-center">
        <span className="text-stone-600">経費合計</span>
        <span className="text-xl font-bold text-brand-dark">
          {yen(expensesTotal)}
        </span>
      </div>
    </section>
  );
}

/* ---------- STEP 6 ---------- */
function Step6({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">引き継ぎ事項</h2>
      <p className="text-sm text-stone-500">任意</p>
      <textarea
        className="field min-h-[160px]"
        placeholder="次の担当者への連絡事項など"
        value={form.handover}
        onChange={(e) => update("handover", e.target.value)}
      />
    </section>
  );
}

/* ---------- STEP 7 ---------- */
function Step7({
  form,
  cumulative,
  registerTotal,
  expensesTotal,
  lineText,
  onGenerate,
  onCopy,
  copied,
  onSave,
  saving,
  savedId,
  onReset,
}: {
  form: FormState;
  cumulative: number;
  registerTotal: number;
  expensesTotal: number;
  lineText: string;
  onGenerate: () => void;
  onCopy: () => void;
  copied: boolean;
  onSave: () => void;
  saving: boolean;
  savedId: string | null;
  onReset: () => void;
}) {
  const sales = form.sales_amount || 0;
  const food = Math.round(sales * 0.25);
  const labor = 10000;
  const rent = Math.round(sales * 0.1);
  const costTotal = food + labor + rent;
  const profit = sales - costTotal;

  return (
    <section className="space-y-4">
      <div className="card space-y-2">
        <h2 className="text-lg font-bold">確認</h2>
        <Row k="日付" v={form.date} />
        <Row k="場所" v={form.location} />
        <Row k="担当" v={form.staff_name} />
        <Row k="本日売上" v={yen(sales)} />
        <Row k="累計売上" v={yen(cumulative)} />
        <Row k="レジ合計" v={`${yen(registerTotal)}（${form.register_ok ? "OK" : "差異あり"}）`} />
        <Row
          k="在庫残"
          v={`手羽${form.remaining.tebasaki} / 餃子${form.remaining.gyoza} / ポテト${form.remaining.potato} / トルネード${form.remaining.tornado}`}
        />
        <Row k="経費件数" v={`${form.expenses.length}件（${yen(expensesTotal)}）`} />
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">粗利（自動計算）</h3>
        <Row k="原価概算 Food (25%)" v={yen(food)} />
        <Row k="日当 Labor" v={yen(labor)} />
        <Row k="場代 Rent (10%)" v={yen(rent)} />
        <Row k="立替経費" v={yen(expensesTotal)} />
        <Row k="経費合計" v={yen(costTotal)} />
        <div className="flex justify-between border-t pt-2 mt-2">
          <span className="font-bold">粗利</span>
          <span
            className={`text-2xl font-extrabold ${
              profit >= 0 ? "text-brand-dark" : "text-red-600"
            }`}
          >
            {yen(profit)}
          </span>
        </div>
      </div>

      <button onClick={onGenerate} className="btn-primary w-full">
        LINE用テキストを生成
      </button>

      {lineText && (
        <div className="card space-y-3">
          <textarea
            readOnly
            value={lineText}
            className="field font-mono text-sm min-h-[260px]"
          />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onCopy} className="btn-secondary">
              {copied ? "コピー済み ✓" : "コピー"}
            </button>
            <button
              onClick={onSave}
              disabled={saving || !!savedId}
              className="btn-primary"
            >
              {savedId ? "保存済み ✓" : saving ? "保存中…" : "Supabaseに保存"}
            </button>
          </div>
          {savedId && (
            <button onClick={onReset} className="btn-secondary w-full">
              新しい日報を入力
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-stone-500">{k}</span>
      <span className="font-semibold text-right">{v}</span>
    </div>
  );
}
