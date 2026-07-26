"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 出店場所マスタ管理（設定センター）。
 * locations テーブルの追加・編集・無効化。
 * ※削除はシフト等から参照されるため行わず、無効化(is_active)で運用。
 */

type Loc = {
  id: number;
  name: string;
  rank: string | null;
  target: number | null;
  is_active: boolean;
};

const RANKS = ["S", "A", "B", "C", "D"] as const;
const RANK_TARGET: Record<string, number> = {
  A: 60000,
  B: 50000,
  C: 40000,
  D: 30000,
};

export default function LocationMaster() {
  const [rows, setRows] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const [newName, setNewName] = useState("");
  const [newRank, setNewRank] = useState("C");
  const [newTarget, setNewTarget] = useState(40000);
  const [saving, setSaving] = useState(false);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, rank, target, is_active")
      .order("is_active", { ascending: false })
      .order("name");
    if (error) flash("err", "読込エラー: " + error.message);
    setRows((data as Loc[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!newName.trim()) return flash("err", "場所名を入力してください");
    setSaving(true);
    const { error } = await supabase.from("locations").insert({
      name: newName.trim(),
      rank: newRank,
      target: newTarget || 0,
      is_active: true,
    });
    setSaving(false);
    if (error) return flash("err", "追加失敗: " + error.message);
    setNewName("");
    setNewRank("C");
    setNewTarget(40000);
    flash("ok", "出店場所を追加しました");
    load();
  };

  const patch = async (row: Loc, changes: Partial<Loc>) => {
    const { error } = await supabase
      .from("locations")
      .update(changes)
      .eq("id", row.id);
    if (error) return flash("err", "更新失敗: " + error.message);
    load();
  };

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-brand-dark">📍 出店場所マスタ</h2>
      <p className="text-xs text-stone-500">
        出店場所の追加・ランク・目標の編集ができます。使わなくなった場所は「無効化」で隠せます（履歴は残ります）。
      </p>

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
        <div className="font-bold text-brand-dark text-sm">＋ 出店場所を追加</div>
        <div>
          <label className="label">場所名</label>
          <input
            className="field"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例：〇〇スーパー 前"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">ランク</label>
            <select
              className="field"
              value={newRank}
              onChange={(e) => {
                setNewRank(e.target.value);
                if (RANK_TARGET[e.target.value])
                  setNewTarget(RANK_TARGET[e.target.value]);
              }}
            >
              {RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">売上目標</label>
            <input
              type="number"
              inputMode="numeric"
              className="field text-right"
              value={newTarget || ""}
              onChange={(e) =>
                setNewTarget(Math.max(0, parseInt(e.target.value || "0", 10)))
              }
            />
          </div>
        </div>
        <button onClick={add} disabled={saving} className="btn-primary w-full">
          {saving ? "追加中…" : "この場所を追加"}
        </button>
      </div>

      {/* 一覧 */}
      {loading ? (
        <p className="text-sm text-stone-500">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-400 py-4">出店場所がまだありません。</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className={`card space-y-2 ${r.is_active ? "" : "opacity-50"}`}
            >
              <div className="font-bold text-stone-800">
                {r.name}
                {!r.is_active && (
                  <span className="ml-2 text-xs text-stone-400">（無効）</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  className="field w-auto py-1 text-xs"
                  value={r.rank ?? "C"}
                  onChange={(e) => patch(r, { rank: e.target.value })}
                >
                  {RANKS.map((rk) => (
                    <option key={rk} value={rk}>
                      ランク{rk}
                    </option>
                  ))}
                </select>
                <label className="text-xs text-stone-500">目標 ¥</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="field w-28 text-right py-1"
                  defaultValue={r.target ?? 0}
                  onBlur={(e) => {
                    const v = Math.max(0, parseInt(e.target.value || "0", 10));
                    if (v !== (r.target ?? 0)) patch(r, { target: v });
                  }}
                />
                <button
                  onClick={() => patch(r, { is_active: !r.is_active })}
                  className="text-xs border border-stone-300 rounded-lg px-2 py-1 hover:bg-stone-50 ml-auto"
                >
                  {r.is_active ? "無効化" : "有効化"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
