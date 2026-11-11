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
 * ★手羽屋（印が空）は、加盟店の担当がいまゆうやさんだけなので自動で入る。
 * ★「写真だけの日報」のお店（lib/photoShop.ts・2026-11-11 牟田町店）もここを使う。
 *   場所は1つで固定・場代なし・LINE は送らない・ランクと原価率の見張りは動かさない。
 *   手羽屋のときの動きは1つも変えていない（shop が null のときは今までと同じ道を通る）。
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { applyTenantScope, TEBAYA_SCOPE, tenantStamp, type TenantScope } from "@/lib/tenantScope";
import { photoShopFor, type PhotoShop } from "@/lib/photoShop";
import { currentShopScope } from "@/lib/keiri/readSource";
import { fetchBoothFeeRules } from "@/lib/boothFeeMaster";
import { boothFeeRuleFor } from "@/lib/boothFee";
import type { BoothFeeRule } from "@/lib/money";
import type { SaleProduct } from "@/lib/salesBreakdown";
import { resizeImage } from "@/lib/imageResize";
import { uploadReceiptOrKeep } from "@/lib/receiptStorage";
import { recalcRankForLocation } from "@/lib/locationRankUpdate";
import { watchCostsFromReport } from "@/lib/costWatchStore";
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

/** 日付を1日ずらす（"2026-11-09" → "2026-11-08"） */
function shiftDate(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

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
  // 「写真だけの日報」のお店（牟田町店など）なら、そのお店として開く。
  // それ以外は今までどおり：手羽屋は通し、ほかのお店には門を掛ける。
  const [checked, setChecked] = useState(false);
  const [shop, setShop] = useState<PhotoShop | null>(null);
  useEffect(() => {
    setShop(photoShopFor(currentShopScope()));
    setChecked(true);
  }, []);
  if (!checked) {
    return (
      <main className="max-w-md mx-auto px-4 py-5">
        <p className="text-sm text-stone-500">読み込み中…</p>
      </main>
    );
  }
  if (shop) return <PhotoReportPage shop={shop} />;
  return (
    <TebayaOnlyGate title="写真で日報">
      <PhotoReportPage shop={null} />
    </TebayaOnlyGate>
  );
}

function PhotoReportPage({ shop }: { shop: PhotoShop | null }) {
  // どのお店の棚を読み書きするか。手羽屋は今までどおり「印が空」
  const scope: TenantScope = shop ? shop.tenantId : TEBAYA_SCOPE;
  const staffName = shop ? shop.staffName : FRANCHISE_STAFF_NAME;
  const [step, setStep] = useState<Step>("place");
  // 日付は今日が初め。出し忘れた日の分も出せるように選べる（2026-11-09 現場の声）
  const today = todayJst();
  const [date, setDate] = useState(today);
  const [locations, setLocations] = useState<string[]>([]);
  const [locLoading, setLocLoading] = useState(true);
  const [location, setLocation] = useState(shop ? shop.location : "");
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
            scope,
          )
            .eq("is_active", true)
            .order("name"),
          applyTenantScope<any>(
            supabase
              .from("sale_products")
              .select("id, shop, name, price, kind, is_active, sort_order") as any,
            scope,
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
    // 場代の決まりは手羽屋の出店場所マスタのもの。固定のお店には場代が無いので読まない
    if (!shop) fetchBoothFeeRules().then(setRules);
  }, [scope, shop]);

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
  // 固定のお店は、1日の人件費の決まった額を初めから入れておく（最後の確認で直せる）
  const [adj, setAdj] = useState<Adjustments>(
    shop ? { ...NO_ADJUSTMENTS, labor: shop.defaultLaborPerDay } : NO_ADJUSTMENTS,
  );
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
          .insert({ ...tenantStamp(scope), ...place.masterRow });
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
          scope,
        )
          .eq("date", date)
          .eq("staff_name", staffName)
          .eq("shop", "手羽屋")
          .limit(1);
        if ((dup as unknown[] | null)?.length) {
          if (!window.confirm(`${date.slice(5).replace("-", "/")} の日報はもう出ています。もう1枚出しますか？`)) {
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
          scope,
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
        if (url && !uploaded.has(url)) uploaded.set(url, await uploadReceiptOrKeep(url, "report", scope));
      }
      const expensesForSave = draft.expenses.map((e) => ({
        ...e,
        receipt_image_url: e.receipt_image_url ? uploaded.get(e.receipt_image_url) ?? e.receipt_image_url : null,
      }));
      const slipImages: string[] = [];
      for (const shot of slipShots) {
        if (shot.slips.length === 0) continue;
        const url = await uploadReceiptOrKeep(shot.photo, "sales-slip", scope);
        if (url) slipImages.push(url);
      }

      const lineText = photoReportLineText({
        date,
        location,
        staffName,
        draft,
        flavors: memo?.flavors,
        newPlace: isNewPlace,
      });
      const row = buildDailyReportRow({
        date,
        location,
        staffName,
        draft,
        products,
        cumulativeBefore,
        expensesForSave,
        lineText,
        cleanupInventory: initialCleanupInventory(),
        cleanupTasks: initialCleanupTasks(),
        slipImages,
      });

      // 固定のお店の日報には、そのお店の印を付ける（手羽屋は今までどおり印が空）
      const { data: saved, error } = await supabase
        .from("daily_reports")
        .insert(shop ? { ...row, ...tenantStamp(scope) } : row)
        .select("id");
      if (error) throw error;

      // 固定のお店はここまで。ランク・原価率の見張り・LINE は手羽屋のものなので動かさない
      // （手羽屋のスタッフのLINEグループに、よその店の数字を流さない）
      if (shop) {
        setStep("done");
        return;
      }

      try {
        await recalcRankForLocation(location);
      } catch {}
      // 原価率の見張り（現場の手数はゼロ。レシートの品物から材料の単価を拾い、
      // 目安を超えた商品があれば LINE に1行添える。失敗しても日報はもう保存済み）
      let costText = "";
      try {
        costText = await Promise.race([
          watchCostsFromReport({
            reportId: (saved as any)?.[0]?.id ?? null,
            date,
            expenses: expensesForSave,
          }),
          new Promise<string>((r) => setTimeout(() => r(""), 5000)),
        ]);
      } catch {}
      try {
        const res = await fetch("/api/line/send-report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: lineText + costText }),
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
        {date.replace(/-/g, "/")}・{staffName}
        {location ? `・${location}` : ""}
      </p>
    </div>
  );

  return (
    <main className="max-w-md mx-auto px-4 py-6 min-h-screen">
      {step === "place" && (
        <section>
          {header(shop ? "いつの日報ですか？" : date === today ? "今日の出店場所は？" : "この日の出店場所は？", 1)}
          {/* 日付（出し忘れた日の分も出せる）。未来の日は選べない */}
          <div className="flex gap-2 mb-4">
            {[
              { label: "今日", value: today },
              { label: "昨日", value: shiftDate(today, -1) },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => setDate(b.value)}
                className={`flex-1 h-14 rounded-2xl font-bold border-2 ${
                  date === b.value ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-stone-200 text-stone-700"
                }`}
              >
                {b.label}
              </button>
            ))}
            <label
              className={`flex-1 h-14 rounded-2xl font-bold border-2 flex items-center justify-center relative ${
                date !== today && date !== shiftDate(today, -1)
                  ? "bg-orange-500 border-orange-500 text-white"
                  : "bg-white border-stone-200 text-stone-700"
              }`}
            >
              {date !== today && date !== shiftDate(today, -1)
                ? `${parseInt(date.slice(5, 7), 10)}/${parseInt(date.slice(8, 10), 10)}`
                : "ほかの日"}
              <input
                type="date"
                max={today}
                value={date}
                onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)}
                className="absolute inset-0 opacity-0"
                aria-label="日付を選ぶ"
              />
            </label>
          </div>
          {shop && (
            <button
              type="button"
              onClick={() => setStep("slips")}
              className="w-full h-20 rounded-2xl bg-orange-500 active:bg-orange-700 text-white font-bold text-xl shadow-md"
            >
              この日で進む
            </button>
          )}
          {!shop && (<>
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
          </>)}
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
            {shop ? "日付を選び直す" : "場所を選び直す"}
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
          {shop && (
            <Link
              href="/month"
              className="flex items-center justify-center w-full h-14 rounded-2xl bg-orange-500 active:bg-orange-700 text-white font-bold"
            >
              今月いくら残っているか見る
            </Link>
          )}
          <Link href="/" className="block text-sm text-stone-500 underline pt-2">
            メニューへ戻る
          </Link>
        </section>
      )}
    </main>
  );
}
