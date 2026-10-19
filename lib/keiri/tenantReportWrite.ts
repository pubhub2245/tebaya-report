/**
 * 申し込んだお店が「日報を1枚 出す」ときの決まり（2026-10-19・kp253 ③・f3-3・f3-4）。
 * **計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   貼り紙⑧を流すと、日報の棚は「印が空の行だけ 読んでよい」になります。
 *   手羽屋の行は印が空なので今までどおりですが、**申し込んだお店の行（印つき）は
 *   公開の鍵では読めなくなります**。ここで困るのは「読む所」ではなく「書く所」です。
 *
 *   いまの日報の保存は、入れたあとに**その行をもう一度 読み返して番号を受け取る**形です
 *   （insert → select("id")）。読み返しは読む決まりに当たるので、
 *   申し込んだお店では **行は入っているのに「保存に失敗しました」と出ます**
 *   （2026-10-17 に同じ形の倉庫で実測。PostgreSQL 16）。
 *   お店は「保存できなかった」と思ってもう一度 出すので、**日報が二重になります**。
 *   立替の一覧で同じ形の取り違えを直したのと同じ話です（lib/keiri/advanceReadHonest.ts）。
 *
 *   ＝ **番号の読み返しをやめれば、この取り違えは起きません。**
 *   番号（savedId）は「入力をクリアしてよいか」を聞くかどうかにだけ使っていて、
 *   金額・LINE・集計には1つも関わりません。
 *
 * ■ もう1つの取り違え：同じ日の日報があるかの確かめ
 *   保存の前に「同じ日付・担当・お店の日報がもうあるか」を棚に聞いています。
 *   締めたあとの申し込んだお店では、**この答えが必ず「0件」**になります。
 *   ＝ 本当に二重のときも「ありません」と見えるので、確かめた気になるのが危ない所です。
 *   そこで **「0件」と言わずに『確かめられませんでした』と出して、人に確かめてもらいます**。
 *
 * ■ 手羽屋は1行も変わりません（ここが大事）
 *   手羽屋（印が空）は締めたあとも読めるので、**読み返しも・同じ日の確かめも今までどおり**です。
 *   手羽屋のときは棚の状態を1回も問い合わせません（通信の回数も今までと同じ）。
 */

/** 貼り紙⑧（よその店の日報を公開の鍵では読めないようにする）が流れたか */
export type ReportShelfState =
  /** 流れている＝申し込んだお店の行は公開の鍵では読めない */
  | "締まっている"
  /** まだ流れていない＝今までどおり読める */
  | "まだ"
  /** 確かめられなかった */
  | "分からない";

/** 貼り紙の確かめ窓口（/api/keiri/shelves）で、この決まりが入っている段 */
export const REPORT_SHELF_STEP = "⑧";

export type SaveVerdict = {
  /** 入れたあとに番号を読み返すか */
  readBack: boolean;
  why: string;
};

/**
 * 日報を入れたあと、番号を読み返してよいか。
 *
 * ・手羽屋（印が空）… 今までどおり読み返す
 * ・申し込んだお店 …… 読み返さない（締まっていれば必ず断られ、嘘の「失敗」になるため）
 *
 * ★申し込んだお店では、棚の状態を**聞きません**。
 *   締まる前でも読み返しの番号は何にも使っていないので、
 *   「聞いてから決める」ぶんだけ保存が遅くなるだけで、得はありません。
 */
export function decideReportSave(params: { isTebaya: boolean }): SaveVerdict {
  if (params.isTebaya) {
    return { readBack: true, why: "手羽屋（印が空）は締めても読み返せる＝今までどおり" };
  }
  return {
    readBack: false,
    why: "申し込んだお店は締めたあと読み返せない＝嘘の「保存に失敗」を出さないため読み返さない",
  };
}

export type DupVerdict = {
  /** すでにある日報が見つかったか */
  found: boolean;
  /** 確かめられたか（false＝人に確かめてもらう） */
  checked: boolean;
  /** 人に確かめてもらうときに出す文（確かめられたときは null） */
  message: string | null;
  why: string;
};

const DUP_FOUND =
  "同じ日付・担当・お店の日報がすでに登録されています。\n" +
  "二重登録になるかもしれません。それでも提出しますか？";

const DUP_UNKNOWN =
  "同じ日付・担当・お店の日報がもうあるかを、いま確かめられませんでした。\n" +
  "（このお店の日報は、この画面からは数えられない形になっています）\n" +
  "まだ出していないことを確かめてから提出してください。それでも提出しますか？";

/**
 * 「同じ日の日報がもうあるか」の答えを、取り違えないように決める。
 *
 * @param isTebaya    手羽屋として開いているか（印が空）
 * @param rows        棚から読めた件数
 * @param shelfState  貼り紙⑧が流れたか（手羽屋・1件以上のときは聞かなくてよい）
 */
export function decideDupCheck(params: {
  isTebaya: boolean;
  rows: number;
  shelfState: ReportShelfState;
}): DupVerdict {
  const { isTebaya, rows, shelfState } = params;

  if (rows > 0) {
    return { found: true, checked: true, message: DUP_FOUND, why: "もうある日報が読めた" };
  }
  if (isTebaya) {
    return {
      found: false,
      checked: true,
      message: null,
      why: "手羽屋（印が空）は締めても読める＝0件は本当に0件",
    };
  }
  if (shelfState === "締まっている") {
    return {
      found: false,
      checked: false,
      message: DUP_UNKNOWN,
      why: "申し込んだお店・棚は締まっている・0件＝読めなかった（0件と取り違えない）",
    };
  }
  return {
    found: false,
    checked: true,
    message: null,
    why:
      shelfState === "まだ"
        ? "棚がまだ締まっていない＝0件は本当に0件"
        : "締まったか確かめられない＝今までどおり（開かずに閉じない）",
  };
}

export type CumulativeVerdict = {
  /** 画面に出す「これまでの売上＋この日」 */
  value: number;
  /** 読めていない分があるときに出す1行（無いときは null） */
  note: string | null;
  why: string;
};

const CUM_UNKNOWN =
  "これまでの売上の合計は、この画面からは読めませんでした。" +
  "いまの数字は、この日の売上だけです。";

/**
 * 累計売上を出す。読めていないときは**0円を足したふりをしない**（正直に1行 添える）。
 *
 * @param rows   棚から読めた売上の合計
 * @param typed  いま入力している その日の売上
 */
export function decideCumulative(params: {
  isTebaya: boolean;
  rowCount: number;
  sumFromShelf: number;
  typed: number;
  shelfState: ReportShelfState;
}): CumulativeVerdict {
  const { isTebaya, rowCount, sumFromShelf, typed, shelfState } = params;
  const value = sumFromShelf + typed;
  if (isTebaya || rowCount > 0 || shelfState !== "締まっている") {
    return { value, note: null, why: "今までどおりの合計" };
  }
  return {
    value,
    note: CUM_UNKNOWN,
    why: "申し込んだお店・棚は締まっている・0件＝これまでの分を読めていない",
  };
}

/** /api/keiri/shelves の答えから、貼り紙⑧が流れたかを決める（取り違えを1か所に閉じる） */
export function reportShelfStateOf(body: {
  shelves?: { step?: unknown; state?: unknown }[];
} | null): ReportShelfState {
  const row = (body?.shelves ?? []).find((r) => r.step === REPORT_SHELF_STEP);
  if (!row) return "分からない";
  if (row.state === "ある") return "締まっている";
  if (row.state === "まだ無い") return "まだ";
  return "分からない";
}
