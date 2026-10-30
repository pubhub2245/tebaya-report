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

export type ListVerdict = {
  /** 一覧を出してよいか */
  showList: boolean;
  /** 出さないときに画面へ出す1行（出すときは null） */
  message: string | null;
  why: string;
};

const LIST_UNKNOWN =
  "このお店の日報の一覧は、この画面からは読めませんでした。" +
  "**「1件もありません」という意味ではありません。** " +
  "出した日報は記録に残っていますので、同じものをもう一度 出さないでください。";

/**
 * 日報の一覧（/report/edit）を出してよいかを決める。
 * ★締めたあとの申し込んだお店は、必ず「0件」で返るので、
 *   **「1件もありません」と見せてはいけない**（もう一度 出されて二重になる）。
 */
export function decideReportListRead(params: {
  isTebaya: boolean;
  rows: number;
  shelfState: ReportShelfState;
}): ListVerdict {
  const { isTebaya, rows, shelfState } = params;
  if (isTebaya) {
    return { showList: true, message: null, why: "手羽屋（印が空）は締めても読める" };
  }
  if (rows > 0) {
    return { showList: true, message: null, why: "行が読めている＝読む道は開いている" };
  }
  if (shelfState === "締まっている") {
    return {
      showList: false,
      message: LIST_UNKNOWN,
      why: "申し込んだお店・棚は締まっている・0件＝読めなかった（0件と取り違えない）",
    };
  }
  return {
    showList: true,
    message: null,
    why:
      shelfState === "まだ"
        ? "棚がまだ締まっていない＝0件は本当に0件"
        : "締まったか確かめられない＝今までどおり出す",
  };
}

export type EditVerdict = {
  /** この画面から直してよいか */
  canEdit: boolean;
  /** 直せないときに出す1行（直せるときは null） */
  message: string | null;
  why: string;
};

const EDIT_BLOCKED =
  "このお店の日報は、この画面からは直せない形になっています（棚の読む決まり）。" +
  "押しても**何も変わらないのに「保存しました」と出てしまう**ため、ここでは止めています。" +
  "直したい所をお知らせください。";

/**
 * 日報を直してよいかを決める（EditReportModal）。
 *
 * ★締めたあとの申し込んだお店では、書き換えが**黙って0行**になります
 *   （下見で実測：`update … returning` は0行）。
 *   「保存しました」と出て中身が変わらないのが一番よくないので、**先に止めます**。
 *   手羽屋は印が空なので、今までどおり直せます（下見で実測）。
 */
export function decideReportEdit(params: {
  isTebaya: boolean;
  shelfState: ReportShelfState;
}): EditVerdict {
  if (params.isTebaya) {
    return { canEdit: true, message: null, why: "手羽屋（印が空）は締めても直せる＝今までどおり" };
  }
  if (params.shelfState === "締まっている") {
    return {
      canEdit: false,
      message: EDIT_BLOCKED,
      why: "申し込んだお店・棚は締まっている＝書き換えが黙って0行になる",
    };
  }
  return {
    canEdit: true,
    message: null,
    why: "まだ締まっていない／確かめられない＝今までどおり直せる",
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

/* ===========================================================================
 * 商品の一覧（名前と単価）が読めなかったときの決まり（2026-10-30・f3-4・f5-4）
 * ===========================================================================
 *
 * ■ 何が起きるところだったか（今回 見つけたこと）
 *   貼り紙⑬は、商品の棚（sale_products）も「**印が空の行だけ 読んでよい**」にします。
 *   手羽屋の行は印が空なので今までどおりですが、
 *   **申し込んだお店の商品は、日報の画面（公開の鍵）から0件になります**。
 *
 *   日報の STEP4 は「単価 × 本数の合計」と、レジで数えた売上を突き合わせる所です。
 *   商品が0件だと合計が0円になるので、
 *     ・売上との差が**売上まるごと**になり「合っていません」と出る
 *     ・差の理由を選ばないと **STEP4 から先へ進めない**
 *     ・しかも0件のときの画面は「商品がまだ登録されていません」と出して
 *       **差の理由を選ぶ所を出しません** ＝ **1枚も日報が出せません**
 *     ・その画面から商品を足すと（入れるのは通る・読み返せない）
 *       **同じ商品が何度も増えます**（2026-10-17 に出店場所でまったく同じことが起きています）
 *
 *   ＝ 貼り紙を流した日に、申し込んだお店が**日報を1枚も出せなくなる**ところでした。
 *
 * ■ どう直すか
 *   「0件」と「読めなかった」を分けます。読めなかったときは
 *     ・突き合わせを**その日はしない**（嘘の差額で止めない）
 *     ・画面に**正直に1行**出す（「1件もない」とは言わない）
 *     ・商品を足す所は**出さない**（同じ商品が増えるのを防ぐ）
 *   手羽屋（印が空）は締めたあとも読めるので、**1行も変わりません**
 *   （棚の状態も問い合わせません＝通信の回数も今までどおり）。
 */

/** 貼り紙の確かめ窓口で、選択肢の棚（出店場所・担当者・商品）を締める決まりが入っている段 */
export const MASTER_SHELF_STEP = "⑬";

export type BreakdownGate = {
  /** 内訳と売上の突き合わせをするか（false＝その日はしない） */
  check: boolean;
  /** 商品を足す所を出してよいか（false＝同じ商品が増えるので出さない） */
  allowAdd: boolean;
  /** 画面に出す1行（ふだんは null） */
  message: string | null;
  why: string;
};

const PRODUCTS_UNREADABLE =
  "このお店の商品の一覧（名前と単価）は、この画面からは読めませんでした。" +
  "**「1件もない」という意味ではありません。** " +
  "本数と売上の突き合わせは、この日はしません（売上は STEP2 で入れた金額のまま記録します）。";

/**
 * 内訳の突き合わせをしてよいかを決める。
 *
 * @param isTebaya      手羽屋として開いているか（印が空）
 * @param productRows   棚から読めた商品の件数
 * @param shelfState    貼り紙⑬が流れたか（手羽屋・1件以上のときは聞かなくてよい）
 */
export function decideBreakdownCheck(params: {
  isTebaya: boolean;
  productRows: number;
  shelfState: ReportShelfState;
}): BreakdownGate {
  const { isTebaya, productRows, shelfState } = params;

  if (productRows > 0) {
    return { check: true, allowAdd: true, message: null, why: "商品が読めた＝今までどおり" };
  }
  if (isTebaya) {
    return {
      check: true,
      allowAdd: true,
      message: null,
      why: "手羽屋（印が空）は締めても読める＝0件は本当に0件（商品マスタが空）",
    };
  }
  if (shelfState === "締まっている") {
    return {
      check: false,
      allowAdd: false,
      message: PRODUCTS_UNREADABLE,
      why: "申し込んだお店・棚は締まっている・0件＝読めなかった（0件と取り違えない）",
    };
  }
  return {
    check: true,
    allowAdd: true,
    message: null,
    why: "まだ締まっていない／確かめられない＝0件は本当の0件として今までどおり",
  };
}

/**
 * 窓口ごしに、そのお店の商品が読めたときの決まり（2026-10-30・kp269）。
 *
 * ⑬のあと、申し込んだお店の商品は**公開の鍵では0件**になりますが、
 * 倉庫の窓口（合言葉の札で本人だと分かるとき）からは読めます。
 * 読めたら**突き合わせは今までどおりします**（＝2軒目でも STEP4 が働きます）。
 * ただし**足す所は出しません**：公開の鍵で入れた商品は読み返せないので、
 * 同じ商品が増えてしまうためです（出店場所で 2026-10-17 に実際に起きた形）。
 */
export function gateFromWindowProducts(rows: number): BreakdownGate {
  if (rows > 0) {
    return {
      check: true,
      allowAdd: false,
      message: null,
      why: "窓口ごしに そのお店の商品が読めた＝突き合わせはする（足す所は出さない）",
    };
  }
  return {
    check: false,
    allowAdd: false,
    message: PRODUCTS_UNREADABLE,
    why: "窓口ごしでも読めなかった＝0件と取り違えない",
  };
}

/** /api/keiri/shelves の答えから、貼り紙⑬が流れたかを決める（取り違えを1か所に閉じる） */
export function masterShelfStateOf(body: {
  shelves?: { step?: unknown; state?: unknown }[];
} | null): ReportShelfState {
  const row = (body?.shelves ?? []).find((r) => r.step === MASTER_SHELF_STEP);
  if (!row) return "分からない";
  if (row.state === "ある") return "締まっている";
  if (row.state === "まだ無い") return "まだ";
  return "分からない";
}
