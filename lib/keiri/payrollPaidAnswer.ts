/**
 * 「日報に入っている日当を、もう金庫のお金からお渡ししましたか」を
 * **じゅんに1回だけ答えてもらい**、その答えを経理の設定の行（keiri_settings.memo）に
 * 控えておくところ（2026-11-15・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   いま本番には、**払った記録が1件も無い日当が 21日ぶん**あります
 *   （9月12日〜10月31日。金額は画面にだけ出します）。
 *   この分は「まだ払っていないお金」として別に置いてあり、計算上の現金からは
 *   引いていません（lib/keiri/unpaidPayrollGap.ts）。
 *
 *   ところが **お渡ししたかどうかで、金庫の中身は正反対になります。**
 *     ・もうお渡ししている … そのぶん金庫から出ている（＝金庫のほうが少なく出る）
 *     ・まだお渡ししていない … 金庫にそのまま残っている（＝食い違わない）
 *
 *   どちらか分からないので、いまは **「0円 〜 その額」の幅**として差の説明に入れています。
 *   幅がとても広いので、**どんな差でも「説明がつく範囲」に収まってしまい、
 *   じゅんが1分 数えても、合否がほとんど意味を持ちません。**
 *
 *   この幅を縮められるのは人だけです（払った記録がどこにも無いため）。そこで、
 *   金庫を数えるのと同じ画面で、**えらぶだけ**で答えてもらいます。
 *   ［この金額で比べる］の**同じ1押し**で、金庫の記録といっしょに控えます
 *   （空いた日の答え＝lib/keiri/cashCountGapPick.ts と同じ形です。押す回数は増えません）。
 *
 * ■ 守ること（ここを外すと、黙って嘘の合否が出ます）
 *   ① **えらばなかったら、こちらで答えを作りません。** 一部だけお渡しした・分からない、
 *      という人のために、**えらばない道をいつでも残します**（そのときは今までどおり
 *      「0円 〜 その額」の幅のままです）。答えを急かして止めることはしません。
 *   ② **答えた分だけに効かせる。** 答えは「いつからいつまでの日当か」を覚えておき、
 *      **いまの日当がその外にはみ出したら効かせません**（＝また幅に戻る）。
 *      こうしないと、きょう「お渡しした」と答えただけで、来月ぶんの日当まで
 *      黙ってお渡ししたことになります。
 *   ③ **金額は1円も変えません。** 計算上の現金・月の経費・利益・1枚の要約・
 *      会計ソフト向けCSV・試算表は、答えても **1円も動きません**
 *      （動くのは「差の心当たりの幅」だけです）。
 *      ※「日当を現金から引く」のは**現金残高の決め方そのものを変える話**なので、
 *        ここでは決めません（CLAUDE.md 5-4）。
 *   ④ **いま memo に書いてある文は消さない。** 控えは挟み込みの印の中だけに書き、
 *      印ごと外せば元の文がそのまま戻ります（金庫の控え・空いた日の答えと同じ形）。
 *   ⑤ 手羽屋の日報・シフト・レジ・LINE・お金の計算（lib/money.ts）には触りません。
 *   ⑥ **税務の判断はしません**（docs/keiri.md 5-2）。「どう仕訳すべきか」は書きません。
 */

/** 控えの始まりの印 */
export const PAYROLL_PAID_MEMO_BEGIN = "［日当をお渡ししたかの答え v1 ここから］";
/** 控えの終わりの印 */
export const PAYROLL_PAID_MEMO_END = "［日当をお渡ししたかの答え v1 ここまで］";

/** 控えの中に書く、人が読んでも分かる1行の説明 */
const PAYROLL_PAID_MEMO_NOTE =
  "※ 払った記録が無い日当を、もう金庫のお金からお渡ししたかを人が答えたものです。" +
  "この印から印までを消すと、元のひとことだけが残ります。金額は1円も計算していません。";

/** 答えの2つ */
export type PayrollPaidAnswerKind =
  /** その日当は、もうぜんぶ金庫のお金からお渡しした（＝そのぶん金庫から出ている） */
  | "handed"
  /** まだ1円もお渡ししていない（＝そのぶんは金庫に残っている） */
  | "notyet";

/** 控え1件の形（倉庫に文字として置くときの中身） */
export type PayrollPaidAnswer = {
  /** 答えが効く いちばん古い日当の日（YYYY-MM-DD） */
  from: string;
  /** 答えが効く いちばん新しい日当の日（YYYY-MM-DD） */
  to: string;
  answer: PayrollPaidAnswerKind;
  /** 答えた日時（ISO） */
  answered_at: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 挟み込みの印の中を取り除いて、元の文だけを返す */
export function stripPayrollPaidAnswer(memo: string | null | undefined): string {
  const text = String(memo ?? "");
  const begin = text.indexOf(PAYROLL_PAID_MEMO_BEGIN);
  if (begin < 0) return text.trim();
  const endAt = text.indexOf(PAYROLL_PAID_MEMO_END, begin);
  const after = endAt < 0 ? "" : text.slice(endAt + PAYROLL_PAID_MEMO_END.length);
  return `${text.slice(0, begin)}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 答えを控えた memo の文を作る。
 *
 * ★いま書いてある文はそのまま残し、前の答えだけ入れ替える（いちばん新しい1件だけ）。
 * ★日付がおかしい・順番が逆のときは null を返す（＝控えない。黙って直さない）。
 */
export function encodePayrollPaidAnswer(
  memo: string | null | undefined,
  a: {
    from: string;
    to: string;
    answer: PayrollPaidAnswerKind;
    answered_at?: string;
  },
): string | null {
  const from = String(a.from ?? "").slice(0, 10);
  const to = String(a.to ?? "").slice(0, 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return null;
  if (from > to) return null;
  if (a.answer !== "handed" && a.answer !== "notyet") return null;

  const row: PayrollPaidAnswer = {
    from,
    to,
    answer: a.answer,
    answered_at: a.answered_at ?? new Date().toISOString(),
  };
  const base = stripPayrollPaidAnswer(memo);
  const block = [
    PAYROLL_PAID_MEMO_BEGIN,
    PAYROLL_PAID_MEMO_NOTE,
    JSON.stringify(row),
    PAYROLL_PAID_MEMO_END,
  ].join("\n");
  return base === "" ? block : `${base}\n\n${block}`;
}

/**
 * memo に控えてある答えを読む。
 *
 * ★読めない・印が無い・中身がおかしい ときは **null**（＝今までどおり「答えが無い」扱い）。
 *   ここで例外を投げると、経理の画面が丸ごと開かなくなるため。
 */
export function decodePayrollPaidAnswer(
  memo: string | null | undefined,
): PayrollPaidAnswer | null {
  const text = String(memo ?? "");
  const begin = text.indexOf(PAYROLL_PAID_MEMO_BEGIN);
  if (begin < 0) return null;
  const endAt = text.indexOf(PAYROLL_PAID_MEMO_END, begin);
  const inner = text.slice(
    begin + PAYROLL_PAID_MEMO_BEGIN.length,
    endAt < 0 ? undefined : endAt,
  );
  for (const line of inner.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const r = JSON.parse(t) as Partial<PayrollPaidAnswer>;
      const from = String(r.from ?? "").slice(0, 10);
      const to = String(r.to ?? "").slice(0, 10);
      if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return null;
      if (r.answer !== "handed" && r.answer !== "notyet") return null;
      return {
        from,
        to,
        answer: r.answer,
        answered_at: typeof r.answered_at === "string" ? r.answered_at : "",
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** いま数えている日当の範囲（lib/keiri/unpaidPayrollGap.ts が出す形の一部） */
export type PayrollSpan = {
  readable: boolean;
  rows: number;
  unpaid: number;
  firstDate: string | null;
  lastDate: string | null;
};

/** 答えを、いまの日当に当てはめた結果 */
export type PayrollPaidAnswerUse = {
  /** 答えが控えてあるか */
  has: boolean;
  /** その答えが、いまの日当を **ぜんぶ** 覆っているか */
  covers: boolean;
  /** 覆っていて「お渡しした」なら true（＝そのぶん金庫から出ている） */
  handed: boolean;
  /** 覆っていて「まだお渡ししていない」なら true（＝この分では食い違わない） */
  notYet: boolean;
  answer: PayrollPaidAnswerKind | null;
  from: string | null;
  to: string | null;
  /** 人が読む1行（出すものが無ければ null） */
  line: string | null;
};

export const NO_PAYROLL_PAID_ANSWER: PayrollPaidAnswerUse = {
  has: false,
  covers: false,
  handed: false,
  notYet: false,
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

/** 「いつからいつまで」（1日だけなら1つだけ出す） */
function spanOf(span: PayrollSpan): string {
  if (!span.firstDate) return "";
  if (!span.lastDate || span.lastDate === span.firstDate) return monthDay(span.firstDate);
  return `${monthDay(span.firstDate)}〜${monthDay(span.lastDate)}`;
}

/** 円の表示（画面と同じ3桁区切り） */
function yen(n: number): string {
  return `${Math.abs(Math.round(n)).toLocaleString("ja-JP")}円`;
}

/**
 * 控えてある答えを、いまの日当に当てはめる。
 *
 * ★**ぜんぶ覆っているときだけ**効かせます。1日でも外にあれば効かせません
 *   （＝新しく増えた日当を、古い答えで黙ってお渡し済みにしない）。
 */
export function applyPayrollPaidAnswer(params: {
  span: PayrollSpan;
  saved: PayrollPaidAnswer | null;
}): PayrollPaidAnswerUse {
  const { span, saved } = params;
  if (!saved) return NO_PAYROLL_PAID_ANSWER;
  const base = {
    has: true,
    answer: saved.answer,
    from: saved.from,
    to: saved.to,
  };
  // 日当そのものが無い（読めていない・1件も無い）なら、効かせる相手がいない
  if (!span.readable || span.rows <= 0 || !span.firstDate || !span.lastDate) {
    return { ...NO_PAYROLL_PAID_ANSWER, ...base, covers: false };
  }
  const covers = span.firstDate >= saved.from && span.lastDate <= saved.to;
  if (!covers) {
    return {
      ...NO_PAYROLL_PAID_ANSWER,
      ...base,
      covers: false,
      line:
        `払った記録が無い日当のうち、答えてもらった範囲（${monthDay(saved.from)}〜` +
        `${monthDay(saved.to)}）の外にある日があります。` +
        "もう一度 答えてください（前の答えは、そのときの日当にだけ効きます）。",
    };
  }
  if (saved.answer === "handed") {
    return {
      ...base,
      covers: true,
      handed: true,
      notYet: false,
      line:
        `払った記録が無い日当 ${yen(span.unpaid)}（${span.rows}件・${spanOf(span)}）は` +
        "「もう金庫のお金からお渡ししました」と答えてもらっています" +
        `＝そのぶん（${yen(span.unpaid)}）金庫のほうが少なくなっているはずです。`,
    };
  }
  return {
    ...base,
    covers: true,
    handed: false,
    notYet: true,
    line:
      `払った記録が無い日当 ${yen(span.unpaid)}（${span.rows}件・${spanOf(span)}）は` +
      "「まだお渡ししていません」と答えてもらっています" +
      "＝この分で金庫が食い違うことはありません（金庫にそのまま残っているはずです）。",
  };
}

/**
 * いま答えをえらんでもらう必要があるか。
 *
 * ★払った記録が無い日当が無い日・すでに答えが効いている日は、何も聞きません。
 */
export function payrollPickNeeded(params: {
  span: PayrollSpan;
  current: PayrollPaidAnswerUse;
}): boolean {
  const { span, current } = params;
  if (!span.readable || span.rows <= 0 || span.unpaid <= 0) return false;
  return !(current.has && current.covers);
}

/** 画面に出す問いかけ（えらぶ2つの上に出す1行） */
export function payrollPaidQuestion(span: PayrollSpan): string | null {
  if (!span.readable || span.rows <= 0 || span.unpaid <= 0) return null;
  const where = spanOf(span);
  return (
    `日報に入っている日当 ${yen(span.unpaid)}（${span.rows}件` +
    `${where ? `・${where}` : ""}）には、払ったという記録がありません。` +
    "このお金は、もう金庫のお金からお渡ししましたか？" +
    "（お渡ししていれば そのぶん金庫から出ていますし、" +
    "まだなら金庫にそのまま残っています。正反対になります）"
  );
}

export type PayrollPaidPickPlan = {
  /** この1押しで答えを控えるか */
  save: boolean;
  /** 控える答え（控えないときは null） */
  answer: PayrollPaidAnswerKind | null;
  /** 控える範囲（控えないときは null） */
  from: string | null;
  to: string | null;
  /** 控えたあとに画面に足す1行（無ければ null） */
  note: string | null;
};

export const NO_PAYROLL_PAID_PICK_PLAN: PayrollPaidPickPlan = {
  save: false,
  answer: null,
  from: null,
  to: null,
  note: null,
};

/**
 * ［この金額で比べる］を押したときに、答えをどうするか（**計算だけ**）。
 *
 * ★えらばなかったときは **何も言いません**（警告を出しません）。
 *   一部だけお渡しした・分からない、という人がいます。えらばない道は正しい道なので、
 *   急かすと「とりあえず どちらか」を押させてしまい、嘘の合否になります。
 *   えらばなければ、今までどおり「0円 〜 その額」の幅のままです。
 */
export function planPayrollPaidPick(params: {
  span: PayrollSpan;
  /** 画面でえらばれている答え（えらんでいなければ null） */
  pick: PayrollPaidAnswerKind | null;
  current: PayrollPaidAnswerUse;
}): PayrollPaidPickPlan {
  const { span, pick, current } = params;
  if (!span.readable || span.rows <= 0 || span.unpaid <= 0) {
    return NO_PAYROLL_PAID_PICK_PLAN;
  }
  if (!span.firstDate || !span.lastDate) return NO_PAYROLL_PAID_PICK_PLAN;
  if (pick === null) return NO_PAYROLL_PAID_PICK_PLAN;
  // 同じ答えがもう効いているなら控え直さない（控えも行も増やさない）
  if (current.has && current.covers && current.answer === pick) {
    return {
      ...NO_PAYROLL_PAID_PICK_PLAN,
      note: "日当をお渡ししたかの答えは、もう控えてあります（同じ答えなので控え直していません）。",
    };
  }
  return {
    save: true,
    answer: pick,
    from: span.firstDate,
    to: span.lastDate,
    note:
      pick === "handed"
        ? `払った記録が無い日当 ${yen(span.unpaid)} は「もうお渡ししました」として、同じ1押しで控えました。`
        : `払った記録が無い日当 ${yen(span.unpaid)} は「まだお渡ししていません」として、同じ1押しで控えました。`,
  };
}

/** 控えられなかったときに出す1行（「控えました」と嘘を言わないため） */
export function payrollPickFailLine(message: string): string {
  return (
    `日当をお渡ししたかの答えは控えられませんでした（${message}）。` +
    "金庫の記録は上のとおりです。答えは、もう一度 えらんで押し直してください。"
  );
}

/**
 * 外から確かめる窓口に返す形（2026-11-15・f1-4）。
 * **本物の金額は1円も返しません**（lib/keiri/checkWindow.ts の決まり③）。
 */
export type PayrollPaidAnswerWindow = {
  has: boolean;
  covers: boolean;
  answer: PayrollPaidAnswerKind | null;
  handed: boolean;
  notYet: boolean;
  from: string | null;
  to: string | null;
  /** いま答えをえらんでもらう必要があるか */
  needed: boolean;
  note: string;
};

export function buildPayrollPaidAnswerWindow(params: {
  span: PayrollSpan;
  use: PayrollPaidAnswerUse;
}): PayrollPaidAnswerWindow {
  const { span, use } = params;
  const needed = payrollPickNeeded({ span, current: use });
  const note = !span.readable
    ? "日報または払った記録が読めていません（答えの有無は、この日は確かめられません）。"
    : span.rows <= 0 || span.unpaid <= 0
      ? "払った記録が無い日当はありません（この問いは画面に出ません）。"
      : use.has && use.covers && use.handed
        ? "「もうお渡ししました」と答えてもらっています＝差の心当たりは幅ではなく、その額ちょうどで見ます。"
        : use.has && use.covers && use.notYet
          ? "「まだお渡ししていません」と答えてもらっています＝この分は差の心当たりに入れません。"
          : use.has
            ? "前に答えてもらった範囲の外に、新しい日当があります＝答えは効かせていません（また幅のままです）。"
            : "まだ答えてもらっていません＝差の心当たりは「0円〜その額」の幅のままです（幅が広いので、合否はほとんど意味を持ちません）。";
  return {
    has: use.has,
    covers: use.covers,
    answer: use.answer,
    handed: use.handed,
    notYet: use.notYet,
    from: use.from,
    to: use.to,
    needed,
    note,
  };
}
