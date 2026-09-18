"use client";

/** 計算ツールで使う入力欄。見た目をそろえるためだけの部品 */
export function NumberField({
  label,
  hint,
  unit,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-stone-900">{label}</span>
      {hint && <span className="mt-1 block text-xs text-stone-500 leading-relaxed">{hint}</span>}
      <span className="mt-2 flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-right text-lg tabular-nums focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
        />
        <span className="shrink-0 text-sm text-stone-600">{unit}</span>
      </span>
    </label>
  );
}

/** 答えの1行 */
export function ResultRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-amber-200/70 py-3 last:border-b-0">
      <span className={strong ? "text-sm font-bold text-stone-900" : "text-sm text-stone-600"}>{label}</span>
      <span
        className={
          strong
            ? "text-2xl font-bold tabular-nums text-stone-900"
            : "text-lg font-bold tabular-nums text-stone-700"
        }
      >
        {value}
      </span>
    </div>
  );
}
