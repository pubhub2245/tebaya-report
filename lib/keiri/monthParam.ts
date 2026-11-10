/**
 * 「どの月を見てほしいか」の受け取り方を決める、ただ1か所のファイル（2026-11-10・f1-2／f1-5）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   外から確かめる窓口のいくつかは `?ym=2026-09` のように月を指定できます。
 *   ところが**鍵の名前を間違えて** `?month=2026-09` と書いても、窓口は
 *   「指定が無かった」と見なして**黙って前の月の答え**を返していました。
 *   ＝ 読んだ人は 9月を見たつもりで、画面には 10月の答えが出ている状態です。
 *   そのまま仕上げチェック表に合否を付けると、**見ていない月で合格を付けます**
 *   （2026-11-10 13:0x に A が実際にこれに当たりました）。
 *
 * ■ どう直すか
 *   ・月の形（YYYY-MM）が、**ym 以外の鍵**で渡されていたら、それを名指しで知らせる
 *   ・ym に月の形でないもの（例 `?ym=9月`）が入っていたら、それも知らせる
 *   ・**どちらの場合も、答えを作るのは今までどおり既定の月**（黙って別の月に切り替えない）
 *   ・知らせは返事の `monthParam` に入れ、`asked`（読んだ人が書いた値）と
 *     `used`（実際に答えた月）を必ず並べて出す
 *
 * ■ ここでは通信しません（純粋な判定）。1行も書き込みません。
 */

/** 月の形（YYYY-MM・01〜12）か */
export function isYm(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v.trim());
}

/** 月の指定として「間違えて使われやすい」鍵の名前 */
export const MONTH_ALIAS_KEYS = ["month", "ym_", "yearmonth", "year_month", "m", "date", "で"];

export type MonthParam = {
  /** 実際に答えた月（YYYY-MM） */
  ym: string;
  /** 読んだ人が ym に書いた値（書いていなければ null） */
  asked: string | null;
  /** 月の指定として受け取れたか（false＝既定の月で答えた） */
  accepted: boolean;
  /**
   * 知らせ（1行）。null なら何も問題なし。
   * ★**この欄が入っている答えは、読んだ人が見たかった月とちがう月の答えです。**
   */
  warning: string | null;
  /** 正しい書き方（そのまま貼れる形） */
  howTo: string;
};

/**
 * 月の指定を受け取る。**間違った鍵で渡されたときは、黙って別の月で答えない**。
 *
 * @param search 住所の後ろの指定（`?ym=…` など）
 * @param fallbackYm 指定が無かったときに答える月（窓口ごとの既定。例：前の月）
 */
export function readMonthParam(
  search: URLSearchParams,
  fallbackYm: string,
): MonthParam {
  const raw = search.get("ym");
  const asked = raw === null ? null : raw.trim();
  const howTo = `月を指定するときは ?ym=2026-09 の形で書いてください（鍵の名前は ym です）`;

  // ① 正しい鍵で、正しい形 → そのまま受け取る
  if (asked !== null && isYm(asked)) {
    return { ym: asked, asked, accepted: true, warning: null, howTo };
  }

  // ② 正しい鍵だが、月の形ではない（例 ?ym=9月）
  if (asked !== null && asked !== "") {
    return {
      ym: fallbackYm,
      asked,
      accepted: false,
      warning:
        `?ym= に「${asked.slice(0, 20)}」と書かれていますが、月の形（YYYY-MM）ではありません。` +
        `**この答えは ${fallbackYm} のものです**（指定された月ではありません）。${howTo}`,
      howTo,
    };
  }

  // ③ ym は無いが、よく間違える別の鍵に月が入っている（例 ?month=2026-09）
  for (const key of MONTH_ALIAS_KEYS) {
    const v = (search.get(key) ?? "").trim();
    if (v !== "" && isYm(v)) {
      return {
        ym: fallbackYm,
        asked: null,
        accepted: false,
        warning:
          `?${key}=${v} と書かれていますが、月の指定の鍵は **ym** です。` +
          `**この答えは ${fallbackYm} のものです**（${v} ではありません）。${howTo}`,
        howTo,
      };
    }
  }

  // ④ 何も指定されていない（今までどおり既定の月）
  return { ym: fallbackYm, asked: null, accepted: true, warning: null, howTo };
}

/** 窓口の返事に入れる形（asked と used を必ず並べる） */
export function monthParamWindow(p: MonthParam): {
  used: string;
  asked: string | null;
  accepted: boolean;
  warning: string | null;
  howTo: string;
} {
  return {
    used: p.ym,
    asked: p.asked,
    accepted: p.accepted,
    warning: p.warning,
    howTo: p.howTo,
  };
}
