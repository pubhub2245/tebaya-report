import Link from "next/link";

type DaySchedule = {
  day: string;
  open: string;
  close: string;
  note?: string;
};

const SCHEDULE: DaySchedule[] = [
  { day: "月曜日", open: "11:00", close: "20:00" },
  { day: "火曜日", open: "11:00", close: "20:00" },
  { day: "水曜日", open: "11:00", close: "20:00" },
  { day: "木曜日", open: "11:00", close: "20:00" },
  { day: "金曜日", open: "11:00", close: "21:00" },
  { day: "土曜日", open: "10:00", close: "21:00" },
  { day: "日曜日", open: "10:00", close: "20:00" },
];

const CLOSED_RULES: string[] = [
  "毎週火曜日は定休日です（催事期間中を除く）",
  "祝日は営業時間が変更になる場合があります",
  "年末年始（12/31〜1/3）は休業いたします",
];

const NOTES: string[] = [
  "上記は通常営業時間です。催事・イベント時は別途お知らせします。",
  "変更がある場合はスタッフまでご確認ください。",
];

export default function BusinessHoursPage() {
  return (
    <main className="max-w-md mx-auto px-4 py-8 min-h-screen">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="text-stone-500 hover:text-stone-700 text-sm underline"
        >
          ← トップへ戻る
        </Link>
      </header>

      <h1 className="text-2xl font-bold text-brand-dark mb-6 text-center">
        🕐 営業時間
      </h1>

      {/* 曜日別スケジュール */}
      <section className="bg-white rounded-2xl shadow-md p-5 mb-5">
        <h2 className="text-lg font-bold text-stone-700 mb-4 border-b border-stone-200 pb-2">
          通常営業時間
        </h2>
        <ul className="space-y-2">
          {SCHEDULE.map((s) => (
            <li
              key={s.day}
              className="flex items-center justify-between text-sm"
            >
              <span className="w-20 font-medium text-stone-700">{s.day}</span>
              <span className="text-stone-600">
                {s.open} 〜 {s.close}
              </span>
              {s.note && (
                <span className="text-xs text-stone-400 ml-2">{s.note}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 定休日・休業ルール */}
      <section className="bg-white rounded-2xl shadow-md p-5 mb-5">
        <h2 className="text-lg font-bold text-stone-700 mb-4 border-b border-stone-200 pb-2">
          定休日・休業日
        </h2>
        <ul className="space-y-2 list-disc list-inside">
          {CLOSED_RULES.map((rule, i) => (
            <li key={i} className="text-sm text-stone-600">
              {rule}
            </li>
          ))}
        </ul>
      </section>

      {/* 備考 */}
      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <h2 className="text-sm font-bold text-amber-700 mb-2">備考</h2>
        <ul className="space-y-1">
          {NOTES.map((note, i) => (
            <li key={i} className="text-xs text-amber-800">
              ※ {note}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
