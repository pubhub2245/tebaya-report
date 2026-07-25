"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 販売商品マスタ管理（管理者ページ）。
 * お店ごとに商品名・単価・種別を追加/編集/削除できる。
 * ここで登録した商品が日報の本数入力・売上逆算に使われる（第2段で連動）。
 */

type Kind = "primary" | "normal" | "count_only";

type Product = {
  id: number;
  shop: string;
  name: string;
  price: number;
  kind: Kind;
  is_active: boolean;
  sort_order: number;
};

const SHOPS = ["手羽屋", "もも屋"] as const;

const KIND_LABEL: Record<Kind, string> = {
  primary: "主力（売上から本数を逆算）",
  normal: "通常（単価×数を売上から引く）",
  count_only: "記録のみ（お酒など）",
};

const KIND_BADGE: Record<Kind, string> = {
  primary: "bg-orange-100 text-orange-800",
  normal: "bg-sky-100 text-sky-800",
  count_only: "bg-stone-200 text-stone-700",
};

export default function ProductMaster() {
  const [shop, setShop] = useState<string>("手羽屋");
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  // 追加フォーム
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState(0);
  const [newKind, setNewKind] = useState<Kind>("normal");
  const [saving, setSaving] = useState(false);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sale_products")
      .select("id, shop, name, price, kind, is_active, sort_order")
      .eq("shop", shop)
      .order("sort_order")
      .order("id");
    if (error) flash("err", "読込エラー: " + error.message);
    setRows((data as Product[]) ?? []);
    setLoading(false);
  }, [shop]);

  useEffect(() => {
    load();
  }, [load]);

  const hasPrimary = useMemo(
    () => rows.some((r) => r.kind === "primary" && r.is_active),
    [rows],
  );

  const addProduct = async () => {
    if (!newName.trim()) return flash("err", "商品名を入力してください");
    if (newKind === "primary" && hasPrimary) {
      if (
        !window.confirm(
          "このお店には既に「主力（逆算対象）」商品があります。主力は1つだけにするのがおすすめです。それでも追加しますか？",
        )
      )
        return;
    }
    setSaving(true);
    const nextSort =
      rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
    const { error } = await supabase.from("sale_products").insert({
      shop,
      name: newName.trim(),
      price: newKind === "count_only" ? 0 : Math.max(0, newPrice),
      kind: newKind,
      sort_order: nextSort,
    });
    setSaving(false);
    if (error) return flash("err", "追加失敗: " + error.message);
    setNewName("");
    setNewPrice(0);
    setNewKind("normal");
    flash("ok", "商品を追加しました");
    load();
  };

  const patch = async (row: Product, changes: Partial<Product>) => {
    const { error } = await supabase
      .from("sale_products")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return flash("err", "更新失敗: " + error.message);
    load();
  };

  const remove = async (row: Product) => {
    if (!window.confirm(`「${row.name}」を削除しますか？`)) return;
    const { error } = await supabase
      .from("sale_products")
      .delete()
      .eq("id", row.id);
    if (error) return flash("err", "削除失敗: " + error.message);
    flash("ok", "削除しました");
    load();
  };

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-brand-dark">🍗 商品マスタ管理</h2>
      <p className="text-xs text-stone-500">
        お店ごとに商品名と単価を登録します。ここで追加した商品が日報の入力・売上計算に使われます。
      </p>

      {/* お店切替 */}
      <div className="flex rounded-lg border border-stone-300 overflow-hidden max-w-xs">
        {SHOPS.map((s) => (
          <button
            key={s}
            onClick={() => setShop(s)}
            className={`flex-1 text-sm py-2 font-bold ${
              shop === s ? "bg-brand text-white" : "bg-white text-stone-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {msg && (
        <div
          className={`text-sm font-semibold rounded-xl px-3 py-2 ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.kind === "ok" ? "✅" : "❌"} {msg.text}
        </div>
      )}

      {/* 追加フォーム */}
      <div className="card space-y-3 bg-brand/5 border border-brand/20">
        <div className="font-bold text-brand-dark text-sm">
          ＋ {shop}に商品を追加
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="label">商品名</label>
            <input
              className="field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例：もも焼き"
            />
          </div>
          <div>
            <label className="label">単価（記録のみは0でOK）</label>
            <input
              type="number"
              inputMode="numeric"
              className="field text-right"
              value={newPrice || ""}
              onChange={(e) =>
                setNewPrice(Math.max(0, parseInt(e.target.value || "0", 10)))
              }
              placeholder="0"
              disabled={newKind === "count_only"}
            />
          </div>
        </div>
        <div>
          <label className="label">種別</label>
          <select
            className="field"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as Kind)}
          >
            <option value="normal">{KIND_LABEL.normal}</option>
            <option value="primary">{KIND_LABEL.primary}</option>
            <option value="count_only">{KIND_LABEL.count_only}</option>
          </select>
          <p className="text-[11px] text-stone-400 mt-1">
            主力＝そのお店のメイン商品（手羽屋＝手羽先／もも屋＝もも焼き）。売上から本数を自動計算します（各店1つ）。
          </p>
        </div>
        <button
          onClick={addProduct}
          disabled={saving}
          className="btn-primary w-full"
        >
          {saving ? "追加中…" : "この商品を追加"}
        </button>
      </div>

      {/* 一覧 */}
      {loading ? (
        <p className="text-sm text-stone-500">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-400 py-4">
          {shop}の商品はまだありません。上のフォームから追加してください。
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className={`card space-y-2 ${r.is_active ? "" : "opacity-50"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-stone-800">{r.name}</div>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${KIND_BADGE[r.kind]}`}
                >
                  {r.kind === "primary"
                    ? "主力"
                    : r.kind === "count_only"
                      ? "記録のみ"
                      : "通常"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-stone-500">単価 ¥</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="field w-28 text-right py-1"
                  defaultValue={r.price}
                  disabled={r.kind === "count_only"}
                  onBlur={(e) => {
                    const v = Math.max(0, parseInt(e.target.value || "0", 10));
                    if (v !== r.price) patch(r, { price: v });
                  }}
                />
                <select
                  className="field w-auto py-1 text-xs"
                  value={r.kind}
                  onChange={(e) =>
                    patch(r, { kind: e.target.value as Kind })
                  }
                >
                  <option value="normal">通常</option>
                  <option value="primary">主力</option>
                  <option value="count_only">記録のみ</option>
                </select>
                <button
                  onClick={() => patch(r, { is_active: !r.is_active })}
                  className="text-xs border border-stone-300 rounded-lg px-2 py-1 hover:bg-stone-50"
                >
                  {r.is_active ? "無効化" : "有効化"}
                </button>
                <button
                  onClick={() => remove(r)}
                  className="text-xs text-red-600 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 ml-auto"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
