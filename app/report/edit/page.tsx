"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen, slashDate } from "@/lib/format";
import EditReportModal, {
  type EditableReport,
} from "@/app/components/EditReportModal";

/**
 * 従業員が過去の日報を直接修正できるページ（管理者パスワード不要）。
 * 修正すると「誰が・いつ・どこを直したか」が履歴に残る。
 */

type Row = EditableReport & { created_at?: string };

export default function ReportEditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("daily_reports")
      .select("id, date, location, staff_name, shop, sales_amount, labor, register_diff")
      .order("date", { ascending: false })
      .limit(60);
    if (error) setError(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const key = q.trim();
    return (
      (r.date ?? "").includes(key) ||
      (r.staff_name ?? "").includes(key) ||
      (r.location ?? "").includes(key) ||
      (r.shop ?? "").includes(key)
    );
  });

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">✏️ 日報を修正</h1>
        <Link href="/" className="btn-secondary text-sm">
          🏠 トップ
        </Link>
      </header>

      <div className="card bg-blue-50 border border-blue-200 text-sm text-blue-900 space-y-1">
        <p className="font-bold">過去の日報をここで直せます。</p>
        <p className="text-xs leading-relaxed">
          直したい日報の「修正」を押してください。保存するときに
          <b>「修正した人」の名前</b>を必ず入れてください（誰が直したか記録に残ります）。
        </p>
      </div>

      <input
        type="text"
        className="field"
        placeholder="🔍 日付・担当・場所で絞り込み（例: 8/9、かずき）"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {error && (
        <div className="card text-sm bg-red-50 text-red-700 border border-red-200">
          ❌ {error}
        </div>
      )}
      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-stone-400 py-4">該当する日報がありません。</p>
      )}

      <div className="space-y-2">
        {filtered.map((r) => (
          <div
            key={r.id}
            className="card flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="font-bold text-stone-800">
                {slashDate(r.date)}
                <span className="ml-2 text-xs font-normal text-stone-500">
                  {r.shop ?? "手羽屋"}
                </span>
              </div>
              <div className="text-xs text-stone-500 truncate">
                {r.staff_name}
                {r.location ? `｜${r.location}` : ""}
              </div>
              <div className="text-sm font-mono text-stone-700">
                売上 {yen(r.sales_amount ?? 0)}
              </div>
            </div>
            <button
              onClick={() => setEditing(r)}
              className="btn-secondary text-sm shrink-0"
            >
              修正
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditReportModal
          report={editing}
          requireEditor
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setRows((prev) =>
              prev.map((x) =>
                x.id === updated.id ? { ...x, ...updated } : x,
              ),
            );
            setEditing(null);
          }}
        />
      )}

      <p className="text-[11px] text-stone-400 leading-relaxed pt-2">
        ※ 直せるのは日付・担当・お店・場所・売上・日当・レジ差異です。
        商品ごとの本数などは、日報を出し直してください。
      </p>
    </main>
  );
}
