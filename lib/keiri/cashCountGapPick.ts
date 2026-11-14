import type { BooksGapAnswerKind, BooksGapAnswerUse } from "./booksGapAnswer";

/**
 * 「日報が入っていない日は お休みでしたか」の答えを、
 * **金庫を数える1押しに同乗させる**ための決まり（2026-11-14・f1-4）。**計算だけ**です。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   11/14 のお昼に、空いた日の答えを聞く形を足しました。けれどその形は
 *   **押すボタンが2つ**（答えを押す → 金額で比べるを押す）でした。
 *   じゅんへのお願いは「1分・押すのは1回」なので、1つ 押して離れると
 *   **また「いまは言えません」で終わります**（＝1分がまるごと無駄になります）。
 *   そこで答えは「押す」ではなく **選ぶだけ**にして、
 *   ［この金額で比べる］の**同じ1押し**で いっしょに控えます。
 *
 * ■ 守っていること
 *   ・**選ばなかったら、こちらで答えを作りません。**（お休みだったことにしない）
 *   ・同じ答えがもう効いているときは、控え直しません（行も控えも増えません）。
 *   ・**合否（ok）の決め方は1文字も変えていません。**金額も1円も動きません。
 */
export type CashCountGapPickPlan = {
  /** この1押しで答えを控えるか */
  save: boolean;
  /** 控える答え（控えないときは null） */
  answer: BooksGapAnswerKind | null;
  /** 控えたあとに画面に足す1行（無ければ null） */
  note: string | null;
  /** 選ばないまま押したときに画面に足す1行（無ければ null） */
  warn: string | null;
};

export const NO_GAP_PICK_PLAN: CashCountGapPickPlan = {
  save: false,
  answer: null,
  note: null,
  warn: null,
};

/**
 * いま「空いた日の答え」を選んでもらう必要があるか。
 *
 * ★空きが無い日・すでに答えが効いている日は、何も聞きません。
 */
export function gapPickNeeded(params: {
  /** いま日報が入っていない日が何日あるか（きょうを外した数） */
  gapDays: number;
  /** いま効いている答え */
  current: BooksGapAnswerUse;
}): boolean {
  if (params.gapDays <= 0) return false;
  // 覆っている答えが（お休み／営業した のどちらでも）あるなら、もう聞かない
  return !(params.current.has && params.current.covers);
}

/**
 * ［この金額で比べる］を押したときに、答えをどうするか（**計算だけ**）。
 */
export function planCashCountGapPick(params: {
  gapDays: number;
  /** 画面で選ばれている答え（選んでいなければ null） */
  pick: BooksGapAnswerKind | null;
  current: BooksGapAnswerUse;
}): CashCountGapPickPlan {
  const { gapDays, pick, current } = params;
  if (gapDays <= 0) return NO_GAP_PICK_PLAN;
  if (pick === null) {
    // 答えがもう効いているなら、選ばなくても合否は出る＝何も言わない
    if (current.has && current.covers) return NO_GAP_PICK_PLAN;
    return {
      ...NO_GAP_PICK_PLAN,
      warn:
        `日報が入っていない ${gapDays}日 の答えを選んでいないので、` +
        "この差の合否は「いまは言えません」のままです。" +
        "上の2つから1つ えらんで、もう一度［この金額で比べる］を押してください" +
        "（えらぶだけで、押すのはこの1回だけです）。",
    };
  }
  // 同じ答えがもう効いているなら控え直さない（控えも行も増やさない）
  if (current.has && current.covers && current.answer === pick) {
    return {
      ...NO_GAP_PICK_PLAN,
      note:
        `日報が入っていない ${gapDays}日 の答えは、もう控えてあります` +
        "（同じ答えなので控え直していません）。",
    };
  }
  return {
    save: true,
    answer: pick,
    note:
      pick === "holiday"
        ? `日報が入っていない ${gapDays}日 は「お休みでした」として、同じ1押しで控えました。`
        : `日報が入っていない ${gapDays}日 は「営業した日があります」として、同じ1押しで控えました` +
          "（その日報を入れてから数え直すと、合否が出ます）。",
    warn: null,
  };
}

/** 控えられなかったときに出す1行（「控えました」と嘘を言わないため） */
export function gapPickFailLine(message: string): string {
  return (
    `空いた日の答えは控えられませんでした（${message}）。` +
    "金庫の記録は上のとおりです。答えは、もう一度 えらんで押し直してください。"
  );
}
