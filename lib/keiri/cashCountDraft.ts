/**
 * 「金庫を数えて入れた金額を、残せなかったときに消さないでおく」ところ
 * （2026-11-05・kp245・f1-4）。**計算だけ**（ここでは保存しません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   じゅんにお願いしているのは「金庫を数えて、1回 押す」だけです（1分）。
 *   ところが押した先が倉庫（データのしまい場所）なので、
 *   **倉庫が眠っているときに押すと、何も残りません**（2026-11-05 に実際に止まりました）。
 *   そのとき画面を閉じてしまうと、数えた金額は**どこにも残っていません**。
 *   もう一度 金庫を開けて数え直すことになり、1分が2回に増えます。
 *   29日ぶん動いていないお願いなので、2回目が来ない可能性のほうが高いです。
 *
 *   そこで、入れている途中の金額を**そのブラウザの中にだけ**控えておき、
 *   次に同じ画面を開いたときに入れ直さなくていい形にします。
 *   お申し込みの「電波が細くて送れなかったときに、お店の名前と電話番号が消えない」（f2-4）
 *   と同じ考え方です。
 *
 * ■ 守ること
 *   ・控えるのは**その人のブラウザの中だけ**。倉庫へは送りません。
 *   ・金額を1円も作りません。入れた文字をそのまま持つだけです。
 *   ・**残せたら消します。**残っているのに控えが居ると、次に開いたときに
 *     「まだ残っていない」と見まちがえます。
 *   ・ブラウザが控えを断ることがあります（ひとりで開く窓・設定で切っている）。
 *     断られても画面はふつうに動きます（読み書きは必ず try で囲みます）。
 */

/** 控えの置き場の名前（ほかの控えと混ざらないように経理の金庫だけの名前） */
export const CASH_COUNT_DRAFT_KEY = "keiri.cashCount.draft.v1";

export type CashCountDraft = {
  /** 数えた日（YYYY-MM-DD） */
  on: string;
  /** 入れた金額（**文字のまま**。0円や入れかけも捨てないため） */
  yen: string;
};

/** YYYY-MM-DD の形をしているか */
function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * 控えに書く中身を作る。控える値打ちが無いときは null（＝控えを消す）。
 *
 * 金額が空のときは控えません（空を控えると、次に開いたときに
 * 入れていない所へ空を書き戻すだけで、何の役にも立ちません）。
 */
export function cashCountDraftValue(draft: {
  on: string;
  yen: string;
}): string | null {
  const on = String(draft.on ?? "").slice(0, 10);
  const yen = String(draft.yen ?? "").trim();
  if (yen === "") return null;
  if (!isYmd(on)) return null;
  return JSON.stringify({ on, yen } satisfies CashCountDraft);
}

/**
 * 控えを読む。読めない・形がちがう・金額が空なら null。
 *
 * @param raw ブラウザの控えから出てきた文字（無ければ null）
 */
export function readCashCountDraft(raw: string | null | undefined): CashCountDraft | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const on = (parsed as Record<string, unknown>).on;
  const yen = (parsed as Record<string, unknown>).yen;
  if (!isYmd(on)) return null;
  if (typeof yen !== "string" || yen.trim() === "") return null;
  return { on, yen: yen.trim() };
}

/** 控えの1行を、画面に出すやさしい文に直す（金額はそのまま見せる） */
export function cashCountDraftNotice(draft: CashCountDraft): string {
  const [, m, d] = draft.on.split("-");
  return (
    `前に入れた「${Number(m)}月${Number(d)}日の ${draft.yen}円」を、入れたまま戻しました。` +
    "そのままでよければ［この金額で比べる］を押してください（まだ記録には残っていません）。"
  );
}
