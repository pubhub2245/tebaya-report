/**
 * 「売上の現金を銀行に入れた分」を、金庫の差の説明として扱うところ
 * （2026-11-17・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   じゅんに「いま金庫にある現金を1回 数えてください」とお願いしています（kp245）。
 *   数えると、差（計算上の現金 − 数えた金額）に名前が付いているかを1行で答えます
 *   （lib/keiri/cashDiffCoverage.ts）。名前が付いた分は5つあります：
 *   レジの過不足／数え始めより前に払った経費／現場の立替のお返し／
 *   払った記録が無い日当／同じ中身の日報が2枚。
 *
 *   ところが、**金庫から現金が出ていく道がもう1つあります——銀行に入れることです。**
 *   手羽屋の売上は全額が現金（CLAUDE.md 5-5）で、計算上の現金は数え始めから
 *   **増え続ける一方**です。そのお金を銀行に入れれば、金庫はそのぶん減ります。
 *
 *   いま、その「入れた」を記録する置き場（keiri_cash_events）は**まだ倉庫にありません**。
 *   記録する欄そのものが画面に出ていません（置き場が無いので、押しても残らないため）。
 *   ＝ **入れたお金は、どこにも1行も残っていません。**
 *
 *   このままだと、じゅんが1分 数えて空いた日の答えもえらんだ瞬間、
 *   差の説明は「名前が付いていない分が残っています。**ここが本当の探し物です**」になります。
 *   けれど本当は「銀行に入れた分を書く所が無い」だけで、**探し物ではありません。**
 *   1分 使ってもらって、無い探し物をさせることになります
 *   （レジのつり銭でまったく同じことが起きています＝lib/keiri/registerFloat.ts）。
 *
 * ■ どうするか（2つだけ）
 *   ① 置き場が無いあいだは、この分を **「分からない所」** として数えます。
 *      ＝ 差がはみ出していても「探し物がある」と**言い切りません**（covered を null に倒す）。
 *      cashDiffCoverage.ts の決まり②「分からないものを0円と言いません」と同じ考え方です。
 *   ② それでも合否が出ないままでは1分が実りません。そこで、金庫を数える**同じ1押し**で
 *      「数え始めからあと、金庫の現金を銀行に入れましたか」を**えらぶだけ**で答えてもらい、
 *      ［入れていない］なら この分を 0円 と言い切れるようにします（＝合否が出ます）。
 *      ［入れた］なら、差の理由に名前が付きます（金額は置き場ができてから入れます）。
 *
 * ■ 守ること（ここを外すと、黙って嘘の合否が出ます）
 *   ① **えらばなかったら、こちらで答えを作りません。**（入れていないことにしない）
 *   ② **答えた分だけに効かせる。** 答えは「いつからいつまで」を覚えておき、
 *      いまの期間がその外へはみ出したら効かせません（＝また「分からない所」に戻る）。
 *   ③ **金額は1円も変えません。** 計算上の現金・月の経費・利益・1枚の要約・
 *      会計ソフト向けCSV・試算表は、答えても **1円も動きません**。
 *   ④ 置き場ができたあとは、入れた記録が倉庫に残るので**この分は「分からない所」ではありません**
 *      （0件＝入れていない、と言い切れます）。そのときは何も足しません。
 *   ⑤ いま memo に書いてある文は消さない（挟み込みの印の中だけに書く）。
 *   ⑥ 手羽屋の日報・シフト・レジ・LINE・お金の計算（lib/money.ts）には触りません。
 */

/** 差の説明に出す名前（cashDiffCoverage の unknownLabels に渡す文字） */
export const DEPOSIT_UNKNOWN_LABEL = "売上の現金を銀行に入れた分（記録する置き場がまだ無い）";

/** 控えの始まりの印 */
export const DEPOSIT_MEMO_BEGIN = "［銀行に入れたかの答え v1 ここから］";
/** 控えの終わりの印 */
export const DEPOSIT_MEMO_END = "［銀行に入れたかの答え v1 ここまで］";

/** 控えの中に書く、人が読んでも分かる1行の説明 */
const DEPOSIT_MEMO_NOTE =
  "※ 数え始めからあと、金庫の現金を銀行に入れたかを人が答えたものです。" +
  "この印から印までを消すと、元のひとことだけが残ります。金額は1円も計算していません。";

/** 答えの2つ */
export type CashDepositAnswerKind =
  /** 1円も入れていない（＝この分で食い違うことはない） */
  | "none"
  /** 入れた（金額は、置き場ができてから入れる） */
  | "some";

/** 控え1件の形（倉庫に文字として置くときの中身） */
export type CashDepositAnswer = {
  /** 答えが効く いちばん古い日（YYYY-MM-DD・ふつうは数え始めの日） */
  from: string;
  /** 答えが効く いちばん新しい日（YYYY-MM-DD・ふつうは数えた日） */
  to: string;
  answer: CashDepositAnswerKind;
  /** 答えた日時（ISO） */
  answered_at: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 挟み込みの印の中を取り除いて、元の文だけを返す */
export function stripCashDepositAnswer(memo: string | null | undefined): string {
  const text = String(memo ?? "");
  const begin = text.indexOf(DEPOSIT_MEMO_BEGIN);
  if (begin < 0) return text.trim();
  const endAt = text.indexOf(DEPOSIT_MEMO_END, begin);
  const after = endAt < 0 ? "" : text.slice(endAt + DEPOSIT_MEMO_END.length);
  return `${text.slice(0, begin)}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 答えを控えた memo の文を作る。
 * ★いま書いてある文はそのまま残し、前の答えだけ入れ替える（いちばん新しい1件だけ）。
 * ★日付がおかしい・順番が逆のときは null を返す（＝控えない。黙って直さない）。
 */
export function encodeCashDepositAnswer(
  memo: string | null | undefined,
  a: { from: string; to: string; answer: CashDepositAnswerKind; answered_at?: string },
): string | null {
  const from = String(a.from ?? "").slice(0, 10);
  const to = String(a.to ?? "").slice(0, 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return null;
  if (from > to) return null;
  if (a.answer !== "none" && a.answer !== "some") return null;

  const row: CashDepositAnswer = {
    from,
    to,
    answer: a.answer,
    answered_at: a.answered_at ?? new Date().toISOString(),
  };
  const base = stripCashDepositAnswer(memo);
  const block = [DEPOSIT_MEMO_BEGIN, DEPOSIT_MEMO_NOTE, JSON.stringify(row), DEPOSIT_MEMO_END].join(
    "\n",
  );
  return base === "" ? block : `${base}\n\n${block}`;
}

/**
 * memo に控えてある答えを読む。
 * ★読めない・印が無い・中身がおかしい ときは **null**（＝今までどおり「答えが無い」扱い）。
 */
export function decodeCashDepositAnswer(
  memo: string | null | undefined,
): CashDepositAnswer | null {
  const text = String(memo ?? "");
  const begin = text.indexOf(DEPOSIT_MEMO_BEGIN);
  if (begin < 0) return null;
  const endAt = text.indexOf(DEPOSIT_MEMO_END, begin);
  const inner = text.slice(begin + DEPOSIT_MEMO_BEGIN.length, endAt < 0 ? undefined : endAt);
  for (const line of inner.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const r = JSON.parse(t) as Partial<CashDepositAnswer>;
      const from = String(r.from ?? "").slice(0, 10);
      const to = String(r.to ?? "").slice(0, 10);
      if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return null;
      if (r.answer !== "none" && r.answer !== "some") return null;
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

/** 答えを、いまの期間に当てはめた結果 */
export type CashDepositAnswerUse = {
  /** 答えが控えてあるか */
  has: boolean;
  /** その答えが、いまの期間を **ぜんぶ** 覆っているか */
  covers: boolean;
  /** 覆っていて「1円も入れていない」なら true（＝この分では食い違わない） */
  none: boolean;
  /** 覆っていて「入れた」なら true（＝差の理由に名前が付く） */
  some: boolean;
  answer: CashDepositAnswerKind | null;
  from: string | null;
  to: string | null;
};

export const NO_CASH_DEPOSIT_ANSWER: CashDepositAnswerUse = {
  has: false,
  covers: false,
  none: false,
  some: false,
  answer: null,
  from: null,
  to: null,
};

/**
 * 控えてある答えを、いま見ている期間（数え始め 〜 数えた日）に当てはめる。
 * ★期間が答えの外へはみ出していたら効かせません（また「分からない所」に戻ります）。
 */
export function applyCashDepositAnswer(params: {
  /** いま見ている期間の始まり（数え始めの日。読めなければ null） */
  from: string | null;
  /** いま見ている期間の終わり（数えた日。読めなければ null） */
  to: string | null;
  saved: CashDepositAnswer | null;
}): CashDepositAnswerUse {
  const saved = params.saved;
  if (!saved) return NO_CASH_DEPOSIT_ANSWER;
  const from = String(params.from ?? "").slice(0, 10);
  const to = String(params.to ?? "").slice(0, 10);
  const base: CashDepositAnswerUse = {
    has: true,
    covers: false,
    none: false,
    some: false,
    answer: saved.answer,
    from: saved.from,
    to: saved.to,
  };
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return base;
  // 答えの範囲が、いまの期間をぜんぶ覆っているか
  const covers = saved.from <= from && saved.to >= to;
  if (!covers) return base;
  return {
    ...base,
    covers: true,
    none: saved.answer === "none",
    some: saved.answer === "some",
  };
}

/** 「銀行に入れた分」を、差の説明としてどう扱うかの答え */
export type CashDepositGap = {
  /** 入れた記録を残す置き場が倉庫に有るか */
  shelfExists: boolean;
  /**
   * この分を「分からない所」として数えるか。
   * true＝数える（＝差がはみ出しても「探し物がある」と言い切らない）
   */
  unknown: boolean;
  /** cashDiffCoverage の unknown に渡す名前（数えないときは空） */
  unknownLabels: string[];
  /** 画面に出す1行（出すものが無ければ null） */
  line: string | null;
  /** 外から確かめる窓口に出すひとこと */
  note: string;
};

/**
 * 「銀行に入れた分」の扱いを決める。**計算だけ**です。
 *
 * @param shelfMissing 入れた記録の置き場（keiri_cash_events）が倉庫に無いか
 * @param deposits     置き場が有るときに読めた「入れた記録」の件数
 * @param answer       じゅんの答えを、いまの期間に当てはめた結果
 */
export function measureCashDepositGap(params: {
  shelfMissing: boolean;
  deposits?: number | null;
  answer?: CashDepositAnswerUse | null;
}): CashDepositGap {
  const shelfExists = !params.shelfMissing;
  const answer = params.answer ?? NO_CASH_DEPOSIT_ANSWER;

  // ④ 置き場が有るなら、入れた記録は倉庫に残る＝0件は「入れていない」と言い切れる
  if (shelfExists) {
    const rows = Math.max(0, Math.round(Number(params.deposits ?? 0) || 0));
    return {
      shelfExists: true,
      unknown: false,
      unknownLabels: [],
      line: null,
      note:
        rows > 0
          ? `銀行に入れた記録は ${rows}件 あり、計算上の現金からもう引いてあります。`
          : "銀行に入れた記録の置き場はあり、1件も入っていません（＝入れていない、と言い切れます）。",
    };
  }

  // ② えらんでもらえていれば、置き場が無くても言い切れる
  if (answer.covers && answer.none) {
    return {
      shelfExists: false,
      unknown: false,
      unknownLabels: [],
      line:
        "数え始めからあと、金庫の現金を銀行に入れていない——と答えてもらっています" +
        "（＝この分で食い違うことはありません）。",
      note: "「銀行には入れていない」と答えてもらっているので、この分は差の心当たりに入れません。",
    };
  }
  if (answer.covers && answer.some) {
    return {
      shelfExists: false,
      unknown: true,
      unknownLabels: [DEPOSIT_UNKNOWN_LABEL],
      line:
        "数え始めからあと、金庫の現金を銀行に入れた——と答えてもらっています。" +
        "いくら入れたかを記録する置き場（keiri_cash_events）がまだ倉庫に無いので、" +
        "**金額はどこにも残っていません**。差のうち説明が付かない分は、まずこれです" +
        "（書き忘れた支払いを探す前に、ここを見てください）。",
      note:
        "「銀行に入れた」と答えてもらっていますが、金額を記録する置き場がまだ無いので、" +
        "差がはみ出していても『探し物がある』とは言いません。",
    };
  }

  // ① まだえらんでもらえていない＝分からない所として数える
  return {
    shelfExists: false,
    unknown: true,
    unknownLabels: [DEPOSIT_UNKNOWN_LABEL],
    line:
      "売上の現金を銀行に入れた分は、**記録する置き場（keiri_cash_events）がまだ倉庫に無い**ため、" +
      "1行も残っていません。＝ 入れていれば、そのぶん金庫は少なくなります。" +
      "上の［銀行に入れましたか］を1つ えらぶと、この分を差の心当たりから外せます。",
    note:
      "銀行に入れた分を記録する置き場がまだ無いので、この分は『分からない所』として数えます" +
      "（差がはみ出していても『探し物がある』とは言いません）。",
  };
}

/** えらんでもらう必要があるか（置き場が無く、まだ効いている答えが無いとき） */
export function depositPickNeeded(params: {
  shelfMissing: boolean;
  current: CashDepositAnswerUse;
}): boolean {
  if (!params.shelfMissing) return false;
  return !(params.current.has && params.current.covers);
}

/** 1押しに同乗させる計画（lib/keiri/cashCountGapPick.ts と同じ形） */
export type CashDepositPickPlan = {
  save: boolean;
  answer: CashDepositAnswerKind | null;
  note: string | null;
  warn: string | null;
};

export const NO_DEPOSIT_PICK_PLAN: CashDepositPickPlan = {
  save: false,
  answer: null,
  note: null,
  warn: null,
};

/**
 * ［この金額で比べる］の1押しで、銀行の答えも控えるかを決める。
 * ★えらんでいなければ何も控えません（こちらで答えを作りません）。
 */
export function planCashDepositPick(params: {
  shelfMissing: boolean;
  pick: CashDepositAnswerKind | null;
  current: CashDepositAnswerUse;
}): CashDepositPickPlan {
  const { shelfMissing, pick, current } = params;
  if (!shelfMissing) return NO_DEPOSIT_PICK_PLAN;
  if (pick === null) {
    if (current.has && current.covers) return NO_DEPOSIT_PICK_PLAN;
    return {
      ...NO_DEPOSIT_PICK_PLAN,
      warn:
        "［金庫の現金を銀行に入れましたか］をえらんでいないので、" +
        "この差の合否は「いまは言えません」のままです" +
        "（入れた分を記録する置き場がまだ無いため、0円とは言えません）。" +
        "上の2つから1つ えらんで、もう一度［この金額で比べる］を押してください。",
    };
  }
  if (current.has && current.covers && current.answer === pick) {
    return {
      ...NO_DEPOSIT_PICK_PLAN,
      note: "銀行に入れたかの答えは、もう控えてあります（同じ答えなので控え直していません）。",
    };
  }
  return {
    save: true,
    answer: pick,
    note:
      pick === "none"
        ? "「金庫の現金を銀行に入れていない」として、同じ1押しで控えました。"
        : "「金庫の現金を銀行に入れた」として、同じ1押しで控えました" +
          "（金額を入れる欄は、置き場ができてから出ます）。",
    warn: null,
  };
}

/** 控えられなかったときに出す1行（「控えました」と嘘を言わないため） */
export function depositPickFailLine(message: string): string {
  return (
    `銀行に入れたかの答えは控えられませんでした（${message}）。` +
    "金庫の記録は上のとおりです。答えは、もう一度 えらんで押し直してください。"
  );
}

/** 外から確かめる窓口に返す形（**金額は1円も返しません**） */
export type CashDepositGapWindow = {
  shelfExists: boolean;
  unknown: boolean;
  answered: boolean;
  answer: CashDepositAnswerKind | null;
  /** 画面にこの行が出るか */
  shown: boolean;
  note: string;
};

export function buildCashDepositGapWindow(
  gap: CashDepositGap,
  answer: CashDepositAnswerUse,
): CashDepositGapWindow {
  return {
    shelfExists: gap.shelfExists,
    unknown: gap.unknown,
    answered: answer.has && answer.covers,
    answer: answer.has && answer.covers ? answer.answer : null,
    shown: gap.line !== null,
    note: gap.note,
  };
}
