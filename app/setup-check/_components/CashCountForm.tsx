"use client";

import {
  DENOM_ORDER,
  DENOMINATIONS,
  formatDenominationLabel,
  type DenomKey,
} from "@/lib/setupCheck/cashCalculator";
import type { CashCoinCounts } from "@/lib/setupCheck/types";

export default function CashCountForm({
  coins,
  onChange,
}: {
  coins: CashCoinCounts;
  onChange: (next: CashCoinCounts) => void;
}) {
  const update = (key: DenomKey, value: number) => {
    const next = { ...coins };
    if (Number.isFinite(value) && value > 0) {
      next[key] = value;
    } else {
      delete next[key];
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {DENOM_ORDER.map((key) => {
        const denom = DENOMINATIONS[key];
        const count = coins[key] ?? 0;
        return (
          <div
            key={key}
            className="flex items-center gap-2 bg-stone-50 rounded-xl px-3 py-2"
          >
            <div className="w-20 text-right font-semibold text-sm">
              {formatDenominationLabel(denom)}
            </div>
            <span className="text-stone-400">×</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={count || ""}
              onChange={(e) =>
                update(key, parseInt(e.target.value || "0", 10))
              }
              placeholder="0"
              className="field flex-1 text-right py-2"
            />
            <span className="text-xs text-stone-500 w-20 text-right">
              枚 = ¥{(count * denom).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
