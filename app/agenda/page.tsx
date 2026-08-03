"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { STAFF_OPTIONS } from "@/lib/formState";

/**
 * ミーティング議題（アジェンダ）募集ページ。
 * 従業員が「話したいこと」をメモ感覚で登録し、
 * ミーティング時にみんなで確認しながら「話した」に進める。
 * 意見箱と同じくオープン運用（管理者ゲートなし）。
 */

type Category = "share" | "consult" | "improve" | "problem" | "other";

type Agenda = {
  id: string;
  submitter: string;
  title: string;
  detail: string | null;
  category: Category;
  status: "open" | "done";
  decision: string | null;
  created_at: string;
};

const CATEGORIES: { value: Category; label: string; cls: string }[] = [
  { value: "share", label: "共有", cls: "bg-sky-100 text-sky-800" },
  { value: "consult", label: "相談", cls: "bg-amber-100 text-amber-800" },
  { value: "improve", label: "改善", cls: "bg-emerald-100 text-emerald-800" },
  { value: "problem", label: "困りごと", cls: "bg-rose-100 text-rose-800" },
  { value: "other", label: "その他", cls: "bg-stone-200 text-stone-700" },
];
const catOf = (c: Category) =>
  CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[4];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const j = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`;
}

export default function AgendaPage() {
  const [items, setItems] = useState<Agenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 追加フォーム
  const [submitter, setSubmitter] = useState("");
  const [otherName, setOtherName] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [category, setCategory] = useState<Category>("share");
  const [saving, setSaving] = useState(false);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("agenda_items")
      .select("id, submitter, title, detail, category, status, decision, created_at")
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    setItems((data as Agenda[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = useMemo(() => items.filter((i) => i.status === "open"), [items]);
  const done = useMemo(
    () => items.filter((i) => i.status === "done").reverse(),
    [items],
  );

  const finalSubmitter = submitter === "__other__" ? otherName.trim() : submitter;

  const add = async () => {
    if (!finalSubmitter) return flash("お名前を選んでください");
    if (!title.trim()) return flash("話したいことを入力してください");
    setSaving(true);
    const { error } = await supabase.from("agenda_items").insert({
      submitter: finalSubmitter,
      title: title.trim(),
      detail: detail.trim() || null,
      category,
    });
    setSaving(false);
    if (error) return flash("追加失敗: " + error.message);
    setTitle("");
    setDetail("");
    setCategory("share");
    flash("追加しました");
    load();
  };

  const patch = async (item: Agenda, changes: Partial<Agenda>) => {
    const { error } = await supabase
      .from("agenda_items")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) return flash("更新失敗: " + error.message);
    load();
  };

  const markDone = (item: Agenda) =>
    patch(item, { status: "done", status_updated_at: new Date().toISOString() } as Partial<Agenda>);
  const reopen = (item: Agenda) => patch(item, { status: "open" });

  const remove = async (item: Agenda) => {
    if (!window.confirm(`「${item.title}」を削除しますか？`)) return;
    const { error } = await supabase
      .from("agenda_items")
      .delete()
      .eq("id", item.id);
    if (error) return flash("削除失敗: " + error.message);
    flash("削除しました");
    load();
  };

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-16 space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
          <Link href="/feedback" className="btn-secondary text-sm">
            💡 意見箱
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-brand-dark text-center">
          🗣️ ミーティング議題
        </h1>
        <p className="text-sm text-stone-600 text-center">
          ミーティングで話したいことを、思いついたときにメモ代わりに追加できます。
          当日はこのページを見ながら進め、話し終わったら「話した」に動かします。
        </p>
      </header>

      {error && (
        <div className="card bg-red-50 border border-red-200 text-red-700 text-sm">
          エラー: {error}
        </div>
      )}
      {msg && (
        <div className="card bg-green-50 border border-green-200 text-green-700 text-sm font-semibold">
          {msg}
        </div>
      )}

      {/* 追加フォーム */}
      <div className="card space-y-3 bg-brand/5 border border-brand/20">
        <div className="font-bold text-brand-dark">＋ 話したいことを追加</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">お名前</label>
            <select
              className="field"
              value={submitter}
              onChange={(e) => setSubmitter(e.target.value)}
            >
              <option value="">選択</option>
              {STAFF_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="__other__">その他</option>
            </select>
            {submitter === "__other__" && (
              <input
                className="field mt-1"
                placeholder="名前"
                value={otherName}
                onChange={(e) => setOtherName(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="label">種類</label>
            <select
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">話したいこと</label>
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：レジのおつり補充のタイミングを決めたい"
          />
        </div>
        <div>
          <label className="label">補足メモ（任意）</label>
          <textarea
            className="field min-h-[60px]"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="背景や具体例など、あれば"
          />
        </div>
        <button onClick={add} disabled={saving} className="btn-primary w-full">
          {saving ? "追加中…" : "追加する"}
        </button>
      </div>

      {loading && <p className="text-center text-sm text-stone-500">読み込み中…</p>}

      {/* これから話す */}
      {!loading && (
        <section className="space-y-2">
          <h2 className="font-bold text-stone-700">
            🗣️ これから話したいこと（{open.length}）
          </h2>
          {open.length === 0 && (
            <p className="text-sm text-stone-400 py-2">
              まだ議題がありません。上のフォームから追加してください。
            </p>
          )}
          {open.map((it) => (
            <AgendaCard
              key={it.id}
              item={it}
              onDone={() => markDone(it)}
              onRemove={() => remove(it)}
              onDecision={(text) => patch(it, { decision: text || null })}
            />
          ))}
        </section>
      )}

      {/* 話し終わった */}
      {!loading && done.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="font-bold text-stone-500">✅ 話し終わった（{done.length}）</h2>
          {done.map((it) => (
            <AgendaCard
              key={it.id}
              item={it}
              doneView
              onReopen={() => reopen(it)}
              onRemove={() => remove(it)}
              onDecision={(text) => patch(it, { decision: text || null })}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function AgendaCard({
  item,
  doneView,
  onDone,
  onReopen,
  onRemove,
  onDecision,
}: {
  item: Agenda;
  doneView?: boolean;
  onDone?: () => void;
  onReopen?: () => void;
  onRemove: () => void;
  onDecision: (text: string) => void;
}) {
  const cat = catOf(item.category);
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm ring-1 ring-stone-200 p-4 space-y-2 ${
        doneView ? "opacity-75" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-bold text-stone-800 leading-snug">{item.title}</div>
        <span
          className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${cat.cls}`}
        >
          {cat.label}
        </span>
      </div>
      <div className="text-xs text-stone-500">
        📝 {item.submitter}・{fmtDate(item.created_at)}
      </div>
      {item.detail && (
        <p className="text-sm text-stone-600 bg-stone-50 rounded-lg px-2 py-1 whitespace-pre-wrap">
          {item.detail}
        </p>
      )}

      {/* 決定・メモ（ミーティング時に記入） */}
      <div>
        <label className="text-[11px] text-stone-400">決定・メモ（任意）</label>
        <textarea
          className="field min-h-[44px] text-sm"
          defaultValue={item.decision ?? ""}
          placeholder="ミーティングで決まったこと・次のアクションなど"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (item.decision ?? "")) onDecision(v);
          }}
        />
      </div>

      <div className="flex gap-2 pt-1">
        {!doneView && onDone && (
          <button onClick={onDone} className="btn-primary flex-1 text-sm">
            ✅ 話した
          </button>
        )}
        {doneView && onReopen && (
          <button onClick={onReopen} className="btn-secondary flex-1 text-sm">
            ↩︎ これから話すに戻す
          </button>
        )}
        <button
          onClick={onRemove}
          className="text-sm text-red-600 border border-red-200 rounded-lg px-3 hover:bg-red-50"
        >
          削除
        </button>
      </div>
    </div>
  );
}
