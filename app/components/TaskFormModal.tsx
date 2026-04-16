"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { STAFF_OPTIONS } from "@/lib/formState";
import { todayLocal } from "@/lib/tasks";

type Props = {
  open: boolean;
  defaultAssignee?: string;
  onClose: () => void;
  onCreated: () => void;
};

const PRIORITIES: { value: "high" | "normal" | "low"; label: string }[] = [
  { value: "high", label: "高" },
  { value: "normal", label: "中" },
  { value: "low", label: "低" },
];

function StaffSelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
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
        <option value="">{placeholder}</option>
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

export default function TaskFormModal({
  open,
  defaultAssignee,
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState(defaultAssignee ?? "");
  const [createdBy, setCreatedBy] = useState(defaultAssignee ?? "");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"high" | "normal" | "low">("normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setDescription("");
    setAssignee(defaultAssignee ?? "");
    setCreatedBy(defaultAssignee ?? "");
    setDueDate("");
    setPriority("normal");
    setError(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("タイトルは必須です");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from("tasks").insert({
        title: title.trim(),
        description: description.trim() || null,
        assignee: assignee.trim() || null,
        created_by: createdBy.trim() || null,
        due_date: dueDate || null,
        priority,
        status: "pending",
        line_notified_created: false,
        line_notified_reminder: false,
        line_notified_completed: false,
      });
      if (error) throw error;
      reset();
      onCreated();
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
          <h2 className="text-lg font-bold text-brand-dark">タスク追加</h2>
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
              placeholder="例：チラシ印刷を発注"
            />
          </div>

          <div>
            <label className="label">説明</label>
            <textarea
              className="field min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="詳細メモ"
            />
          </div>

          <div>
            <label className="label">担当者</label>
            <StaffSelect
              value={assignee}
              onChange={setAssignee}
              placeholder="担当者を選択"
            />
          </div>

          <div>
            <label className="label">作成者</label>
            <StaffSelect
              value={createdBy}
              onChange={setCreatedBy}
              placeholder="作成者を選択"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">期限</label>
              <input
                type="date"
                className="field"
                value={dueDate}
                min={todayLocal()}
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
              disabled={saving || !title.trim()}
              className="btn-primary flex-1"
            >
              {saving ? "保存中…" : "追加"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
