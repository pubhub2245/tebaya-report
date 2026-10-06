/**
 * お試し版（/keiri/demo）で使う、架空のお店の数字。
 *
 * ■ 何のためのファイルか（kp80）
 *   経理パッケージは「申し込んで、払って、初回設定をして」やっと中身が見えます。
 *   それでは買う前に確かめようがないので、**登録も申し込みも要らずに
 *   本物と同じ画面を触れる場所**を作りました。そこで使う数字がここです。
 *
 * ■ 守ること（ここを崩さないこと）
 *   ① **架空のお店です。**実在の店名・住所・人名を入れないこと。
 *      画面にも「架空のお店の数字です」と必ず出すこと。
 *   ② **計算はここに書かない。**利益も現金も未払いも、本物の画面（app/keiri/page.tsx）が
 *      呼んでいるのと**同じ関数**（lib/keiri/aggregate.ts）をそのまま呼びます。
 *      ここで作るのは「入力の材料」だけです。写し取った計算を置くと、
 *      本物を直したときにお試し版だけ古くなります。
 *   ③ **データの倉庫にはつなぎません。**お試し版の画面は supabase の部品を
 *      読み込みません（tests/keiriDemo.test.ts が見張っています）。
 *      保存もしないので、誰が何を入れても他の人には見えません。
 *
 * ■ 対応表は「汎用」を使う
 *   手羽屋の対応表には手羽屋だけの言葉（もも屋・ながやま等）が入っています。
 *   お試し版はよそのお店が触るものなので、申し込んだお店と同じ汎用の対応表を使います
 *   （lib/keiri/templates/generic.ts）。
 */

import type {
  KeiriAdvance,
  KeiriPayment,
  KeiriReport,
  KeiriSettings,
} from "./types";

/** お試し版に出す架空のお店の名前。実在の店名を入れないこと。 */
export const DEMO_SHOP_NAME = "デモ食堂（架空のお店）";

/** 月の頭（YYYY-MM-01）を返す */
export function demoOpeningDate(ym: string): string {
  return `${ym}-01`;
}

/**
 * お試し版の設定。
 *
 * ・数え始めの日 … 表示している月の1日
 * ・数え始めの現金 … 50,000円（つり銭として置いてある想定）
 * ・外注費の率 … 0（手羽屋だけの決まりなので、よそのお店には無い）
 * ・家賃 … 毎月60,000円（表示している月から）
 */
export function demoSettings(ym: string): KeiriSettings {
  return {
    opening_date: demoOpeningDate(ym),
    opening_balance: 50000,
    outsourcing_rate: 0,
    monthly_rent: 60000,
    rent_start_month: ym,
  };
}

/**
 * 最初から入っている日報3件。
 * 「もう何日か使ったお店」の状態から始めたいので、月の3日・8日・14日に置いています。
 */
export function demoReports(ym: string): KeiriReport[] {
  return [
    {
      date: `${ym}-03`,
      location: "駅前広場",
      staff_name: "スタッフA",
      sales_amount: 82000,
      labor: 8000,
      expenses: [
        { description: "肉 仕入れ", amount: 18000 },
        { description: "場代", amount: 8200 },
      ],
    },
    {
      date: `${ym}-08`,
      // ★手羽屋の名寄せ表に載っている名前（「イオン前」など）を使わないこと。
      //   場所別の表だけ「イオンモール」に書き換わり、同じ場所が2つの名前で出ます
      //   （2026-10-02 B2 が本番で見つけた）。
      location: "商店街",
      staff_name: "スタッフB",
      sales_amount: 64000,
      labor: 8000,
      expenses: [
        { description: "野菜 仕入れ", amount: 9500 },
        { description: "ガソリン", amount: 5000 },
      ],
    },
    {
      date: `${ym}-14`,
      location: "駅前広場",
      staff_name: "スタッフA",
      sales_amount: 95000,
      labor: 16000,
      expenses: [
        { description: "肉 仕入れ", amount: 22000 },
        { description: "場代", amount: 9500 },
        { description: "紙皿 消耗品", amount: 3200 },
        // ★対応表にない言葉。わざと1件入れてあります。
        //   分からないものを勝手に決めず「要確認」に出すことを、触って確かめられるように
        //   するためです（2026-10-02・kp219）。消さないでください。
        { description: "保健所 検便", amount: 1800 },
      ],
    },
  ];
}

/**
 * 「実際に払った記録」。お試し版では空にしてあります。
 * 空にすると、給与と家賃が「まだ払っていないお金」にそのまま残るので、
 * この3つ目の数字が何を意味するのかが触ってすぐ分かります。
 */
export function demoPayments(): KeiriPayment[] {
  return [];
}

/**
 * 立替（誰かが自分のお金で先に払った経費）。
 *
 * ■ なぜ見本に入れてあるか（2026-10-02・kp218）
 *   移動販売の出店料は、現金ではなく振込で、しかも誰かが先に払うことがよくあります。
 *   その分を月の経費に入れないと、**利益が実際より大きく出ます**。
 *   お試し版でも「立替が経費に入り、現金はまだ減らず、まだ払っていないお金に出る」
 *   という3つの動きを触って確かめられるようにしてあります。
 *
 * ・1件目 … まだ返していない（まだ払っていないお金に入り、現金は減らない）
 * ・2件目 … 月のうちに返した（返した日に現金から出る）
 */
export function demoAdvances(ym: string): KeiriAdvance[] {
  return [
    {
      date: `${ym}-05`,
      amount: 30000,
      description: "お祭りの出店料（振込）",
      payer: "オーナー",
      settled: false,
      settledDate: null,
      source: "owner",
    },
    {
      date: `${ym}-09`,
      amount: 4500,
      description: "ガソリン",
      payer: "スタッフB",
      settled: true,
      settledDate: `${ym}-12`,
      source: "field",
    },
  ];
}

/** お試し版の入力フォーム1件ぶん（画面から受け取る、まだ数字になっていない文字） */
export type DemoInput = {
  date: string;
  location: string;
  sales: string;
  labor: string;
  expense1Name: string;
  expense1Amount: string;
  expense2Name: string;
  expense2Amount: string;
};

/** 空のフォーム。日付だけは呼ぶ側が決める（今日の日付を入れる） */
export function emptyDemoInput(date: string): DemoInput {
  return {
    date,
    location: "",
    sales: "",
    labor: "",
    expense1Name: "",
    expense1Amount: "",
    expense2Name: "",
    expense2Amount: "",
  };
}

/** 「1,200円」「1200」→ 1200。数字でない文字は落とす。マイナスは受け取らない */
export function demoNumber(text: string): number {
  const n = parseInt(String(text ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * フォームの中身を日報1件に変える。
 * 金額が0の経費は行ごと落とす（0円の経費という嘘の記録を作らないため）。
 */
export function demoInputToReport(input: DemoInput): KeiriReport {
  const expenses: { description: string; amount: number }[] = [];
  const push = (name: string, amount: string) => {
    const yenAmount = demoNumber(amount);
    if (yenAmount <= 0) return;
    expenses.push({ description: name.trim() || "（説明なし）", amount: yenAmount });
  };
  push(input.expense1Name, input.expense1Amount);
  push(input.expense2Name, input.expense2Amount);

  return {
    date: input.date,
    location: input.location.trim() || null,
    staff_name: null,
    sales_amount: demoNumber(input.sales),
    labor: demoNumber(input.labor),
    expenses,
  };
}

/**
 * 日報として受け取れるか。
 * 売上も経費も日当も全部0なら、足しても画面が1つも動かないので断ります。
 */
export function demoInputProblem(input: DemoInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "日付を入れてください。";
  const report = demoInputToReport(input);
  const expenseTotal = (report.expenses as { amount: number }[]).reduce(
    (s, e) => s + e.amount,
    0,
  );
  if ((report.sales_amount || 0) <= 0 && (report.labor || 0) <= 0 && expenseTotal <= 0) {
    return "売上・日当・経費のどれか1つは入れてください。";
  }
  return null;
}

/** 日報を日付の順に並べ直す（あとから前の日を足しても表が崩れないように） */
export function sortDemoReports(reports: KeiriReport[]): KeiriReport[] {
  return [...reports].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * 日本時間の今日（YYYY-MM-DD）。
 *
 * ★この値は**サーバー側（app/keiri/demo/page.tsx）で1回だけ決めて**、
 *   画面に渡します。画面の中で毎回 new Date() を呼ぶと、
 *   サーバーが描いた絵とブラウザが描き直した絵が月末にズレることがあるためです。
 */
export function demoTodayJst(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
