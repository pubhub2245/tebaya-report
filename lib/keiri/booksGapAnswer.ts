/**
 * 「日報が入っていない日は、お休みだったのか」を **じゅんに1回だけ答えてもらい**、
 * その答えを経理の設定の行（keiri_settings.memo）に控えておくところ。
 * **計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（2026-11-14・f1-4）
 *   f1-4（計算上の現金と、実際の金庫が合うか）は、じゅんが1分 数えれば合否が出る——
 *   はずでした。ところが **いまの本番では、数えても合否が出ません。**
 *
 *   差の内わけに「日報がまだ入っていない日」という**分からない所**が1つ残っていて、
 *   分からない所が1つでもあると、答えは「合っている」でも「合っていない」でもなく
 *   **「いまは言えません」**（covered が null → ok が null）になるためです。
 *
 *   いままでは、この空きの正体を**出店予定の表（shifts）**から読んでいました。
 *   ところが 2026-11-07 から手羽屋は写真の日報に変わり、**シフトの入り口そのものを
 *   外しています**（CLAUDE.md 3-1）。表は 2026-10-18 で止まっていて、
 *   入れる人がいなくなった表の「予定が無い」は、お休みだった証しになりません
 *   （lib/keiri/shiftShelfFresh.ts）。
 *   ＝ **この空きがお休みだったかは、アプリの中のどこを見ても分かりません。**
 *   知っているのは人だけです。
 *
 *   そこで、金庫を数えるのと同じ画面で、**はい／いいえ だけ**答えてもらいます。
 *   「お休みでした」なら、その空きで食い違うことはありません＝分からない所が消え、
 *   **その1分で f1-4 の合否が出ます**。
 *
 * ■ 守ること（ここを外すと、黙って嘘の合格が出ます）
 *   ① **答えた日だけに効かせる。** 答えは「いつからいつまで」を覚えておき、
 *      **いま空いている日が1日でもその外にあれば効かせません**（＝また分からない所に戻る）。
 *      こうしないと、きょう「お休みでした」と答えただけで、来月の空きまで
 *      黙って説明がついたことになります。
 *   ② **「営業した日があります」も、ちゃんと覚える。** その場合は今までどおり
 *      分からない所のままにし、「その日報を入れてから数えてください」と言います。
 *   ③ **金額は作らない。** 答えで変わるのは「分からない所があるか」だけで、
 *      計算上の現金・月の経費・利益・会計ソフト向けCSV・試算表は1円も変わりません。
 *   ④ **いま memo に書いてある文は消さない。** 控えは挟み込みの印の中だけに書き、
 *      印ごと外せば元の文がそのまま戻る（金庫の控え・数えない印の控えと同じ形）。
 *   ⑤ 手羽屋の日報・シフト・レジ・LINE・お金の計算（lib/money.ts）には触りません。
 */

/** 控えの始まりの印 */
export const GAP_ANSWER_MEMO_BEGIN = "［日報の空きの答え v1 ここから］";
/** 控えの終わりの印 */
export const GAP_ANSWER_MEMO_END = "［日報の空きの答え v1 ここまで］";

/** 控えの中に書く、人が読んでも分かる1行の説明 */
const GAP_ANSWER_MEMO_NOTE =
  "※ 日報が入っていない日が お休みだったかを、人が答えたものです。" +
  "この印から印までを消すと、元のひとことだけが残ります。金額は1円も計算していません。";

/** 答えの2つ */
export type BooksGapAnswerKind =
  /** その空きは ぜんぶ お休みだった（＝この空きで食い違うことはない） */
  | "holiday"
  /** 営業した日がある（＝その日報が入るまで、差の意味は はっきりしない） */
  | "operated";

/** 控え1件の形（倉庫に文字として置くときの中身） */
export type BooksGapAnswer = {
  /** 答えが効く いちばん古い日（YYYY-MM-DD） */
  from: string;
  /** 答えが効く いちばん新しい日（YYYY-MM-DD） */
  to: string;
  answer: BooksGapAnswerKind;
  /** 答えた日時（ISO） */
  answered_at: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 挟み込みの印の中を取り除いて、元の文だけを返す */
export function stripBooksGapAnswer(memo: string | null | undefined): string {
  const text = String(memo ?? "");
  const begin = text.indexOf(GAP_ANSWER_MEMO_BEGIN);
  if (begin < 0) return text.trim();
  const endAt = text.indexOf(GAP_ANSWER_MEMO_END, begin);
  const after = endAt < 0 ? "" : text.slice(endAt + GAP_ANSWER_MEMO_END.length);
  return `${text.slice(0, begin)}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 答えを控えた memo の文を作る。
 *
 * ★いま書いてある文はそのまま残し、前の答えだけ入れ替える（いちばん新しい1件だけ）。
 * ★日付がおかしい・順番が逆のときは null を返す（＝控えない。黙って直さない）。
 */
export function encodeBooksGapAnswer(
  memo: string | null | undefined,
  a: {
    from: string;
    to: string;
    answer: BooksGapAnswerKind;
    answered_at?: string;
  },
): string | null {
  const from = String(a.from ?? "").slice(0, 10);
  const to = String(a.to ?? "").slice(0, 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return null;
  if (from > to) return null;
  if (a.answer !== "holiday" && a.answer !== "operated") return null;

  const row: BooksGapAnswer = {
    from,
    to,
    answer: a.answer,
    answered_at: a.answered_at ?? new Date().toISOString(),
  };
  const base = stripBooksGapAnswer(memo);
  const block = [
    GAP_ANSWER_MEMO_BEGIN,
    GAP_ANSWER_MEMO_NOTE,
    JSON.stringify(row),
    GAP_ANSWER_MEMO_END,
  ].join("\n");
  return base === "" ? block : `${base}\n\n${block}`;
}

/**
 * memo に控えてある答えを読む。
 *
 * ★読めない・印が無い・中身がおかしい ときは **null**（＝今までどおり「答えが無い」扱い）。
 *   ここで例外を投げると、経理の画面が丸ごと開かなくなるため。
 */
export function decodeBooksGapAnswer(
  memo: string | null | undefined,
): BooksGapAnswer | null {
  const text = String(memo ?? "");
  const begin = text.indexOf(GAP_ANSWER_MEMO_BEGIN);
  if (begin < 0) return null;
  const endAt = text.indexOf(GAP_ANSWER_MEMO_END, begin);
  const inner = text.slice(
    begin + GAP_ANSWER_MEMO_BEGIN.length,
    endAt < 0 ? undefined : endAt,
  );
  for (const line of inner.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const r = JSON.parse(t) as Partial<BooksGapAnswer>;
      const from = String(r.from ?? "").slice(0, 10);
      const to = String(r.to ?? "").slice(0, 10);
      if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return null;
      if (r.answer !== "holiday" && r.answer !== "operated") return null;
      return {
        from,
        to,
        answer: r.answer,
        answered_at:
          typeof r.answered_at === "string" ? r.answered_at : "",
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** 答えを、いま空いている日に当てはめた結果 */
export type BooksGapAnswerUse = {
  /** 答えが控えてあるか */
  has: boolean;
  /** その答えが、いま空いている日を **ぜんぶ** 覆っているか */
  covers: boolean;
  /** 覆っていて「お休みだった」なら true（＝分からない所として数えない） */
  holidaysOnly: boolean;
  /** 覆っていて「営業した日がある」なら true（＝先に日報を入れてもらう） */
  operated: boolean;
  answer: BooksGapAnswerKind | null;
  /** 答えが効く範囲（控えが無ければ null） */
  from: string | null;
  to: string | null;
  /** 人が読む1行（出すものが無ければ null） */
  line: string | null;
};

export const NO_BOOKS_GAP_ANSWER: BooksGapAnswerUse = {
  has: false,
  covers: false,
  holidaysOnly: false,
  operated: false,
  answer: null,
  from: null,
  to: null,
  line: null,
};

/** 月日だけの言い方（1月2日） */
function monthDay(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1])}月${Number(m[2])}日`;
}

/**
 * 控えてある答えを、いま空いている日に当てはめる。
 *
 * ★**ぜんぶ覆っているときだけ**効かせます。1日でも外にあれば効かせません
 *   （＝新しく空いた日を、古い答えで黙って説明しない）。
 */
export function applyBooksGapAnswer(params: {
  /** いま日報が入っていない日（YYYY-MM-DD の並び） */
  gapDates: readonly string[];
  /** memo から読んだ答え */
  saved: BooksGapAnswer | null;
}): BooksGapAnswerUse {
  const saved = params.saved;
  const gap = [...params.gapDates].filter((d) => DATE_RE.test(d)).sort();
  if (!saved) return NO_BOOKS_GAP_ANSWER;
  if (gap.length === 0) {
    return {
      ...NO_BOOKS_GAP_ANSWER,
      has: true,
      answer: saved.answer,
      from: saved.from,
      to: saved.to,
    };
  }
  const covers = gap.every((d) => d >= saved.from && d <= saved.to);
  const base = {
    has: true,
    covers,
    answer: saved.answer,
    from: saved.from,
    to: saved.to,
  };
  if (!covers) {
    return {
      ...base,
      holidaysOnly: false,
      operated: false,
      line:
        `日報が入っていない日のうち、答えてもらった範囲（${monthDay(saved.from)}〜` +
        `${monthDay(saved.to)}）の外にある日があります。` +
        "この空きが お休みだったのかは、もう一度 答えてください" +
        "（前の答えは、そのときの日にだけ効きます）。",
    };
  }
  if (saved.answer === "holiday") {
    return {
      ...base,
      holidaysOnly: true,
      operated: false,
      line:
        `日報が入っていない ${gap.length}日（${monthDay(gap[0])}〜` +
        `${monthDay(gap[gap.length - 1])}）は「お休みでした」と答えてもらっています` +
        "＝この空きで食い違うことはありません。",
    };
  }
  return {
    ...base,
    holidaysOnly: false,
    operated: true,
    line:
      `日報が入っていない ${gap.length}日（${monthDay(gap[0])}〜` +
      `${monthDay(gap[gap.length - 1])}）は「営業した日があります」と答えてもらっています` +
      "＝その日の売上と経費が入っていないので、先にその日報を入れてから数えてください。",
  };
}

/** 画面に出す問いかけ（じゅんが押す2つのボタンの上に出す1行） */
export function booksGapQuestion(gapDates: readonly string[]): string | null {
  const gap = [...gapDates].filter((d) => DATE_RE.test(d)).sort();
  if (gap.length === 0) return null;
  return (
    `日報が入っていない日が ${gap.length}日 あります` +
    `（${monthDay(gap[0])}〜${monthDay(gap[gap.length - 1])}）。` +
    "この日は お休みでしたか？ どちらかを1回 押すと、金庫を数えたときに合否が出ます。"
  );
}
