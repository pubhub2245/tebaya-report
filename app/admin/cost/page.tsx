"use client";

/**
 * 原価率の見張り（/admin/cost）— 管理者だけ。2026-11-10 じゅん決定。
 *
 * 現場は「伝票とレシートを撮るだけ」のまま。レシートの品物から材料の単価が自動で入り、
 * 商品ごとの原価率がここに出る。目安を超えたら日報の LINE に1行添える（lib/costWatchStore.ts）。
 * 最初に1回だけ、ここで「材料」と「材料1単位で何個ぶん作れるか」を決める。
 * 計算は lib/costWatch.ts だけ（tests/costWatch.test.ts）。帳簿の金額には触らない。
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminGate from "@/app/components/AdminGate";
import TebayaOnlyGate from "@/app/components/TebayaOnlyGate";
import { supabase } from "@/lib/supabase";
import { loadCostData, priceMap, type CostData } from "@/lib/costWatchStore";
import { priceForTarget, productCosts } from "@/lib/costWatch";

type LogRow = {
  id: string;
  observed_on: string;
  description: string | null;
  unit_price: number | null;
  applied: boolean;
  reason: string | null;
  material_id: string;
};

const UNITS = ["kg", "g", "L", "ml", "袋", "本", "個", "パック", "枚"];

function CostPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const d = await loadCostData();
      setData(d);
      const { data: l } = await supabase
        .from("cost_price_log")
        .select("id, observed_on, description, unit_price, applied, reason, material_id")
        .order("created_at", { ascending: false })
        .limit(20);
      setLogs((l as any) ?? []);
      setErr("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }
  useEffect(() => {
    reload();
  }, []);

  const names = useMemo(() => new Map((data?.materials ?? []).map((m) => [m.id, m.name])), [data]);
  const costs = useMemo(
    () => (data ? productCosts(data.products, data.recipe, priceMap(data.materials), names, data.targets) : []),
    [data, names],
  );

  async function run(fn: () => PromiseLike<any>) {
    setBusy(true);
    try {
      const r = await fn();
      if (r?.error) throw r.error;
      await reload();
    } catch (e: any) {
      alert("保存できませんでした：" + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (err) return <p className="p-6 text-red-700">読み込めませんでした：{err}</p>;
  if (!data) return <p className="p-6 text-stone-500">読み込み中…</p>;

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-stone-500 underline">
          ← 管理者ページへ
        </Link>
        <h1 className="text-2xl font-bold mt-2">📉 原価率の見張り</h1>
        <p className="text-sm text-stone-600 mt-1">
          現場はこれまでどおりレシートを撮るだけ。レシートの品物から材料の単価が自動で入り、
          目安を超えた商品は日報のLINEでお知らせします。帳簿の金額には影響しません。
        </p>
      </div>

      {/* 商品ごとの原価率 */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">商品ごとの原価率</h2>
        {costs.map((c) => {
          const over = c.ratio !== null && c.ratio > c.target;
          return (
            <div key={c.product_id} className={`rounded-xl border-2 p-4 bg-white ${over ? "border-red-400" : "border-stone-200"}`}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <b className="text-base">{c.name}</b>
                <span className="text-sm text-stone-500">売値 {c.price}円</span>
              </div>
              {c.ratio !== null && c.cost !== null ? (
                <>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden relative">
                      <div className={`h-full ${over ? "bg-red-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, c.ratio * 2)}%` }} />
                      <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-stone-500" style={{ left: `${Math.min(100, c.target * 2)}%` }} />
                    </div>
                    <b className={`text-lg tabular-nums ${over ? "text-red-600" : ""}`}>{c.ratio}%</b>
                  </div>
                  <p className="text-sm text-stone-600 mt-1">
                    1個の原価 {c.cost}円・いちばん効いている材料：{c.top_material}
                    {over && <>　→ 目安に戻す売値 <b>{priceForTarget(c.cost, c.target)}円</b></>}
                  </p>
                </>
              ) : (
                <p className="text-sm text-amber-700 mt-2">
                  {c.no_recipe ? "材料がまだ登録されていません（下の「商品の材料」から足せます）" : `単価が分からない材料：${c.missing.join("・")}`}
                </p>
              )}
              <label className="text-sm text-stone-600 mt-2 flex items-center gap-2">
                目安
                <input
                  type="number"
                  className="w-20 border rounded px-2 py-1"
                  defaultValue={c.target}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!v || v === c.target) return;
                    run(() => supabase.from("cost_targets").upsert({ product_id: c.product_id, target_ratio: v, updated_at: new Date().toISOString() }));
                  }}
                />
                %
              </label>
            </div>
          );
        })}
      </section>

      {/* 材料 */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">材料（単価はレシートから自動で入ります）</h2>
        <div className="space-y-2">
          {data.materials.map((m) => (
            <div key={m.id} className="rounded-xl border border-stone-200 bg-white p-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <b>{m.name}</b>
                <span className="text-sm text-stone-500">（{m.unit}で買う）</span>
                <p className="text-xs text-stone-500 mt-1">
                  見分ける言葉：
                  <input
                    className="border rounded px-1 py-0.5 w-56"
                    defaultValue={m.keywords.join("、")}
                    onBlur={(e) => {
                      const kw = e.target.value.split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean);
                      if (kw.join("、") === m.keywords.join("、")) return;
                      run(() => supabase.from("cost_materials").update({ keywords: kw, updated_at: new Date().toISOString() }).eq("id", m.id));
                    }}
                  />
                </p>
                {m.note && <p className="text-xs text-amber-700 mt-1">{m.note}</p>}
              </div>
              <div className="text-right">
                <label className="text-sm">
                  1{m.unit} =
                  <input
                    type="number"
                    className="w-24 border rounded px-2 py-1 mx-1 text-right"
                    defaultValue={m.unit_price ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v === m.unit_price) return;
                      const today = new Date().toISOString().slice(0, 10);
                      run(async () => {
                        await supabase.from("cost_materials").update({ unit_price: v, price_updated_on: today, price_source: "manual", updated_at: new Date().toISOString() }).eq("id", m.id);
                        return supabase.from("cost_price_log").insert({ material_id: m.id, observed_on: today, description: "管理者ページで手入力", unit_price: v, applied: true });
                      });
                    }}
                  />
                  円
                </label>
                <p className="text-xs text-stone-500 mt-1">
                  {m.price_updated_on ? `${m.price_updated_on.replace(/-/g, "/")}・${m.price_source === "receipt" ? "レシートから" : "手入力"}` : "未入力"}
                </p>
              </div>
            </div>
          ))}
        </div>
        <AddMaterial busy={busy} onAdd={(row) => run(() => supabase.from("cost_materials").insert({ ...row, sort_order: data.materials.length }))} />
      </section>

      {/* 商品の材料 */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">商品の材料（材料1単位で何個ぶん作れるか）</h2>
        {data.products.map((p) => {
          const lines = data.recipe.filter((r) => r.product_id === p.id);
          return (
            <div key={p.id} className="rounded-xl border border-stone-200 bg-white p-3">
              <b>{p.name}</b>
              <ul className="mt-2 space-y-1">
                {lines.map((l) => {
                  const m = data.materials.find((x) => x.id === l.material_id);
                  return (
                    <li key={l.id} className="text-sm flex items-center gap-2 flex-wrap">
                      {m?.name ?? "（材料）"} 1{m?.unit} で
                      <input
                        type="number"
                        className="w-20 border rounded px-2 py-1 text-right"
                        defaultValue={l.yield_per_unit}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!v || v <= 0 || v === l.yield_per_unit) return;
                          run(() => supabase.from("cost_recipes").update({ yield_per_unit: v, updated_at: new Date().toISOString() }).eq("id", l.id));
                        }}
                      />
                      {p.name}ぶん
                      <button
                        className="text-xs text-red-600 underline"
                        disabled={busy}
                        onClick={() => confirm(`${p.name} から ${m?.name} を外しますか？`) && run(() => supabase.from("cost_recipes").delete().eq("id", l.id))}
                      >
                        外す
                      </button>
                    </li>
                  );
                })}
              </ul>
              <AddRecipeLine
                busy={busy}
                materials={data.materials.filter((m) => !lines.some((l) => l.material_id === m.id))}
                onAdd={(material_id, yield_per_unit) => run(() => supabase.from("cost_recipes").insert({ product_id: p.id, material_id, yield_per_unit }))}
              />
            </div>
          );
        })}
      </section>

      {/* レシートから拾った記録 */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">レシートから拾った単価（新しい順）</h2>
        {logs.length === 0 && <p className="text-sm text-stone-500">まだありません。日報でレシートが撮られると、ここに出ます。</p>}
        <ul className="text-sm divide-y bg-white rounded-xl border border-stone-200">
          {logs.map((l) => (
            <li key={l.id} className="p-2">
              <span className="text-stone-500">{l.observed_on.replace(/-/g, "/")}</span>　{names.get(l.material_id) ?? ""}：{l.description}
              <span className="ml-2">{l.unit_price !== null ? `→ ${l.unit_price}円` : ""}</span>
              {!l.applied && <span className="ml-2 text-amber-700">（使わず：{l.reason}）</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function AddMaterial({ busy, onAdd }: { busy: boolean; onAdd: (row: { name: string; unit: string; keywords: string[] }) => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  return (
    <div className="flex gap-2 flex-wrap items-center text-sm">
      <input className="border rounded px-2 py-1" placeholder="材料の名前（例：片栗粉）" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="border rounded px-2 py-1" value={unit} onChange={(e) => setUnit(e.target.value)}>
        {UNITS.map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
      <button
        className="bg-stone-800 text-white rounded px-3 py-1 disabled:opacity-50"
        disabled={busy || !name.trim()}
        onClick={() => {
          onAdd({ name: name.trim(), unit, keywords: [name.trim()] });
          setName("");
        }}
      >
        材料を足す
      </button>
    </div>
  );
}

function AddRecipeLine({
  busy,
  materials,
  onAdd,
}: {
  busy: boolean;
  materials: { id: string; name: string; unit: string }[];
  onAdd: (materialId: string, yieldPerUnit: number) => void;
}) {
  const [mid, setMid] = useState("");
  const [y, setY] = useState("");
  if (materials.length === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap items-center text-sm mt-2">
      <select className="border rounded px-2 py-1" value={mid} onChange={(e) => setMid(e.target.value)}>
        <option value="">材料をえらぶ</option>
        {materials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}（{m.unit}）
          </option>
        ))}
      </select>
      <input type="number" className="w-24 border rounded px-2 py-1" placeholder="何個ぶん" value={y} onChange={(e) => setY(e.target.value)} />
      <button
        className="bg-stone-800 text-white rounded px-3 py-1 disabled:opacity-50"
        disabled={busy || !mid || !(Number(y) > 0)}
        onClick={() => {
          onAdd(mid, Number(y));
          setMid("");
          setY("");
        }}
      >
        足す
      </button>
    </div>
  );
}

export default function AdminCostPage() {
  return (
    <AdminGate>
      <TebayaOnlyGate title="原価率の見張り">
        <CostPage />
      </TebayaOnlyGate>
    </AdminGate>
  );
}

