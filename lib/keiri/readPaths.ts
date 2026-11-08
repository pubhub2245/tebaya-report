/**
 * 「経理の数字を読む2つの道が、同じ答えを出すか」を数えるところ（2026-10-11・kp239・f3-4）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   経理の画面には、数字を読む道が2本ありました。
 *     ① サーバー側の窓口から読む（/api/keiri/month）… 申し込んだお店はこちら
 *     ② ブラウザから倉庫を直接のぞく … 手羽屋はこちら
 *   ②が残っているかぎり「ブラウザが名乗った番号で帳簿が開く」道が消えません。
 *   そこで手羽屋も①に寄せたのですが、**寄せたせいで数字が変わっては困ります**。
 *
 *   じゅんの経理の画面は合言葉の内側なので、こちら（Claude）からは開けません。
 *   ＝「変わっていない」ことを目で確かめられません。そこで**2つの道に同じ月を読ませて、
 *   答えの差を数える**ようにしました。差がぜんぶ0なら、寄せても数字は動きません。
 *
 * ■ 外に出さないもの（ここが大事）
 *   返すのは **差（引き算の答え）と件数だけ**です。売上・経費・利益の金額そのものは
 *   1円も返しません（差が0なら「同じ」と分かる＝それで足ります）。
 *   合言葉・鍵・お店の名前・連絡先も1文字も返しません。
 *
 * ■ ここは通信をしません（計算だけ）
 *   倉庫から読む所は呼ぶ側の仕事です。テストで作り物の数を渡して確かめられます。
 */

/** 片方の道が出した答えを、比べられる形にしたもの */
export type ReadPathNumbers = {
  /** その月に読めた日報の件数 */
  reports: number;
  /** 払った記録の件数 */
  payments: number;
  /** 立替の件数 */
  advances: number;
  /** 金庫を数えた記録・銀行に入れた記録の件数 */
  cashEvents: number;
  /** 売上（金額そのものは外に出さない。差だけ出す） */
  sales: number;
  /** かかったお金の合計 */
  expenseTotal: number;
  /** 利益 */
  profit: number;
  /**
   * いまの現金（金庫にあるはずの額）。
   * ★ここを比べるのが肝（2026-10-11・kp249）。じゅんが金庫を数えて見比べる相手なので、
   *   読み方を寄せたせいでここが動いては、f1-4（金庫と合うか）の確かめが成り立たない。
   */
  cash: number;
  /** 「同じ支払いが2か所にある疑い」の件数（人の確認待ちの数） */
  dupes: number;
  /** 設定（数え始めの日・期首残高・率・家賃）を1本の文字にしたもの */
  settingsKey: string;
};

export type ReadPathDiff = {
  /** 何がちがったか（人が読む言葉） */
  what: string;
  /** 窓口 − 直読み（件数・金額）。文字のちがいは null */
  diff: number | null;
};

export type ReadPathComparison = {
  /** 2つの道の答えが同じか */
  same: boolean;
  /** ちがった所だけ。same が true なら空 */
  diffs: ReadPathDiff[];
  /** 人が読む1行 */
  summary: string;
};

const NUMBER_FIELDS: { key: keyof ReadPathNumbers; what: string }[] = [
  { key: "reports", what: "日報の件数" },
  { key: "payments", what: "払った記録の件数" },
  { key: "advances", what: "立替の件数" },
  { key: "cashEvents", what: "金庫・入金の記録の件数" },
  { key: "sales", what: "売上" },
  { key: "expenseTotal", what: "かかったお金の合計" },
  { key: "profit", what: "利益" },
  { key: "cash", what: "いまの現金（金庫にあるはずの額）" },
  { key: "dupes", what: "同じ支払いが2か所にある疑いの件数" },
];

/**
 * 2つの道の答えを比べる。
 *
 * @param window サーバー側の窓口から読んだ答え
 * @param direct ブラウザと同じ読み方（倉庫を直接のぞく）の答え
 */
export function compareReadPaths(
  window: ReadPathNumbers,
  direct: ReadPathNumbers,
): ReadPathComparison {
  const diffs: ReadPathDiff[] = [];

  for (const f of NUMBER_FIELDS) {
    const a = Number(window[f.key]) || 0;
    const b = Number(direct[f.key]) || 0;
    if (a !== b) diffs.push({ what: f.what, diff: a - b });
  }
  if (window.settingsKey !== direct.settingsKey) {
    diffs.push({ what: "経理の設定（数え始めの日・期首残高・率・家賃）", diff: null });
  }

  const same = diffs.length === 0;
  return {
    same,
    diffs,
    summary: same
      ? "2つの道の答えは、件数も金額も**1円・1件もちがいません**。" +
        "手羽屋の経理の画面をサーバー側の窓口に寄せても、出る数字は変わりません。"
      : `2つの道の答えが ${diffs.length} か所ちがいます。` +
        "寄せる前に、ちがいの中身を確かめてください（差だけを出しています）。",
  };
}

/* ------------------------------------------------------------------ *
 *  「いま測れたのか」を分けて答える（2026-11-08・f1-2／f3-4）
 * ------------------------------------------------------------------ */

/**
 * ■ なぜ足したか（ここを取り違えると嘘の不合格が出ます）
 *   この窓口（/api/keiri/readpaths）は、倉庫（データのしまい場所）が眠っている日に
 *   **ok: false** と答えていました。読んだ人には
 *   「2つの道の答えがちがう＝寄せたせいで数字が変わった」と読めますが、
 *   **実際には1回も読めていません**（倉庫から返事が来なかっただけ）。
 *   ＝ **止まっているだけの日を不合格にする**形でした。
 *   11/6〜11/8 に同じ形を 6つの窓口（scopecheck・readcheck・shelves・firstmonth・
 *   tenant-trial/steps・photos）で直したのと、まったく同じ直しです。
 *
 * ■ これからの答え方
 *   読めた日 … ok は「2つの道が同じか」そのまま（今までと1文字も変わりません）
 *   読めない日 … measurable: false・ok: **null**・same: **null**
 *                「いまは測れませんでした。合格にも不合格にもしていません」
 *
 * ★この関数は計算だけです（倉庫に聞きません）。試験で固定してあります。
 */
export type ReadPathVerdict = {
  /** いま測れたか（false なら合否を付けないこと） */
  measurable: boolean;
  /** 2つの道の答えが同じか。測れていない日は null */
  ok: boolean | null;
  /** ok と同じ意味（読む人のための別名）。測れていない日は null */
  same: boolean | null;
  /** ちがった所だけ（測れていない日は空） */
  diffs: ReadPathDiff[];
  /** 人が読む1行 */
  summary: string;
};

/** 測れなかった理由（倉庫のどこで止まったか） */
export type ReadPathBlocked =
  /** 倉庫そのものに届かない・断られた */
  | { kind: "warehouse"; reason: string }
  /** 倉庫は生きているが、読めなかった棚がある */
  | { kind: "shelf"; reason: string }
  /** 通信そのものが失敗した */
  | { kind: "failure"; reason: string };

const CANNOT_MEASURE_TAIL =
  "合格にも不合格にもしていません。倉庫が読めるようになってから、もう一度 開いてください。";

/**
 * 2つの道の比べた結果に「いま測れたのか」を付けて返す。
 *
 * @param blocked 測れなかった理由。null なら測れた
 * @param comparison 測れたときの比べた結果（測れなかったときは渡さない）
 */
export function readPathVerdict(
  blocked: ReadPathBlocked | null,
  comparison?: ReadPathComparison | null,
): ReadPathVerdict {
  if (blocked) {
    return {
      measurable: false,
      ok: null,
      same: null,
      diffs: [],
      summary: `いまは測れませんでした（${blocked.reason}）。${CANNOT_MEASURE_TAIL}`,
    };
  }
  if (!comparison) {
    return {
      measurable: false,
      ok: null,
      same: null,
      diffs: [],
      summary: `いまは測れませんでした（比べる答えが揃いませんでした）。${CANNOT_MEASURE_TAIL}`,
    };
  }
  return {
    measurable: true,
    ok: comparison.same,
    same: comparison.same,
    diffs: comparison.diffs,
    summary: comparison.summary,
  };
}
