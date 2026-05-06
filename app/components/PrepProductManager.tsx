"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  PrepProduct,
  SpeedBasis,
} from "@/lib/prepHelpers";

const SPEED_BASIS_OPTIONS: ReadonlyArray<{
  value: SpeedBasis;
  label: string;
  hint: string;
}> = [
  {
    value: "per_100",
    label: "per_100（100本あたり）",
    hint: "速度分数 ÷ 100 × 数量",
  },
  {
    value: "per_session",
    label: "per_session（1セッション固定）",
    hint: "数量に関わらず固定分数",
  },
  {
    value: "per_unit",
    label: "per_unit（1個あたり）",
    hint: "速度分数 × 数量",
  },
];

type FormState = {
  name: string;
  unit_label: string;
  speed_minutes: number;
  speed_basis: SpeedBasis;
  is_carryover_tracked: boolean;
  is_active: boolean;
  effective_from: string;
  effective_until: string;
  display_order: number;
  notes: string;
};

const emptyForm = (): FormState => ({
  name: "",
  unit_label: "本",
  speed_minutes: 60,
  speed_basis: "per_100",
  is_carryover_tracked: false,
  is_active: true,
  effective_from: new Date().toISOString().slice(0, 10),
  effective_until: "",
  display_order: 0,
  notes: "",
});

export default function PrepProductManager() {
  const [products, setProducts] = useState<PrepProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("prep_products")
        .select("*")
        .order("is_active", { ascending: false })
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (err) throw err;
      setProducts((data as PrepProduct[]) ?? []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const startNew = () => {
    setForm(emptyForm());
    setEditingId("new");
  };

  const startEdit = (p: PrepProduct) => {
    setForm({
      name: p.name,
      unit_label: p.unit_label,
      speed_minutes: p.speed_minutes,
      speed_basis: p.speed_basis,
      is_carryover_tracked: p.is_carryover_tracked,
      is_active: p.is_active,
      effective_from: p.effective_from,
      effective_until: p.effective_until ?? "",
      display_order: p.display_order,
      notes: p.notes ?? "",
    });
    setEditingId(p.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFeedback({ kind: "err", text: "商品名は必須です" });
      return;
    }
    if (!form.effective_from) {
      setFeedback({ kind: "err", text: "有効開始日は必須です" });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        name: form.name.trim(),
        unit_label: form.unit_label.trim() || "本",
        speed_minutes: form.speed_minutes,
        speed_basis: form.speed_basis,
        is_carryover_tracked: form.is_carryover_tracked,
        is_active: form.is_active,
        effective_from: form.effective_from,
        effective_until: form.effective_until || null,
        display_order: form.display_order,
        notes: form.notes.trim() || null,
      };
      if (editingId === "new") {
        const { error: err } = await supabase
          .from("prep_products")
          .insert(payload);
        if (err) throw err;
        setFeedback({ kind: "ok", text: "新規商品を登録しました" });
      } else if (editingId) {
        const { error: err } = await supabase
          .from("prep_products")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingId);
        if (err) throw err;
        setFeedback({ kind: "ok", text: "商品情報を更新しました" });
      }
      setEditingId(null);
      await reload();
    } catch (e: any) {
      setFeedback({ kind: "err", text: e?.message || "保存失敗" });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const toggleActive = async (p: PrepProduct) => {
    if (
      !confirm(
        p.is_active
          ? `「${p.name}」を非アクティブにしますか？\n（過去データは残ります）`
          : `「${p.name}」を再アクティブ化しますか？`,
      )
    )
      return;
    try {
      const { error: err } = await supabase
        .from("prep_products")
        .update({
          is_active: !p.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      if (err) throw err;
      await reload();
    } catch (e: any) {
      alert("更新失敗: " + (e?.message || e));
    }
  };

  const activeOnes = useMemo(
    () => products.filter((p) => p.is_active),
    [products],
  );
  const inactiveOnes = useMemo(
    () => products.filter((p) => !p.is_active),
    [products],
  );

  const renderForm = () => (
    <div className="border-2 border-brand bg-amber-50/40 rounded-xl p-3 space-y-2">
      <h3 className="font-bold text-sm text-brand-dark">
        {editingId === "new" ? "新規商品の登録" : "商品の編集"}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <div>
          <label className="label">商品名 *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="field"
            disabled={saving}
          />
        </div>
        <div>
          <label className="label">単位</label>
          <input
            type="text"
            value={form.unit_label}
            onChange={(e) => setForm({ ...form, unit_label: e.target.value })}
            className="field"
            placeholder="本"
            disabled={saving}
          />
        </div>
        <div>
          <label className="label">速度（分）</label>
          <input
            type="number"
            min={0}
            value={form.speed_minutes}
            onChange={(e) =>
              setForm({
                ...form,
                speed_minutes: parseInt(e.target.value || "0", 10),
              })
            }
            className="field"
            disabled={saving}
          />
        </div>
        <div>
          <label className="label">速度計算方式</label>
          <select
            value={form.speed_basis}
            onChange={(e) =>
              setForm({ ...form, speed_basis: e.target.value as SpeedBasis })
            }
            className="field"
            disabled={saving}
          >
            {SPEED_BASIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="text-xs text-stone-500 mt-1">
            {SPEED_BASIS_OPTIONS.find((o) => o.value === form.speed_basis)?.hint}
          </div>
        </div>
        <div>
          <label className="label">有効開始日 *</label>
          <input
            type="date"
            value={form.effective_from}
            onChange={(e) =>
              setForm({ ...form, effective_from: e.target.value })
            }
            className="field"
            disabled={saving}
          />
        </div>
        <div>
          <label className="label">有効終了日（任意）</label>
          <input
            type="date"
            value={form.effective_until}
            onChange={(e) =>
              setForm({ ...form, effective_until: e.target.value })
            }
            className="field"
            disabled={saving}
          />
        </div>
        <div>
          <label className="label">表示順</label>
          <input
            type="number"
            value={form.display_order}
            onChange={(e) =>
              setForm({
                ...form,
                display_order: parseInt(e.target.value || "0", 10),
              })
            }
            className="field"
            disabled={saving}
          />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_carryover_tracked}
              onChange={(e) =>
                setForm({ ...form, is_carryover_tracked: e.target.checked })
              }
              disabled={saving}
            />
            繰越管理する
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
              disabled={saving}
            />
            アクティブ
          </label>
        </div>
      </div>
      <div>
        <label className="label">備考（任意）</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          className="field text-sm"
          disabled={saving}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          className="btn-secondary flex-1 text-sm"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex-1 text-sm"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-brand-dark">🍴 商品マスター管理</h2>
        {editingId === null && (
          <button
            type="button"
            onClick={startNew}
            className="btn-primary text-sm px-3 py-1.5"
          >
            ＋ 新規登録
          </button>
        )}
      </div>
      <p className="text-xs text-stone-600">
        仕込み日報で使う商品の速度・有効期間を管理します。削除は行わず、is_active のトグルで論理削除します。
      </p>

      {feedback && (
        <div
          className={`text-sm font-semibold rounded-xl px-3 py-2 ${
            feedback.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.kind === "ok" ? "✅" : "❌"} {feedback.text}
        </div>
      )}

      {editingId !== null && renderForm()}

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-3 py-2 text-sm font-semibold">
          ❌ {error}
        </div>
      )}

      {!loading && (
        <>
          <div className="space-y-2">
            <div className="text-xs font-bold text-stone-500">アクティブ ({activeOnes.length}件)</div>
            {activeOnes.length === 0 && (
              <p className="text-sm text-stone-400">アクティブな商品はありません</p>
            )}
            {activeOnes.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onEdit={() => startEdit(p)}
                onToggleActive={() => toggleActive(p)}
              />
            ))}
          </div>

          {inactiveOnes.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-stone-200">
              <div className="text-xs font-bold text-stone-500">非アクティブ ({inactiveOnes.length}件)</div>
              {inactiveOnes.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onEdit={() => startEdit(p)}
                  onToggleActive={() => toggleActive(p)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ProductCard({
  product,
  onEdit,
  onToggleActive,
}: {
  product: PrepProduct;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const speedDesc =
    product.speed_basis === "per_100"
      ? `${product.speed_minutes}分/100${product.unit_label}`
      : product.speed_basis === "per_session"
        ? `${product.speed_minutes}分/セッション`
        : `${product.speed_minutes}分/${product.unit_label}`;
  return (
    <div
      className={`border rounded-xl p-3 ${
        product.is_active
          ? "border-stone-200 bg-white"
          : "border-stone-200 bg-stone-50 opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">
            {product.name}
            {product.is_carryover_tracked && (
              <span className="ml-2 text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                繰越管理
              </span>
            )}
          </div>
          <div className="text-xs text-stone-600 mt-1 space-y-0.5">
            <div>速度：{speedDesc}</div>
            <div>
              有効期間：{product.effective_from} 〜{" "}
              {product.effective_until || "（無期限）"}
            </div>
            <div>表示順：{product.display_order}</div>
            {product.notes && <div>備考：{product.notes}</div>}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs bg-stone-200 hover:bg-stone-300 rounded px-2 py-1"
          >
            編集
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            className={`text-xs rounded px-2 py-1 ${
              product.is_active
                ? "bg-yellow-200 hover:bg-yellow-300 text-yellow-900"
                : "bg-green-200 hover:bg-green-300 text-green-900"
            }`}
          >
            {product.is_active ? "非アクティブ化" : "再アクティブ化"}
          </button>
        </div>
      </div>
    </div>
  );
}
