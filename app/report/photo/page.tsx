"use client";

/**
 * 写真だけの日報（2026-11-07 追加）。
 *
 * 現場がやるのは4つだけ：
 *   ① 出店場所をタップ ② その日の伝票（お会計票）を全部撮る ③ レシートを撮る ④ OK
 * 伝票の一番下の「累計」は売上に足さない。答え合わせにだけ使う（2026-11-09）。
 * 数字は1つも打たない。読み取り・場代・合計・LINE通知はアプリがやる。
 * 計算の中身は `lib/photoReport.ts`（tests/photoReport.test.ts で固定）。
 *
 * ★手羽屋（印が空）専用。加盟店の担当はいまゆうやさんだけなので自動で入る。
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { applyTenantScope, TEBAYA_SCOPE, tenantStamp } from "@/lib/tenantScope";
import { fetchBoothFeeRules } from "@/lib/boothFeeMaster";
import { boothFeeRuleFor } from "@/lib/boothFee";
import type { BoothFeeRule } from "@/lib/money";
import type { SaleProduct } from "@/lib/salesBreakdown";
import { resizeImage } from "@/lib/imageResize";
import { uploadReceiptOrKeep } from "@/lib/receiptStorage";
import { recalcRankForLocation } from "@/lib/locationRankUpdate";
import TebayaOnlyGate from "@/app/components/TebayaOnlyGate";
import { initialCleanupInventory, initialCleanupTasks } from "@/lib/formState";
import {
  FRANCHISE_STAFF_NAME,
  buildDailyReportRow,
  buildPhotoReportDraft,
  combineSlips,
  photoReportLineText,
  receiptToExpenses,
  resolveNewPlace,
  applyAdjustments,
  NO_ADJUSTMENTS,
  type Adjustments,
  type PhotoExpense,
  type Slip,
} from "@/lib/photoReport";

type Step = "place" | "slips" | "receipts" | "confirm" | "done";

type SlipShot = { id: string; photo: string; slips: Slip[]; reading: boolean; error?: string };

type ReceiptShot = { id: string; photo: string; expenses: PhotoExpense[]; reading: boolean; error?: string };

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

/** 大きな撮影ボタン（スマホならカメラが開く） */
function ShotButton({
  label,
  onFile,
  disabled,
}: {
  label: string;
  onFile: (f: File) => void;
  disabled?: boolean;
}) {
  return <ShotButtonInner label={label} onFiles={(fs) => fs.forEach(onFile)} disabled={disabled} camera />;
}

function ShotButtonInner({
  label,
  onFiles,
  disabled,
  camera,
}: {
  label: string;
  onFiles: (fs: File[]) => void;
  disabled?: boolean;
  camera?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-center gap-3 w-full h-24 rounded-2xl text-white font-bold text-xl shadow-md transition ${
        disabled ? "bg-stone-300" : "bg-orange-500 active:bg-orange-700 cursor-pointer"
      }`}
    >
      <span className="text-3xl">📷</span>
      <span>{label}</span>
      <input
        type="file"
        accept="image/*"
        capture={camera ? "environment" : undefined}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (fs.length) onFiles(fs);
        }}
      />
    </label>
  );
}

export default function PhotoReportGate() {
  return (
    <TebayaOnlyGate title="写真で日報">
      <PhotoReportPage />
    </TebayaOnlyGate>
  );
}

function PhotoReportPage() {
  const [step, setStep] = useState<Step>("place");
  const [date] = useState(todayJst());
  const [locations, setLocations] = useState<string[]>([]);
  const [locLoading, setLocLoading] = useState(true);
  const [location, setLocation] = useState("");
  // 選択肢に無い場所を打つ欄（2026-11-09）
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [isNewPlace, setIsNewPlace] = useState(false);
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [rules, setRules] = useState<Map<string, BoothFeeRule>>(new Map());

  const [slipShots, setSlipShots] = useState<SlipShot[]>([]);

  const [receipts, setReceipts] = useState<ReceiptShot[]>([]);
  const [saving, setSaving] = useState(false);
  const [lineSent, setLineSent] = useState(false);

  // マスタ（出店場所・商品・場代）を読む。手羽屋のぶんだけ
  useEffect(() => {
    (async () => {
      try {
        const [locRes, prodRes] = await Promise.all([
          applyTenantScope<any>(
            supabase.from("locations").select("name") as any,
            TEBAYA_SCOPE,
          )
            .eq("is_active", true)
            .order("name"),
          applyTenantScope<any>(
            supabase
              .from("sale_products")
              .select("id, shop, name, price, kind, is_active, sort_order") as any,
            TEBAYA_SCOPE,
          )
            .eq("shop", "手羽屋")
            .eq("is_active", true)
            .order("sort_order")
            .order("id"),
        ]);
        setLocations(((locRes.data as { name: string }[]) || []).map((l) => l.name).filter(Boolean));
        setProducts((prodRes.data as SaleProduct[]) || []);
      } finally {
        setLocLoading(false);
      }
    })();
    fetchBoothFeeRules().then(setRules);
  }, []);

  const receiptExpenses = useMemo(() => receipts.flatMap((r) => r.expenses), [receipts]);
  const slipsReading = slipShots.some((s) => s.reading);
  const allSlips = useMemo(() => slipShots.flatMap((s) => s.slips), [slipShots]);
  // 伝票を全部まとめて1日ぶんにする（累計は足さない・答え合わせだけ）
  const memo = useMemo(
    () => (allSlips.length > 0 && !slipsReading ? combineSlips(allSlips, products) : null),
    [allSlips, slipsReading, products],
  );
  const baseDraft = useMemo(
    () =>
      memo
        ? buildPhotoReportDraft({
            date,
            location,
            products,
            memo,
            receiptExpenses,
            boothFeeRule: boothFeeRuleFor(rules, location),
            cumulativeBefore: 0,
          })
        : null,
    [memo, date, location, products, receiptExpenses, rules],
  );

  // 最後の確認での手直し（場代がその日だけ違う・研修の人の人件費など）。触らなければ読み取りどおり
  const [adj, setAdj] = useState<Adjustments>(NO_ADJUSTMENTS);
  const [editing, setEditing] = useState<number | null>(null);
  const [showLabor, setShowLabor] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [extraName, setExtraName] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  // 場所やレシートが変わったら、行の並びが変わるので手直しは最初から
  useEffect(() => {
    setAdj((a) => ({ ...NO_ADJUSTMENTS, labor: a.labor, note: a.note }));
    setEditing(null);
  }, [location, receiptExpenses]);
  const draft = useMemo(() => (baseDraft ? applyAdjustments(baseDraft, adj) : null), [baseDraft, adj]);
  const toNum = (v: string) => Number(v.replace(/[^0-9]/g, "")) || 0;

  /** 打った場所で進む。マスタに無ければ足す（足せなくても日報は止めない） */
  async function chooseTyped() {
    const place = resolveNewPlace(typed, locations);
    if (!place) return;
    setLocation(place.name);
    setIsNewPlace(place.isNew);
    setStep("slips");
    if (place.isNew && place.masterRow) {
      try {
        const { error } = await supabase
          .from("locations")
          .insert({ ...tenantStamp(TEBAYA_SCOPE), ...place.masterRow });
        if (!error) setLocations((ls) => [...ls, place.name].sort());
      } catch {}
    }
  }

  async function addSlip(file: File) {
    const id = `${Date.now()}-${Math.random()}`;
    const photo = await resizeImage(file);
    setSlipShots((xs) => [...xs, { id, photo, slips: [], reading: true }]);
    try {
      const res = await fetch("/api/ocr/sales-slip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: photo, productNames: products.map((p) => p.name) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "読み取りに失敗しました");
      const slips = (json.slips as Slip[]) || [];
      setSlipShots((xs) =>
        xs.map((x) =>
          x.id === id
            ? slips.length
              ? { ...x, slips, reading: false }
              : { ...x, reading: false, error: "伝票が読めませんでした。撮り直してください" }
            : x,
        ),
      );
    } catch {
      setSlipShots((xs) =>
        xs.map((x) => (x.id === id ? { ...x, reading: false, error: "読めませんでした。撮り直してください" } : x)),
      );
    }
  }

  async function addReceipt(file: File) {
    const photo = await resizeImage(file);
    const id = `${Date.now()}-${Math.random()}`;
    setReceipts((rs) => [...rs, { id, photo, expenses: [], reading: true }]);
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: photo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "読み取りに失敗しました");
      const expenses = receiptToExpenses(json, photo);
      setReceipts((rs) => rs.map((r) => (r.id === id ? { ...r, expenses, reading: false } : r)));
    } catch (e: any) {
      setReceipts((rs) =>
        rs.map((r) =>
          r.id === id ? { ...r, reading: false, error: "読めませんでした。撮り直してください" } : r,
        ),
      );
    }
  }

  async function save() {
    if (!draft || draft.salesMissing) return;
    setSaving(true);
    try {
      // 同じ日・同じ担当の日報がもうあれば確かめる（二重登録の防止）
      try {
        const { data: dup } = await applyTenantScope<any>(
          supabase.from("daily_reports").select("id") as any,
          TEBAYA_SCOPE,
        )
          .eq("date", date)
          .eq("staff_name", FRANCHISE_STAFF_NAME)
          .eq("shop", "手羽屋")
          .limit(1);
        if ((dup as unknown[] | null)?.length) {
          if (!window.confirm("今日の日報はもう出ています。もう1枚出しますか？")) {
            setSaving(false);
            return;
          }
        }
      } catch {}

      // 累計売上（手羽屋のぶん）
      let cumulativeBefore = 0;
      try {
        const { data } = await applyTenantScope<any>(
          supabase.from("daily_reports").select("sales_amount") as any,
          TEBAYA_SCOPE,
        );
        cumulativeBefore = ((data as { sales_amount?: number }[]) || []).reduce(
          (s, r) => s + (r.sales_amount || 0),
          0,
        );
      } catch {}

      // 写真は置き場へ（同じ写真は1回だけ → CLAUDE.md 4-7・4-12）
      const uploaded = new Map<string, string | null>();
      for (const e of draft.expenses) {
        const url = e.receipt_image_url;
        if (url && !uploaded.has(url)) uploaded.set(url, await uploadReceiptOrKeep(url, "report", TEBAYA_SCOPE));
      }
      const expensesForSave = draft.expenses.map((e) => ({
        ...e,
        receipt_image_url: e.receipt_image_url ? uploaded.get(e.receipt_image_url) ?? e.receipt_image_url : null,
      }));
      const slipImages: string[] = [];
      for (const shot of slipShots) {
        if (shot.slips.length === 0) continue;
        const url = await uploadReceiptOrKeep(shot.photo, "sales-slip", TEBAYA_SCOPE);
        if (url) slipImages.push(url);
      }

      const lineText = photoReportLineText({
        date,
        location,
        staffName: FRANCHISE_STAFF_NAME,
        draft,
        flavors: memo?.flavors,
        newPlace: isNewPlace,
      });
      const row = buildDailyReportRow({
        date,
        location,
        staffName: FRANCHISE_STAFF_NAME,
        draft,
        products,
        cumulativeBefore,
        expensesForSave,
        lineText,
        cleanupInventory: initialCleanupInventory(),
        cleanupTasks: initialCleanupTasks(),
        slipImages,
      });

      const { error } = await supabase.from("daily_reports").insert(row);
      if (error) throw error;

      try {
        await recalcRankForLocation(location);
      } catch {}
      try {
        const res = await fetch("/api/line/send-report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: lineText }),
        });
        const json = await res.json();
        if (json.ok) setLineSent(true);
      } catch {}

      setStep("done");
    } catch (e: any) {
      alert("保存できませんでした。電波の良い所でもう一度OKを押してください。\n" + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  const header = (title: string, n: number) => (
    <div className="mb-4">
      <Link href="/" className="text-sm text-stone-500 underline">
        ← メニューへ
      </Link>
      <p className="text-xs text-stone-400 mt-3">{n} / 4</p>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-xs text-stone-500">
        {date.replace(/-/g, "/")}・{FRANCHISE_STAFF_NAME}
        {location ? `・${location}` : ""}
      </p>
    </div>
  );

  return (
    <main className="max-w-md mx-auto px-4 py-6 min-h-screen">
      {step === "place" && (
        <section>
          {header("今日の出店場所は？", 1)}
          {locLoading && <p className="text-sm text-stone-500">読み込み中…</p>}
          {!locLoading && locations.length === 0 && (
            <p className="text-sm text-red-600">
              出店場所の一覧が読めませんでした。電波を確かめて、開き直してください。
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {locations.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setLocation(name);
                  setIsNewPlace(false);
                  setStep("slips");
                }}
                className="h-16 rounded-2xl bg-white border-2 border-stone-200 active:border-orange-500 font-bold text-sm px-2 shadow-sm"
              >
                {name}
              </button>
            ))}
          </div>
          {!typing ? (
            <button
              type="button"
              onClick={() => setTyping(true)}
              className="w-full h-16 mt-3 rounded-2xl border-2 border-dashed border-stone-300 text-stone-600 font-bold active:border-orange-500"
            >
              ＋ ここに無い場所（新しい出店先）
            </button>
          ) : (
            <div className="card mt-3 space-y-3">
              <p className="text-sm font-bold">出店先の名前を入れてください</p>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="例：〇〇まつり、〇〇スーパー〇〇店"
                className="w-full h-14 px-4 rounded-xl border-2 border-stone-200 text-lg focus:border-orange-500 outline-none"
              />
              <button
                type="button"
                disabled={!typed.trim()}
                onClick={chooseTyped}
                className="w-full h-14 rounded-2xl bg-orange-500 active:bg-orange-700 text-white font-bold text-lg disabled:bg-stone-300"
              >
                この場所で進む
              </button>
              <p className="text-xs text-stone-500">次からは選択肢に出ます。</p>
            </div>
          )}
        </section>
      )}

      {step === "slips" && (
        <section className="space-y-4">
          {header("今日の伝票を全部撮ってください", 2)}
          <p className="text-sm text-stone-600">
            その日のお会計票を全部選んでください（順番はばらばらで大丈夫です）。
          </p>
          {/* 2026-11-09：アルバムから選ぶ人のほうが多い（じゅん）ので、こちらを大きく上に */}
          <label className="flex items-center justify-center gap-3 w-full h-24 rounded-2xl bg-orange-500 active:bg-orange-700 text-white font-bold text-xl shadow-md cursor-pointer">
            <span className="text-3xl">🖼</span>
            <span>アルバムからまとめて選ぶ</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                e.target.value = "";
                fs.forEach(addSlip);
              }}
            />
          </label>
          <label className="flex items-center justify-center gap-3 w-full h-16 rounded-2xl bg-white border-2 border-stone-200 active:border-orange-500 text-stone-700 font-bold text-lg shadow-sm cursor-pointer">
            <span className="text-2xl">📷</span>
            <span>カメラで撮る</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) addSlip(f);
              }}
            />
          </label>
          {slipShots.length > 0 && (
            <ul className="space-y-2">
              {slipShots.map((x, i) => (
                <li key={x.id} className="card flex items-center gap-3 py-2">
                  <img src={x.photo} alt="" className="w-12 h-12 object-cover rounded" />
                  <span className="text-sm flex-1">
                    {i + 1}枚目：
                    {x.reading
                      ? "読み取り中…"
                      : x.error
                        ? x.error
                        : x.slips
                            .map((sl) => `合計${yen(sl.total)}${sl.cumulative ? `（累計${yen(sl.cumulative)}）` : ""}`)
                            .join("、")}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-stone-400 underline"
                    onClick={() => setSlipShots((xs) => xs.filter((y) => y.id !== x.id))}
                  >
                    取り消す
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={slipsReading || allSlips.length === 0}
            onClick={() => setStep("receipts")}
            className="w-full h-14 rounded-2xl bg-stone-800 text-white font-bold disabled:bg-stone-300"
          >
            {slipsReading ? "読み取り中…" : "伝票は全部撮った → 次へ"}
          </button>
          <button type="button" onClick={() => setStep("place")} className="text-sm text-stone-500 underline">
            場所を選び直す
          </button>
        </section>
      )}

      {step === "receipts" && (
        <section className="space-y-4">
          {header("レシートを撮ってください", 3)}
          <p className="text-sm text-stone-600">今日使ったお金のレシートを1枚ずつ撮ってください（何枚でも）。</p>
          <ShotButton label="レシートを撮る" onFile={addReceipt} />
          {receipts.length > 0 && (
            <ul className="space-y-2">
              {receipts.map((r) => (
                <li key={r.id} className="card flex items-center gap-3 py-2">
                  <img src={r.photo} alt="" className="w-12 h-12 object-cover rounded" />
                  <span className="text-sm flex-1">
                    {r.reading
                      ? "読み取り中…"
                      : r.error
                        ? r.error
                        : yen(r.expenses.reduce((s, e) => s + e.amount, 0))}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-stone-400 underline"
                    onClick={() => setReceipts((rs) => rs.filter((x) => x.id !== r.id))}
                  >
                    取り消す
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={receipts.some((r) => r.reading)}
            onClick={() => setStep("confirm")}
            className="w-full h-14 rounded-2xl bg-stone-800 text-white font-bold disabled:bg-stone-300"
          >
            {receipts.length === 0 ? "今日はレシートなし → 次へ" : "撮り終わった → 次へ"}
          </button>
        </section>
      )}

      {step === "confirm" && draft && (
        <section className="space-y-4">
          {header("これで合っていればOK", 4)}
          <div className="card space-y-2">
            <div className="flex justify-between text-lg">
              <span>売上</span>
              <span className="font-bold">{yen(draft.sales)}</span>
            </div>
            {Object.entries(draft.counts)
              .filter(([, n]) => n > 0)
              .map(([name, n]) => (
                <div key={name} className="flex justify-between text-sm text-stone-600">
                  <span>
                    {name}
                    {name === products.find((p) => p.kind === "primary")?.name && memo && Object.keys(memo.flavors).length > 0
                      ? `（${Object.entries(memo.flavors).map(([f, c]) => `${f}${c}`).join("・")}）`
                      : ""}
                  </span>
                  <span>{n}</span>
                </div>
              ))}
            {memo && memo.lastCumulative > 0 && !draft.mismatch && (
              <p className="text-xs text-emerald-700 pt-1">✅ 伝票{allSlips.length}枚・最後の累計と合っています</p>
            )}
          </div>
          {/* 経費（最後の確認で直せる。2026-11-09 じゅん） */}
          <div className="card space-y-2">
            <p className="font-bold">経費 {yen(draft.expensesTotal)}</p>
            {baseDraft &&
              baseDraft.expenses.map((e, i) => {
                if (adj.removed.includes(i)) return null;
                const amount = adj.amounts[i] ?? e.amount;
                return (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm text-stone-600">
                    <span className="truncate flex-1">{e.description}</span>
                    {editing === i ? (
                      <input
                        autoFocus
                        inputMode="numeric"
                        defaultValue={String(amount)}
                        onBlur={(ev) => {
                          const v = toNum(ev.target.value);
                          setAdj((a) => ({ ...a, amounts: { ...a.amounts, [i]: v } }));
                          setEditing(null);
                        }}
                        className="w-28 h-11 px-2 rounded-lg border-2 border-orange-400 text-right text-base"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing(i)}
                        className="h-11 px-3 rounded-lg bg-stone-100 active:bg-stone-200 font-bold"
                      >
                        {yen(amount)} ✏️
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="この行を消す"
                      onClick={() => setAdj((a) => ({ ...a, removed: [...a.removed, i] }))}
                      className="h-11 w-11 rounded-lg text-stone-400 active:bg-stone-100"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            {adj.extras.map((x, k) => (
              <div key={`x${k}`} className="flex items-center justify-between gap-2 text-sm text-stone-600">
                <span className="truncate flex-1">{x.description}（手入力）</span>
                <span className="font-bold">{yen(x.amount)}</span>
                <button
                  type="button"
                  aria-label="この行を消す"
                  onClick={() => setAdj((a) => ({ ...a, extras: a.extras.filter((_, j) => j !== k) }))}
                  className="h-11 w-11 rounded-lg text-stone-400 active:bg-stone-100"
                >
                  ✕
                </button>
              </div>
            ))}
            {draft.expenses.length === 0 && <p className="text-sm text-stone-500">なし</p>}
            {showExtra ? (
              <div className="flex gap-2 pt-1">
                <input
                  value={extraName}
                  onChange={(e) => setExtraName(e.target.value)}
                  placeholder="何に払った？"
                  className="flex-1 h-12 px-3 rounded-lg border-2 border-stone-200"
                />
                <input
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(e.target.value)}
                  inputMode="numeric"
                  placeholder="金額"
                  className="w-24 h-12 px-2 rounded-lg border-2 border-stone-200 text-right"
                />
                <button
                  type="button"
                  disabled={!extraName.trim() || toNum(extraAmount) <= 0}
                  onClick={() => {
                    setAdj((a) => ({ ...a, extras: [...a.extras, { description: extraName.trim(), amount: toNum(extraAmount) }] }));
                    setExtraName("");
                    setExtraAmount("");
                    setShowExtra(false);
                  }}
                  className="h-12 px-3 rounded-lg bg-orange-500 text-white font-bold disabled:bg-stone-300"
                >
                  足す
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowExtra(true)} className="w-full h-12 rounded-xl border-2 border-dashed border-stone-300 text-stone-600 font-bold">
                ＋ 経費を足す
              </button>
            )}
          </div>

          {/* 人件費（研修の人が入った日など）。ふだんは0なので隠しておく */}
          <div className="card space-y-2">
            {showLabor || adj.labor > 0 ? (
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">人件費</span>
                <input
                  inputMode="numeric"
                  value={adj.labor ? String(adj.labor) : ""}
                  onChange={(e) => setAdj((a) => ({ ...a, labor: toNum(e.target.value) }))}
                  placeholder="0"
                  className="w-32 h-12 px-2 rounded-lg border-2 border-stone-200 text-right text-lg"
                />
              </div>
            ) : (
              <button type="button" onClick={() => setShowLabor(true)} className="w-full h-12 rounded-xl border-2 border-dashed border-stone-300 text-stone-600 font-bold">
                ＋ 人件費を入れる（研修の人など）
              </button>
            )}
          </div>

          {/* ひとことメモ（任意・2026-11-09） */}
          <textarea
            value={adj.note ?? ""}
            onChange={(e) => setAdj((a) => ({ ...a, note: e.target.value }))}
            rows={2}
            placeholder="メモ（あれば）：例）雨で早じまい、研修の〇〇さんが入った"
            className="w-full px-3 py-2 rounded-xl border-2 border-stone-200 text-base focus:border-orange-500 outline-none"
          />

          <div className="flex justify-between items-baseline px-1">
            <span className="text-stone-600">差引（売上 − 経費{draft.labor > 0 ? " − 人件費" : ""}）</span>
            <span className="text-xl font-bold">{yen(draft.sales - draft.expensesTotal - draft.labor)}</span>
          </div>
          {draft.mismatch && (
            <p className="text-sm bg-amber-50 border border-amber-300 rounded-xl p-3">
              ⚠ {draft.mismatch}
              <br />
              <span className="text-xs text-stone-500">このままOKで大丈夫です（あとで本部が確かめます）。</span>
            </p>
          )}
          {draft.salesMissing && (
            <p className="text-sm text-red-600">売上が読めませんでした。伝票を撮り直してください。</p>
          )}
          <button
            type="button"
            disabled={saving || draft.salesMissing}
            onClick={save}
            className="w-full h-20 rounded-2xl bg-orange-500 active:bg-orange-700 text-white font-bold text-2xl shadow-md disabled:bg-stone-300"
          >
            {saving ? "送っています…" : "OK"}
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-stone-500 underline" onClick={() => setStep("slips")}>
              伝票に戻る
            </button>
            <button type="button" className="text-stone-500 underline" onClick={() => setStep("receipts")}>
              レシートに戻る
            </button>
          </div>
        </section>
      )}

      {step === "done" && draft && (
        <section className="card text-center space-y-3 mt-10">
          <div className="text-5xl">✨</div>
          <h2 className="text-xl font-bold">日報を出しました</h2>
          <p className="text-stone-600">今日の売上 {yen(draft.sales)}</p>
          <p className="text-sm text-stone-500">お疲れさまでした！{lineSent ? "（本部に知らせました）" : ""}</p>
          <Link href="/" className="block text-sm text-stone-500 underline pt-2">
            メニューへ戻る
          </Link>
        </section>
      )}
    </main>
  );
}
