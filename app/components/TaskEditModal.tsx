"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { STAFF_OPTIONS } from "@/lib/formState";
import { Task } from "@/lib/tasks";

type Props = {
  task: Task | null;
  onClose: () => void;
  onSaved: () => void;
};

const PRIORITIES: { value: "high" | "normal" | "low"; label: string }[] = [
  { value: "high", label: "高" },
  { value: "normal", label: "中" },
  { value: "low", label: "低" },
];

function StaffSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isOther = value !== "" && !STAFF_OPTIONS.includes(value);
  return (
    <div className="space-y-2">
      <select
        className="field"
        value={isOther ? "__other__" : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other__") onChange(" ");
          else onChange(v);
        }}
      >
        <option value="">選択してください</option>
        {STAFF_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="__other__">その他（手入力）</option>
      </select>
      {isOther && (
        <input
          className="field"
          placeholder="名前を入力"
          value={value.trim() === "" ? "" : value}
          onChange={(e) => onChange(e.target.value || " ")}
        />
      )}
    </div>
  );
}

export default function TaskEditModal({ task, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"high" | "normal" | "low">("normal");
  const [status, setStatus] = useState<"pending" | "completed">("pending");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title || "");
    setDescription(task.description || "");
    setAssignee(task.assignee || "");
    setDueDate(task.due_date || "");
    setPriority(task.priority);
    setStatus(task.status);
    setError(null);
  }, [task]);

  if (!task) return null;

  const handleSave = async () => {
    if (!title.trim()) {
      setError("タイトルは必須です");
      return;
    }
    if (!assignee.trim()) {
      setError("担当者は必須です");
      return;
    }
    if (!dueDate) {
      setError("期限は必須です");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const patch: any = {
        title: title.trim(),
        description: description.trim() || null,
        assignee: assignee.trim(),
        due_date: dueDate,
        priority,
        status,
        updated_at: now,
      };
      if (status === "completed" && task.status !== "completed") {
        patch.completed_at = now;
      } else if (status === "pending" && task.status === "completed") {
        patch.completed_at = null;
      }
      // 期限変更 or 未完了に戻した場合 → 通知フラグをリセット
      if (dueDate !== task.due_date || (status === "pending" && task.status === "completed")) {
        patch.line_notified_reminder = false;
        patch.line_notified_overdue = false;
      }
      const { error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", task.id);
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-dark">タスク編集</h2>
          <button
            onClick={onClose}
            className="text-stone-500 text-2xl leading-none px-2"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="label">タイトル *</label>
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="label">説明</label>
            <textarea
              className="field min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="label">担当者 *</label>
            <StaffSelect value={assignee} onChange={setAssignee} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">期限 *</label>
              <input
                type="date"
                className="field"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">優先度</label>
              <select
                className="field"
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">ステータス</label>
            <div className="flex rounded-lg border border-stone-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setStatus("pending")}
                className={`flex-1 py-2 text-sm ${
                  status === "pending"
                    ? "bg-brand text-white font-bold"
                    : "bg-white text-stone-600"
                }`}
              >
                未完了
              </button>
              <button
                type="button"
                onClick={() => setStatus("completed")}
                className={`flex-1 py-2 text-sm ${
                  status === "completed"
                    ? "bg-green-600 text-white font-bold"
                    : "bg-white text-stone-600"
                }`}
              >
                完了
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
