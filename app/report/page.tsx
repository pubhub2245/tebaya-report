"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";
import {
  FormState,
  initialForm,
  STORAGE_KEY,
  laborFor,
  STAFF_OPTIONS,
  InventoryStatus,
  CleanupInventory,
  CleanupTasks,
  CLEANUP_INVENTORY_ITEMS,
  CLEANUP_TASK_ITEMS,
} from "@/lib/formState";
import { generateLineText } from "@/lib/lineText";
import { getUnitFromStaff } from "@/lib/teamMapping";
import { getLimitedProductForMonth } from "@/lib/limitedProduct";
import { calculateTebasakiCount } from "@/lib/calculateTebasakiCount";
import { PRODUCT_PRICES } from "@/lib/productPrices";

const TOTAL_STEPS = 8;

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
  const [lineSent, setLineSent] = useState(false);

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

  // 月次限定商品プリセット読み込み
  // 日付 (form.date) の年月から該当月の登録名を取得し、空欄の場合のみ初期値として埋める
  // ユーザーが既に書き換えていた場合は上書きしない
  useEffect(() => {
    if (!loaded) return;
    if (!form.date) return;
    if (form.limited_product_name.trim() !== "") return;
    let cancelled = false;
    (async () => {
      const preset = await getLimitedProductForMonth(form.date);
      if (cancelled) return;
      if (preset && form.limited_product_name.trim() === "") {
        setForm((f) => ({ ...f, limited_product_name: preset.product_name }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date, loaded]);

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

  // 手羽先使用本数を売上から逆算（リアルタイム）
  const tebasakiCalc = useMemo(
    () =>
      calculateTebasakiCount({
        sales_amount: form.sales_amount || 0,
        gyoza_count: form.remaining.gyoza || 0,
        potato_count: form.remaining.potato || 0,
        tornado_count: form.remaining.tornado || 0,
        limited_count: form.limited_product_count || 0,
        allstar_count: form.allstar_count || 0,
      }),
    [
      form.sales_amount,
      form.remaining.gyoza,
      form.remaining.potato,
      form.remaining.tornado,
      form.limited_product_count,
      form.allstar_count,
    ],
  );

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  const allTasksCompleted = Object.values(form.cleanup_tasks).every((v) => v);
  const remainingTasks = Object.entries(form.cleanup_tasks)
    .filter(([, v]) => !v)
    .map(([name]) => name);

  const canNext = () => {
    if (step === 1)
      return form.date && form.location.trim() && form.staff_name.trim();
    if (step === 2) return form.sales_amount > 0;
    if (step === 7) return allTasksCompleted;
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

      // 代理INSERT（line_textに「【代理INSERT】」マーカー付き）が同じ
      // 日付・担当者で先に存在していたら、本人提出時に自動削除して二重計上を防ぐ
      try {
        await supabase
          .from("daily_reports")
          .delete()
          .eq("date", form.date)
          .eq("staff_name", form.staff_name)
          .ilike("line_text", "%【代理INSERT】%");
      } catch (e) {
        console.warn("代理INSERTの自動削除でエラー（無視して続行）", e);
      }

      // 限定商品: 商品名が空欄なら両方 NULL、本数のみ未入力なら本数のみ NULL
      const limitedNameTrim = form.limited_product_name.trim();
      const limitedName = limitedNameTrim === "" ? null : limitedNameTrim;
      const limitedCount =
        limitedName === null
          ? null
          : form.limited_product_count > 0
            ? form.limited_product_count
            : null;

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
          labor: form.labor || 10000,
          // ねぎ塩はフォームから削除済み。互換性のため0で送信
          // 手羽先は売上から逆算した自動計算値（calculateTebasakiCount）を保存
          remaining_tebasaki: tebasakiCalc.count,
          remaining_gyoza: form.remaining.gyoza,
          remaining_potato: form.remaining.potato,
          remaining_tornado: form.remaining.tornado,
          remaining_negishio: 0,
          limited_product_name: limitedName,
          limited_product_count: limitedCount,
          allstar_count: form.allstar_count || 0,
          customer_groups: form.customer_groups || 0,
          expenses: form.expenses,
          handover: form.handover,
          line_text: text,
          unit_number: form.unit_number || null,
          cleanup_inventory: form.cleanup_inventory,
          cleanup_tasks: form.cleanup_tasks,
        })
        .select("id")
        .single();
      if (error) throw error;
      setSavedId(data.id);
      sessionStorage.removeItem(STORAGE_KEY);

      // LINE自動送信（失敗しても提出は成功とする）
      try {
        const res = await fetch("/api/line/send-report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const json = await res.json();
        if (json.ok) setLineSent(true);
      } catch {
        console.warn("LINE自動送信に失敗しましたが、日報は保存済みです");
      }

      setStep(9);
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
    setLineSent(false);
  };

  if (!loaded) return null;

  if (step === 9) {
    const sales = form.sales_amount || 0;
    if (!lineText) {
      const text = generateLineText(form, cumulative);
      setLineText(text);
    }
    return (
      <main className="max-w-md mx-auto px-4 py-5 min-h-screen flex items-center justify-center">
        <section className="w-full space-y-4">
          <div className="card text-center space-y-3">
            <div className="text-5xl">✨</div>
            <h2 className="text-xl font-bold text-brand-dark">
              お疲れ様でした！
            </h2>
            <p className="text-lg font-bold">日報を提出しました 🍗</p>
            <p className="text-stone-500 text-sm">今日の業務は完了です</p>
            <div className="bg-stone-50 rounded-xl p-4 space-y-2 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">📊 今日の売上</span>
                <span className="font-bold text-brand-dark">
                  {yen(sales)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">📈 累計売上</span>
                <span className="font-bold">{yen(cumulative)}</span>
              </div>
            </div>
            {lineSent && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
                🔔 LINE通知も自動送信しました
              </div>
            )}
            {!lineSent && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
                ⚠️ LINE自動送信できませんでした（手動でコピーしてください）
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <p className="text-sm text-stone-600 text-center">
              {lineSent
                ? "LINEは自動送信済みです。再コピーしたい場合は下のボタンを押してください"
                : "下のボタンを押してLINEグループに貼り付けてください"}
            </p>
            <textarea
              readOnly
              value={lineText}
              className="field font-mono text-sm min-h-[200px]"
            />
            <button
              onClick={handleCopy}
              className="w-full font-bold text-base px-6 py-4 rounded-xl shadow-md transition-colors text-white"
              style={{ background: "#06C755" }}
            >
              {copied
                ? "✅ コピーしました！"
                : lineSent
                ? "📋 LINEテキストを再コピー"
                : "📋 LINEに送る用のテキストをコピー"}
            </button>
          </div>

          <a
            href="/"
            className="block w-full text-center btn-secondary py-3"
          >
            🏠 トップページに戻る
          </a>
          <button
            onClick={resetAll}
            className="w-full text-sm text-stone-500 underline"
          >
            新しい日報を入力する
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-4 py-5 pb-32">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <a
            href="/"
            className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
          >
            🏠 トップ
          </a>
          <a
            href="/interim"
            className="inline-flex items-center gap-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-base px-3 py-2"
          >
            📊 中間報告
          </a>
        </div>
        <a
          href="/report/cancel"
          className="block w-full text-center rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-sm px-3 py-2 mb-2"
        >
          ⚠️ 出店中止を登録（雨・強風・台風など）
        </a>
        <h1 className="text-xl font-bold text-brand-dark text-center">
          手羽屋 営業後日報
        </h1>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-stone-600 mb-1">
            <span>STEP {step} / {TOTAL_STEPS}</span>
            <span>
              {[
                "基本情報",
                "売上",
                "レジ確認",
                "使用本数・限定商品",
                "立替経費",
                "引き継ぎ",
                "片付けチェック",
                "確認・提出",
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
          setForm={setForm}
          update={update}
          expensesTotal={expensesTotal}
        />
      )}
      {step === 6 && <Step6 form={form} update={update} />}
      {step === 7 && <StepCleanup form={form} update={update} remainingTasks={remainingTasks} />}
      {step === 8 && (
        <Step7
          form={form}
          cumulative={cumulative}
          registerTotal={registerTotal}
          expensesTotal={expensesTotal}
          onSave={handleSave}
          saving={saving}
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
  const [isStaffOther, setIsStaffOther] = useState(
    form.staff_name.length > 0 && !STAFF_OPTIONS.includes(form.staff_name)
  );
  return (
    <>
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
          value={isStaffOther ? "__other__" : form.staff_name}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__other__") {
              setIsStaffOther(true);
              update("staff_name", "");
              update("labor", laborFor("", true));
              update("unit_number", "");
            } else {
              setIsStaffOther(false);
              update("staff_name", v);
              update("labor", laborFor(v));
              const u = getUnitFromStaff(v);
              update("unit_number", u ? String(u) : "");
            }
          }}
        >
          <option value="">選択してください</option>
          {STAFF_OPTIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="__other__">その他（手入力）</option>
        </select>
        {isStaffOther && (
          <input
            className="field mt-2"
            placeholder="担当者名を入力"
            value={form.staff_name}
            onChange={(e) => {
              update("staff_name", e.target.value);
              const u = getUnitFromStaff(e.target.value);
              update("unit_number", u ? String(u) : "");
            }}
          />
        )}
      </div>
      <div>
        <label className="label">番隊（自動選択／変更可）</label>
        <div className="grid grid-cols-2 gap-2">
          {["1", "2"].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() =>
                update("unit_number", form.unit_number === n ? "" : n)
              }
              className={`rounded-xl py-3 font-bold border-2 transition-colors ${
                form.unit_number === n
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-stone-700 border-stone-300"
              }`}
            >
              {n}番隊
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">日当（自動）</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
            ¥
          </span>
          <input
            type="number"
            inputMode="numeric"
            className="field pl-8 text-right"
            value={form.labor || ""}
            onChange={(e) =>
              update("labor", parseInt(e.target.value || "0", 10))
            }
            placeholder="10000"
          />
        </div>
      </div>
    </section>
    </>
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
  // DBカラム名は維持。表示ラベルだけ「使用本数」。手羽先・ねぎ塩は廃止。
  const items: { key: keyof FormState["remaining"]; label: string }[] = [
    { key: "gyoza", label: "餃子の使用本数" },
    { key: "potato", label: "ポテトの使用本数" },
    { key: "tornado", label: "トルネードの使用本数" },
  ];
  return (
    <>
      <details
        open
        className="bg-orange-50 border-l-4 border-orange-400 rounded p-3 mb-3"
      >
        <summary className="font-bold text-sm cursor-pointer text-orange-900">
          🟧 手羽先の本数について（タップで開閉）
        </summary>
        <div className="text-xs text-orange-900 mt-2 leading-relaxed space-y-2">
          <p>
            このアプリでは、手羽先の使用本数は「売上から逆算」して自動計算します。
            スタッフが数えるのは餃子・ポテト・トルネード・限定商品の本数だけです。
          </p>
          <div>
            <div className="font-bold">【計算の仕組み】</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>数えた本数 × 単価 = 他商品の合計売上</li>
              <li>その日の売上 − 他商品の合計売上 = 手羽先の売上</li>
              <li>手羽先の売上 ÷ {PRODUCT_PRICES.TEBASAKI}円 = 手羽先の本数（端数切り捨て）</li>
            </ol>
          </div>
          <div>
            <div className="font-bold">【単価】</div>
            餃子 ¥{PRODUCT_PRICES.GYOZA}、ポテト ¥{PRODUCT_PRICES.POTATO}、トルネード ¥{PRODUCT_PRICES.TORNADO}、限定商品 ¥{PRODUCT_PRICES.LIMITED}、手羽先 ¥{PRODUCT_PRICES.TEBASAKI}
          </div>
        </div>
      </details>
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">使用本数</h2>
        <p className="text-xs text-stone-500">
          今日使った本数を入力してください
        </p>
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

        {/* オールスター（¥1,300の詰め合わせ商品） */}
        <CountRow
          label="オールスター（¥1,300）"
          unit="個"
          value={form.allstar_count || 0}
          onChange={(n) => update("allstar_count", n)}
        />

        {/* お客さんの組数（客数） */}
        <CountRow
          label="組数（お客さんの組数）"
          unit="組"
          value={form.customer_groups || 0}
          onChange={(n) => update("customer_groups", n)}
        />
      </section>

      <section className="card space-y-3 mt-3">
        <h2 className="text-lg font-bold">限定商品</h2>
        <p className="text-xs text-stone-500">
          今月の限定商品を販売した場合のみ入力してください（任意）
        </p>
        <div>
          <label className="label">商品名</label>
          <input
            type="text"
            className="field"
            value={form.limited_product_name}
            onChange={(e) => update("limited_product_name", e.target.value)}
            placeholder="例：チキン南蛮"
          />
        </div>
        <div>
          <label className="label">販売本数</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="field text-right"
            value={form.limited_product_count || ""}
            onChange={(e) =>
              update(
                "limited_product_count",
                Math.max(0, parseInt(e.target.value || "0", 10)),
              )
            }
            placeholder="例：12"
          />
        </div>
      </section>

      <TebasakiAutoCalcSection form={form} />
    </>
  );
}

/* ---------- 手羽先 自動計算セクション ---------- */
function TebasakiAutoCalcSection({ form }: { form: FormState }) {
  const calc = useMemo(
    () =>
      calculateTebasakiCount({
        sales_amount: form.sales_amount || 0,
        gyoza_count: form.remaining.gyoza || 0,
        potato_count: form.remaining.potato || 0,
        tornado_count: form.remaining.tornado || 0,
        limited_count: form.limited_product_count || 0,
        allstar_count: form.allstar_count || 0,
      }),
    [
      form.sales_amount,
      form.remaining.gyoza,
      form.remaining.potato,
      form.remaining.tornado,
      form.limited_product_count,
      form.allstar_count,
    ],
  );

  return (
    <section className="card space-y-2 mt-3 bg-orange-50 border border-orange-200">
      <h2 className="text-lg font-bold text-orange-900">
        🍗 手羽先 使用本数（自動計算）
      </h2>
      {calc.warning ? (
        <div className="bg-red-100 text-red-800 border border-red-300 rounded-lg px-3 py-2 text-sm font-semibold">
          ⚠️ {calc.warning}
        </div>
      ) : null}
      <div className="text-center py-2">
        <div className="text-4xl font-bold text-orange-900">{calc.count} 本</div>
      </div>
      <div className="text-xs text-stone-700 bg-white rounded-lg p-2 leading-relaxed break-all">
        {calc.calculation_breakdown}
      </div>
      <p className="text-[11px] text-stone-500">
        ※ 売上と他商品の本数を入力すると自動で計算されます。手動入力は不要です。
      </p>
    </section>
  );
}

/* ---------- STEP 5 ---------- */
function Step5({
  form,
  setForm,
  update,
  expensesTotal,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
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

  // Functional update version to avoid stale closure issues during async OCR
  const updateExpenseSafe = (i: number, patch: Partial<FormState["expenses"][0]>) =>
    setForm((f) => ({
      ...f,
      expenses: f.expenses.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    }));

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
      updateExpenseSafe(i, { receipt_image_url: dataUrl });
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

      if (json?.items && Array.isArray(json.items) && json.items.length > 0) {
        // Items-based OCR: fill current expense + add new ones for extra items
        setForm((f) => {
          const newExpenses = [...f.expenses];
          // First item goes into the current expense slot (index i)
          const first = json.items[0];
          newExpenses[i] = {
            ...newExpenses[i],
            description: first.name || "",
            amount: first.amount || 0,
          };
          // Additional items: insert after index i
          for (let k = 1; k < json.items.length; k++) {
            const item = json.items[k];
            newExpenses.splice(i + k, 0, {
              description: item.name || "",
              amount: item.amount || 0,
              receipt_image_url: null,
            });
          }
          return { ...f, expenses: newExpenses };
        });
      } else if (json?.amount) {
        // Fallback: total amount only
        updateExpenseSafe(i, { amount: json.amount });
      }
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
  onSave,
  saving,
}: {
  form: FormState;
  cumulative: number;
  registerTotal: number;
  expensesTotal: number;
  onSave: () => void;
  saving: boolean;
}) {
  const sales = form.sales_amount || 0;
  const food = Math.round(sales * 0.25);
  const labor = form.labor || 10000;
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
          k="使用本数"
          v={`餃子${form.remaining.gyoza} / ポテト${form.remaining.potato} / トルネード${form.remaining.tornado}`}
        />
        {form.limited_product_name.trim() && (
          <Row
            k="限定商品"
            v={`${form.limited_product_name.trim()}${form.limited_product_count > 0 ? ` ${form.limited_product_count}本` : ""}`}
          />
        )}
        {form.allstar_count > 0 && (
          <Row k="オールスター" v={`${form.allstar_count}個`} />
        )}
        {form.customer_groups > 0 && (
          <Row k="組数" v={`${form.customer_groups}組`} />
        )}
        <Row k="経費件数" v={`${form.expenses.length}件（${yen(expensesTotal)}）`} />
        {form.unit_number && <Row k="番隊" v={`${form.unit_number}番隊`} />}
      </div>

      {/* 片付けチェックサマリー */}
      {(Object.values(form.cleanup_inventory).some((v) => v !== "") ||
        Object.values(form.cleanup_tasks).some((v) => v)) && (
        <div className="card space-y-2">
          <h3 className="font-bold">🧹 片付けチェック</h3>
          {Object.entries(form.cleanup_inventory)
            .filter(([, v]) => v !== "")
            .map(([name, status]) => (
              <Row key={name} k={name} v={status as string} />
            ))}
          {Object.entries(form.cleanup_tasks)
            .filter(([, v]) => v)
            .length > 0 && (
            <Row
              k="完了作業"
              v={Object.entries(form.cleanup_tasks)
                .filter(([, v]) => v)
                .map(([name]) => name)
                .join("、")}
            />
          )}
        </div>
      )}

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

      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-sm text-green-800">
        <p className="font-bold">✅ 入力内容を確認して、下のボタンを押してください</p>
        <p className="text-xs mt-1 text-green-600">
          ※ 提出と同時にLINEグループへ自動送信されます
        </p>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full font-bold text-lg px-6 py-4 rounded-xl shadow-md transition-colors text-white disabled:opacity-50"
        style={{ background: "#059669" }}
      >
        {saving ? "提出中…" : "📤 日報を提出（今日の業務完了）"}
      </button>
    </section>
  );
}

/* ---------- STEP CLEANUP (片付けチェックリスト) ---------- */
function StepCleanup({
  form,
  update,
  remainingTasks,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  remainingTasks: string[];
}) {
  const statusOptions: { value: InventoryStatus; label: string; color: string; bg: string }[] = [
    { value: "○", label: "○", color: "text-white", bg: "bg-green-500" },
    { value: "△", label: "△", color: "text-white", bg: "bg-yellow-500" },
    { value: "×", label: "×", color: "text-white", bg: "bg-red-500" },
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-brand-dark px-1">🧹 片付けチェックリスト</h2>
      {/* 食材・備品（在庫状況） */}
      <div className="card space-y-3">
        <h3 className="font-bold">🍗 食材・備品（在庫状況）</h3>
        <p className="text-xs text-stone-500">
          ○：在庫たくさん　△：使う分はあるがストックなし　×：使う分もほぼなくなっている
        </p>
        <div className="space-y-2">
          {CLEANUP_INVENTORY_ITEMS.map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 bg-stone-50 rounded-xl px-3 py-2"
            >
              <span className="flex-1 font-semibold text-sm">{item}</span>
              <div className="flex gap-1">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      update("cleanup_inventory", {
                        ...form.cleanup_inventory,
                        [item]: form.cleanup_inventory[item] === opt.value ? "" : opt.value,
                      } as CleanupInventory)
                    }
                    className={`w-10 h-10 rounded-lg font-bold text-lg transition-colors ${
                      form.cleanup_inventory[item] === opt.value
                        ? `${opt.bg} ${opt.color}`
                        : "bg-stone-200 text-stone-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 作業確認 */}
      <div className="card space-y-3">
        <h3 className="font-bold">🔧 作業確認</h3>
        <p className="text-xs text-stone-500">
          ※ 全7項目をチェックしてから次へ進めます
        </p>
        <div className="space-y-2">
          {CLEANUP_TASK_ITEMS.map((task) => (
            <label
              key={task}
              className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={form.cleanup_tasks[task]}
                onChange={(e) =>
                  update("cleanup_tasks", {
                    ...form.cleanup_tasks,
                    [task]: e.target.checked,
                  } as CleanupTasks)
                }
                className="w-6 h-6 rounded accent-green-600"
              />
              <span className="font-semibold text-sm">{task}</span>
            </label>
          ))}
        </div>
        {remainingTasks.length > 0 && (
          <p className="text-xs text-red-500">
            残り：{remainingTasks.join("、")}
          </p>
        )}
      </div>
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

/* ---------- 数量入力の共通行（＋／−付き） ---------- */
function CountRow({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2">
      <div className="flex-1 font-semibold">{label}</div>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-10 h-10 rounded-full bg-stone-200 text-xl font-bold"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="field w-20 text-center"
        value={value || ""}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
        placeholder="0"
      />
      <span className="text-stone-500">{unit}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-10 h-10 rounded-full bg-stone-200 text-xl font-bold"
      >
        ＋
      </button>
    </div>
  );
}
