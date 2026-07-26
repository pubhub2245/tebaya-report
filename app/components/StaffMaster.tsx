"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 担当者マスタ管理（設定センター）。
 * staff_members テーブルの追加・編集・無効化・削除。
 */

type Staff = {
  id: string;
  name: string;
  daily_wage: number | null;
  unit_number: number | null;
  is_active: boolean;
};

export default function StaffMaster() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const [newName, setNewName] = useState("");
  const [newWage, setNewWage] = useState(10000);
  const [newUnit, setNewUnit] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_members")
      .select("id, name, daily_wage, unit_number, is_active")
      .order("is_active", { ascending: false })
      .order("name");
    if (error) flash("err", "読込エラー: " + error.message);
    setRows((data as Staff[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!newName.trim()) return flash("err", "名前を入力してください");
    setSaving(true);
    const { error } = await supabase.from("staff_members").insert({
      name: newName.trim(),
      daily_wage: newWage || 0,
      unit_number: newUnit ? parseInt(newUnit, 10) : null,
      is_active: true,
    });
    setSaving(false);
    if (error) return flash("err", "追加失敗: " + error.message);
    setNewName("");
    setNewWage(10000);
    setNewUnit("");
    flash("ok", "担当者を追加しました");
    load();
  };

  const patch = async (row: Staff, changes: Partial<Staff>) => {
    const { error } = await supabase
      .from("staff_members")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return flash("err", "更新失敗: " + error.message);
    load();
  };

  const remove = async (row: Staff) => {
    if (
      !window.confirm(
        `「${row.name}」を削除しますか？（辞めた人は削除より「無効化」がおすすめ）`,
      )
    )
      return;
    const { error } = await supabase
      .from("staff_members")
      .delete()
      .eq("id", row.id);
    if (error) return flash("err", "削除失敗: " + error.message);
    flash("ok", "削除しました");
    load();
  };

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-brand-dark">👤 担当者マスタ</h2>
      <p className="text-xs text-stone-500">
        スタッフの追加・日当・番隊の編集ができます。辞めた人は「無効化」にすると一覧から隠れます。
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
        <div className="font-bold text-brand-dark text-sm">＋ 担当者を追加</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-1">
            <label className="label">名前</label>
            <input
              className="field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例：たろう"
            />
          </div>
          <div>
            <label className="label">日当</label>
            <input
              type="number"
              inputMode="numeric"
              className="field text-right"
              value={newWage || ""}
              onChange={(e) =>
                setNewWage(Math.max(0, parseInt(e.target.value || "0", 10)))
              }
            />
          </div>
          <div>
            <label className="label">番隊（任意）</label>
            <select
              className="field"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
            >
              <option value="">なし</option>
              <option value="1">1番隊</option>
              <option value="2">2番隊</option>
            </select>
          </div>
        </div>
        <button onClick={add} disabled={saving} className="btn-primary w-full">
          {saving ? "追加中…" : "この担当者を追加"}
        </button>
      </div>

      {/* 一覧 */}
      {loading ? (
        <p className="text-sm text-stone-500">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-400 py-4">担当者がまだいません。</p>
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
                <label className="text-xs text-stone-500">日当 ¥</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="field w-24 text-right py-1"
                  defaultValue={r.daily_wage ?? 0}
                  onBlur={(e) => {
                    const v = Math.max(0, parseInt(e.target.value || "0", 10));
                    if (v !== (r.daily_wage ?? 0)) patch(r, { daily_wage: v });
                  }}
                />
                <select
                  className="field w-auto py-1 text-xs"
                  value={r.unit_number ?? ""}
                  onChange={(e) =>
                    patch(r, {
                      unit_number: e.target.value
                        ? parseInt(e.target.value, 10)
                        : null,
                    })
                  }
                >
                  <option value="">番隊なし</option>
                  <option value="1">1番隊</option>
                  <option value="2">2番隊</option>
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
