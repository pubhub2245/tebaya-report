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
import {
  computeSalesBreakdown,
  priceSnapshot,
  isBreakdownResolved,
  diffMessage,
  diffReasonLabel,
  DIFF_REASONS,
  type SaleProduct,
  type SalesBreakdown,
} from "@/lib/salesBreakdown";

const SHOP_OPTIONS = ["手羽屋", "もも屋"] as const;

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
  // マスタ（設定センターで追加した分）を日報の選択肢に反映
  const [masterLocations, setMasterLocations] = useState<string[]>([]);
  const [masterStaff, setMasterStaff] = useState<string[]>([]);

  // 商品マスタ。内訳の突き合わせに使うので親で持つ（STEP4 と保存の両方から見る）
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setProductsLoading(true);
    (async () => {
      const { data } = await supabase
        .from("sale_products")
        .select("id, shop, name, price, kind, is_active, sort_order")
        .eq("shop", form.shop)
        .eq("is_active", true)
        .order("sort_order")
        .order("id");
      if (!alive) return;
      setProducts((data as SaleProduct[]) ?? []);
      setProductsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [form.shop]);

  /**
   * 商品ごとの「単価 × 本数」の合計と、レジで数えた売上の突き合わせ。
   * 合っていなければ STEP4 から先へ進めない（理由を書けば進める）。
   */
  const breakdown: SalesBreakdown = useMemo(
    () =>
      computeSalesBreakdown({
        sales: form.sales_amount || 0,
        products,
        counts: form.momo_counts || {},
        limited:
          form.shop === "もも屋"
            ? null
            : {
                name: form.limited_product_name,
                count: form.limited_product_count,
                price: form.limited_product_price,
              },
      }),
    [
      form.sales_amount,
      products,
      form.momo_counts,
      form.shop,
      form.limited_product_name,
      form.limited_product_count,
      form.limited_product_price,
    ],
  );

  const breakdownResolved = isBreakdownResolved(
    breakdown,
    form.breakdown_diff_reason,
    form.breakdown_diff_note,
  );

  // 合うようになったら、前に選んだ理由は消しておく（古い理由が残らないように）
  useEffect(() => {
    if (breakdown.matched && form.breakdown_diff_reason !== "") {
      update("breakdown_diff_reason", "");
      update("breakdown_diff_note", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown.matched]);

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

  // マスタ（出店場所・担当者）を読み込み、選択肢に反映
  useEffect(() => {
    (async () => {
      try {
        const [locRes, staffRes] = await Promise.all([
          supabase
            .from("locations")
            .select("name")
            .eq("is_active", true)
            .order("name"),
          supabase
            .from("staff_members")
            .select("name")
            .eq("is_active", true)
            .order("name"),
        ]);
        setMasterLocations(
          ((locRes.data as { name: string }[]) || [])
            .map((l) => l.name)
            .filter(Boolean),
        );
        setMasterStaff(
          ((staffRes.data as { name: string }[]) || [])
            .map((s) => s.name)
            .filter(Boolean),
        );
      } catch {}
    })();
  }, []);

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
        setForm((f) => ({
          ...f,
          limited_product_name: preset.product_name,
          limited_product_price: preset.price || f.limited_product_price,
        }));
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
    if (step === 4) return !productsLoading && breakdownResolved;
    if (step === 7) return allTasksCompleted;
    return true;
  };

  const handleGenerate = () => {
    const text = generateLineText(form, cumulative, breakdown);
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
      const text = lineText || generateLineText(form, cumulative, breakdown);
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

      // 二重登録の防止：同じ日付・担当・お店の日報が既にあれば確認する
      // （別のお店＝手羽屋/もも屋は別扱いなので二重にはならない）
      try {
        const { data: dup } = await supabase
          .from("daily_reports")
          .select("id")
          .eq("date", form.date)
          .eq("staff_name", form.staff_name)
          .eq("shop", form.shop)
          .limit(1);
        if (dup && dup.length > 0) {
          const ok = window.confirm(
            "同じ日付・担当・お店の日報がすでに登録されています。\n二重登録になるかもしれません。それでも提出しますか？",
          );
          if (!ok) {
            setSaving(false);
            return;
          }
        }
      } catch (e) {
        console.warn("二重登録チェックでエラー（無視して続行）", e);
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
          shop: form.shop,
          location: form.location,
          staff_name: form.staff_name,
          sales_amount: form.sales_amount,
          cumulative_sales: cumulative,
          register_total: registerTotal,
          register_ok: form.register_ok,
          register_diff: form.register_diff || 0,
          labor: form.labor || 10000,
          // 手羽屋・もも屋とも商品マスタ連動。本数は product_counts(jsonb) に保存し、
          // 既知商品は互換のため従来カラムにも保存（仕込み計算が remaining_tebasaki/gyoza を参照）
          remaining_tebasaki:
            form.shop === "もも屋" ? 0 : form.momo_primary_count || 0,
          remaining_gyoza: form.momo_counts?.["手羽餃子"] || 0,
          remaining_potato: form.momo_counts?.["ポテト"] || 0,
          remaining_tornado: 0,
          remaining_negishio: 0,
          limited_product_name: limitedName,
          limited_product_count: limitedCount,
          allstar_count: form.momo_counts?.["オールスター"] || 0,
          customer_groups: form.customer_groups || 0,
          alcohol_count: form.momo_counts?.["お酒"] || form.alcohol_count || 0,
          product_counts: { ...(form.momo_counts || {}) },
          // その日に使った単価の控え。あとで値上げしても過去の日報を再計算できる
          product_prices: priceSnapshot(breakdown),
          breakdown_total: breakdown.total,
          breakdown_diff: breakdown.diff,
          breakdown_diff_reason: breakdown.matched
            ? null
            : form.breakdown_diff_reason || null,
          breakdown_diff_note: breakdown.matched
            ? null
            : form.breakdown_diff_note.trim() || null,
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
      const text = generateLineText(form, cumulative, breakdown);
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
                "レジから払った経費",
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
        <Step1
          form={form}
          update={update}
          locationOptions={[
            ...LOCATION_OPTIONS,
            ...masterLocations.filter((n) => !LOCATION_OPTIONS.includes(n)),
          ]}
          staffOptions={[
            ...STAFF_OPTIONS,
            ...masterStaff.filter((n) => !STAFF_OPTIONS.includes(n)),
          ]}
        />
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
      {step === 4 && (
        <Step4
          form={form}
          update={update}
          products={products}
          loading={productsLoading}
          breakdown={breakdown}
        />
      )}
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
          breakdown={breakdown}
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
  locationOptions,
  staffOptions,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  locationOptions: string[];
  staffOptions: string[];
}) {
  const [isOther, setIsOther] = useState(
    form.location.length > 0 && !locationOptions.includes(form.location)
  );
  const [isStaffOther, setIsStaffOther] = useState(
    form.staff_name.length > 0 && !staffOptions.includes(form.staff_name)
  );
  return (
    <>
    <section className="card space-y-4">
      <h2 className="text-lg font-bold">基本情報</h2>
      <div>
        <label className="label">お店</label>
        <div className="flex gap-2">
          {SHOP_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (s === form.shop) return;
                update("shop", s);
                // お店が変わったら商品本数はリセット（店ごとに商品が異なるため）
                update("momo_counts", {});
                update("momo_primary_count", 0);
                update("momo_primary_name", "");
                update("breakdown_diff_reason", "");
                update("breakdown_diff_note", "");
              }}
              className={`flex-1 py-3 rounded-xl border font-bold ${
                form.shop === s
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-stone-600 border-stone-300"
              }`}
            >
              {s === "もも屋" ? "🍖 もも屋" : "🍗 手羽屋"}
            </button>
          ))}
        </div>
      </div>
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
          {locationOptions.map((loc) => (
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
          {staffOptions.map((name) => (
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
        <label className="label">日当（自動・手入力できます）</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">
            ¥
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="field pl-8 text-right"
            value={form.labor || ""}
            onChange={(e) =>
              update("labor", Math.max(0, parseInt(e.target.value || "0", 10)))
            }
            placeholder="10000"
          />
        </div>
        <p className="text-[11px] text-stone-400 mt-1">
          担当者に応じて自動で入ります。金額はここで手入力に書き換えられます（担当者を変えると自動の金額に戻ります）。
        </p>
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

/* ---------- STEP 4：商品ごとの本数と、売上との突き合わせ ---------- */
function ProductsStep({
  form,
  update,
  products,
  loading,
  breakdown,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  products: SaleProduct[];
  loading: boolean;
  breakdown: SalesBreakdown;
}) {
  const isTebaya = form.shop !== "もも屋";
  const priced = products.filter((p) => p.kind !== "count_only");
  const countOnly = products.filter((p) => p.kind === "count_only");

  const setCount = (name: string, n: number) => {
    update("momo_counts", { ...(form.momo_counts || {}), [name]: n });
  };

  // 主力商品（手羽先／もも焼き）の本数は保存用にも持っておく
  const primary = products.find((p) => p.kind === "primary");
  useEffect(() => {
    const name = primary?.name ?? "";
    const count = name ? form.momo_counts?.[name] || 0 : 0;
    if (form.momo_primary_name !== name) update("momo_primary_name", name);
    if (form.momo_primary_count !== count) update("momo_primary_count", count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary?.name, form.momo_counts]);

  // お酒だけは従来どおり専用カラムにも保存するので同期しておく
  useEffect(() => {
    const n = form.momo_counts?.["お酒"] || 0;
    if (form.alcohol_count !== n) update("alcohol_count", n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.momo_counts?.["お酒"]]);

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-stone-500">商品を読み込み中…</p>
      </section>
    );
  }

  if (priced.length === 0) {
    return (
      <section className="card space-y-2">
        <h2 className="text-lg font-bold">🍗 販売本数</h2>
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          このお店の商品がまだ登録されていません。管理者ページの「商品マスタ管理」で登録してください。
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">{isTebaya ? "🍗" : "🍖"} 販売本数</h2>
        <p className="text-xs text-stone-500">
          今日売った本数を、商品ごとに入力してください。
          <br />
          入力した本数と単価から売上を計算して、STEP2で入れた売上と合うか確かめます。
          <br />
          商品の追加・単価の変更は「管理者ページ → 設定センター → 商品マスタ」で行えます。
        </p>

        {priced.map((p) => (
          <CountRow
            key={p.id}
            label={
              p.price > 0
                ? `${p.name}（¥${p.price.toLocaleString("ja-JP")}）`
                : `${p.name}（単価が未設定です）`
            }
            unit="個"
            value={form.momo_counts?.[p.name] || 0}
            onChange={(n) => setCount(p.name, n)}
          />
        ))}

        {countOnly.map((p) => (
          <CountRow
            key={p.id}
            label={`${p.name}（本数だけ記録）`}
            unit="本"
            value={form.momo_counts?.[p.name] || 0}
            onChange={(n) => setCount(p.name, n)}
          />
        ))}

        <CountRow
          label="組数（お客さんの組数）"
          unit="組"
          value={form.customer_groups || 0}
          onChange={(n) => update("customer_groups", n)}
        />
      </section>

      {/* 限定商品（手羽屋のみ・任意） */}
      {isTebaya && (
        <section className="card space-y-3 mt-3">
          <h2 className="text-lg font-bold">限定商品</h2>
          <p className="text-xs text-stone-500">
            今月の限定商品を販売した場合のみ入力してください（任意）。
            単価は「管理者ページ → 設定センター → 月次限定商品設定」から自動で入ります。
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">販売本数</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
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
            <div>
              <label className="label">単価（円）</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={10}
                className="field text-right"
                value={form.limited_product_price || ""}
                onChange={(e) =>
                  update(
                    "limited_product_price",
                    Math.max(0, parseInt(e.target.value || "0", 10)),
                  )
                }
                placeholder="例：250"
              />
            </div>
          </div>
        </section>
      )}

      <BreakdownPanel form={form} update={update} breakdown={breakdown} />
    </>
  );
}

/* ---------- 内訳と売上の突き合わせ ---------- */
function BreakdownPanel({
  form,
  update,
  breakdown,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  breakdown: SalesBreakdown;
}) {
  const shown = breakdown.lines.filter((l) => l.counted && l.count > 0);
  const ok = breakdown.matched;

  return (
    <section
      className={`card space-y-3 mt-3 border ${
        ok ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"
      }`}
    >
      <h2
        className={`text-lg font-bold ${ok ? "text-green-900" : "text-red-900"}`}
      >
        🧾 売上の内訳
      </h2>

      {shown.length === 0 ? (
        <p className="text-sm text-stone-600">
          まだ本数が入っていません。上で売った本数を入れてください。
        </p>
      ) : (
        <ul className="text-sm divide-y divide-stone-200 bg-white rounded-xl px-3">
          {shown.map((l) => (
            <li key={l.name} className="flex justify-between py-2">
              <span className="text-stone-700">
                {l.name}
                <span className="text-stone-400 text-xs ml-1">
                  ¥{l.price.toLocaleString("ja-JP")} × {l.count}
                </span>
              </span>
              <span className="font-mono text-stone-800">
                {yen(l.subtotal)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="bg-white rounded-xl px-3 py-2 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-stone-600">内訳の合計</span>
          <span className="font-mono font-bold">{yen(breakdown.total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-600">STEP2で入れた売上</span>
          <span className="font-mono font-bold">{yen(breakdown.sales)}</span>
        </div>
        <div
          className={`flex justify-between pt-1 border-t border-stone-200 ${
            ok ? "text-green-800" : "text-red-800"
          }`}
        >
          <span className="font-bold">差額</span>
          <span className="font-mono font-bold text-lg">
            {breakdown.diff > 0 ? "+" : ""}
            {yen(breakdown.diff)}
          </span>
        </div>
      </div>

      {breakdown.unpricedNames.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          ⚠️ {breakdown.unpricedNames.join("・")}
          の単価が0円のままです。
          {breakdown.unpricedNames.includes("お酒")
            ? "お酒を売上に入れる場合は、管理者ページ → 商品マスタ でお酒の単価を入れて、種別を「通常」に変えてください。"
            : "管理者ページ → 商品マスタ で単価を設定してください。"}
        </p>
      )}

      {ok ? (
        <p className="text-sm font-bold text-green-800">
          ✅ {diffMessage(breakdown)}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-bold text-red-800">
            ⚠️ {diffMessage(breakdown)}
          </p>
          <p className="text-xs text-stone-600">
            まず本数と売上を見直してください。それでも合わないときだけ、
            理由を選ぶと先に進めます。理由は日報に残ります。
          </p>
          <div className="space-y-1">
            {DIFF_REASONS.map((r) => (
              <label
                key={r.key}
                className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-stone-200"
              >
                <input
                  type="radio"
                  name="breakdown_diff_reason"
                  className="w-4 h-4"
                  checked={form.breakdown_diff_reason === r.key}
                  onChange={() => update("breakdown_diff_reason", r.key)}
                />
                <span className="text-sm text-stone-700">{r.label}</span>
              </label>
            ))}
          </div>
          {form.breakdown_diff_reason === "other" && (
            <div>
              <label className="label">なにがあったか</label>
              <input
                type="text"
                className="field"
                value={form.breakdown_diff_note}
                onChange={(e) => update("breakdown_diff_note", e.target.value)}
                placeholder="例：常連さんに1本サービスした"
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- STEP 4 ---------- */
function Step4({
  form,
  update,
  products,
  loading,
  breakdown,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  products: SaleProduct[];
  loading: boolean;
  breakdown: SalesBreakdown;
}) {
  return (
    <ProductsStep
      form={form}
      update={update}
      products={products}
      loading={loading}
      breakdown={breakdown}
    />
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
      <h2 className="text-lg font-bold">レジから払った経費</h2>
      <p className="text-sm text-stone-500 leading-relaxed">
        <b>レジのお金から払った分</b>だけをここに入れてください（場代・肉代・レジ袋など）。
        入れた金額は、その日の手元現金からすぐ引かれます。
        <br />
        経費がなければ、そのまま「次へ」でOKです。
      </p>
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
        💡 <b>自分のお金で立て替えた分は、ここではありません。</b>
        トップの「🧾 立替経費」から登録してください（あとで返してもらうお金として別に記録されます）。
      </p>
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
  breakdown,
  onSave,
  saving,
}: {
  form: FormState;
  cumulative: number;
  registerTotal: number;
  expensesTotal: number;
  breakdown: SalesBreakdown;
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
        <Row k="お店" v={form.shop === "もも屋" ? "🍖 もも屋" : "🍗 手羽屋"} />
        <Row k="場所" v={form.location} />
        <Row k="担当" v={form.staff_name} />
        <Row k="本日売上" v={yen(sales)} />
        <Row k="累計売上" v={yen(cumulative)} />
        <Row k="レジ合計" v={`${yen(registerTotal)}（${form.register_ok ? "OK" : "差異あり"}）`} />
        {Object.entries(form.momo_counts || {})
          .filter(([, n]) => (n as number) > 0)
          .map(([name, n]) => (
            <Row key={name} k={name} v={`${n}個`} />
          ))}
        {form.shop !== "もも屋" && form.limited_product_name.trim() && (
          <Row
            k="限定商品"
            v={`${form.limited_product_name.trim()}${form.limited_product_count > 0 ? ` ${form.limited_product_count}本` : ""}`}
          />
        )}
        {form.customer_groups > 0 && (
          <Row k="組数" v={`${form.customer_groups}組`} />
        )}
        <Row
          k="内訳の合計"
          v={
            breakdown.matched
              ? `${yen(breakdown.total)}（売上とぴったり）`
              : `${yen(breakdown.total)}（差額 ${breakdown.diff > 0 ? "+" : ""}${yen(breakdown.diff)}／${diffReasonLabel(form.breakdown_diff_reason)}）`
          }
        />
        <Row k="レジから払った経費" v={`${form.expenses.length}件（${yen(expensesTotal)}）`} />
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
        <Row k="レジから払った経費" v={yen(expensesTotal)} />
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
