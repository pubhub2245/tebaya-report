/**
 * 倉庫に流す「貼り紙」（supabase/migrations/keiri_shelves_20261005.sql）が
 * **本番で流れたかどうか**を、外から1回で確かめるための判定。ここは**読むだけ**。
 *
 * ■ なぜ要るのか（2026-10-05・kp237）
 *   いま司令室には倉庫へ SQL を流せる係が1人もいません（サーバー側の合鍵が壊れており、
 *   A も B も倉庫への書き込みを禁じられています）。そのため、棚が無いせいで止まっている
 *   仕事（金庫の突き合わせ・重なりの片付け・レシート写真の読み取り）は、
 *   **じゅんが1回 貼る**まで前に進みません。
 *   貼ったかどうかを人が覚えておく形にすると、同じお願いが何度も立ちます。
 *   そこで「棚があるか」を読むだけで分かるようにして、こちら側から確かめます。
 *
 * ■ 守ること
 *   ・1行も書き込まない。中身（金額・お店の名前）も1文字も返さない。
 *   ・棚が無いのは **失敗ではなく「まだ流していない」**。言葉を分ける。
 *   ・鍵・合言葉の値は絶対に返さない。
 */

/** 倉庫から返ってきた「読めなかった理由」の最小の形 */
export type ShelfProbe = {
  /** 1行読めたか（読めた＝棚がある） */
  ok: boolean;
  /** 読めなかったときの番号（PostgreSQL / PostgREST のもの） */
  code?: string | null;
  /** 読めなかったときの文 */
  message?: string | null;
};

export type ShelfState = "ある" | "まだ無い" | "分からない";

export type ShelfReport = {
  /** 貼り紙の何番か（①〜④） */
  step: string;
  /** 人が読む名前 */
  name: string;
  /** 流すと何ができるようになるか（1行） */
  benefit: string;
  state: ShelfState;
  /** 仕上げチェック表のどの項目につながるか */
  check: string;
  note: string;
};

/** 「その棚・その欄がまだ無い」ことを示す番号 */
const MISSING_CODES = new Set([
  "42P01", // 表がない
  "42703", // 列がない
  "PGRST204", // 列が見つからない（PostgREST の言い方）
  "PGRST205", // 表が見つからない（PostgREST の言い方）
  // こちらで「まだ無い」と判断したとき（棚ではなく、貼り紙が作る“行”を見る場合に使う）
  "MISSING",
]);

/**
 * 「棚ではなく、貼り紙が作る“行”がまだ無い」ことを、棚と同じ形で言うための印。
 *
 * 貼り紙⑥は新しい棚を足すのではなく、**テストのお店1行**を作ります。
 * 行が無いのは失敗ではなく「まだ流していない」なので、棚と同じ言い方にそろえます。
 */
export function missingProbe(message: string): ShelfProbe {
  return { ok: false, code: "MISSING", message };
}

export function isMissingShelf(probe: ShelfProbe): boolean {
  if (probe.ok) return false;
  const code = (probe.code ?? "").trim();
  if (MISSING_CODES.has(code)) return true;
  const m = probe.message ?? "";
  // 番号が来ないことがあるので、文の言い方でも拾う
  return /does not exist|could not find|schema cache/i.test(m);
}

export function shelfState(probe: ShelfProbe): ShelfState {
  if (probe.ok) return "ある";
  if (isMissingShelf(probe)) return "まだ無い";
  return "分からない";
}

/** 貼り紙の1行ぶんを、人の言葉にする */
export function describeShelf(
  base: Pick<ShelfReport, "step" | "name" | "benefit" | "check">,
  probe: ShelfProbe,
): ShelfReport {
  const state = shelfState(probe);
  const note =
    state === "ある"
      ? "流れています。ここはもう先へ進められます"
      : state === "まだ無い"
        ? "まだ流れていません。/keiri/sql の貼り紙を1回 貼ると使えるようになります"
        : `確かめられませんでした（${probe.message ?? "理由は分かりません"}）。` +
          "棚が無いのとは別の理由なので、流す前に中身を確かめてください";
  return { ...base, state, note };
}

/** 貼り紙に入っている棚・欄の一覧（表示の順番＝流れる順番） */
export const SHELF_STEPS = [
  {
    key: "cash_events",
    step: "①",
    name: "金庫を数えた記録と、銀行に入れた記録",
    benefit: "「計算上いくら」と「実際に数えていくら」を突き合わせられるようになります",
    check: "f1-4",
  },
  {
    key: "expense_ignores",
    step: "②",
    name: "同じ支払いを「こちらは数えない」と印を付ける棚",
    benefit: "2か所に書かれた同じ支払いを、消さずに1回で片付けられるようになります",
    check: "f1-5",
  },
  {
    key: "receipt_flag",
    step: "③",
    name: "軽い日報に「レシート写真があるか」の印",
    benefit: "写真が付いている経費の行を拾って、読み取りに回せるようになります",
    check: "f1-6",
  },
  {
    key: "advance_tenant",
    step: "④",
    name: "立替の古い棚に「どの店のものか」の欄",
    benefit: "お店が増えても、立替がよその店に混ざらなくなります",
    check: "f3-4",
  },
  {
    key: "shifts_tenant",
    step: "⑤",
    name: "シフトの棚に「どの店のものか」の欄",
    benefit: "お店が増えても、シフトがよその店に混ざらなくなります（最後の穴）",
    check: "f3-4",
  },
  {
    key: "trial_shop",
    step: "⑥",
    name: "テストのお店1軒（この1枚の中で作って初回設定まで済ませる）",
    benefit:
      "2軒目を入れる手順を、こちら側だけで1回 通せるようになります" +
      "（サーバー側の鍵の貼り直しを待たなくてよくなります）",
    check: "f5-4",
  },
] as const;

export type ShelfKey = (typeof SHELF_STEPS)[number]["key"];

/** 全体のまとめ文。何本 流れたかを1行で言う */
export function summarizeShelves(reports: ShelfReport[]): {
  allDone: boolean;
  done: number;
  total: number;
  summary: string;
} {
  const done = reports.filter((r) => r.state === "ある").length;
  const total = reports.length;
  const unknown = reports.filter((r) => r.state === "分からない").length;
  const allDone = done === total && total > 0;
  const summary = allDone
    ? `貼り紙は流れています（${done}／${total}）。棚待ちの仕事は先へ進められます`
    : unknown > 0
      ? `${done}／${total} が流れています。${unknown} 件は確かめられませんでした`
      : `${done}／${total} が流れています。残りは /keiri/sql の貼り紙を1回 貼るだけです`;
  return { allDone, done, total, summary };
}
