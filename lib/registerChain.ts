/**
 * レジの「つながり」を確かめる計算。
 *
 * ■ 何を確かめるのか
 *   レジのお金は、閉店してから翌日の開店までのあいだ**誰も触らない**はず。
 *   だから、
 *
 *      前の営業日の「閉店後のレジ金」 ＝ 今日の「開店前のレジ金」
 *
 *   になっていないとおかしい。ここがズレていたら、
 *   「どこかで数え間違えた」「レジからお金を出し入れした」「入力を忘れた」
 *   のどれかが起きている。
 *
 *   金庫を閉めて鍵をかけ、翌朝そのまま開けたのに中身が変わっていたら変ですよね。
 *   それを毎日自動でチェックする、というだけの機能です。
 *
 * ■ どこの数字を使うか
 *   開店前 … 設営後チェック（setup_checks.register_total）
 *   閉店後 … 営業後日報（daily_reports.register_total）
 *
 * ■ なぜ今まで気づけなかったか
 *   設営後チェックは「**前回の設営後チェック**の金額」と比べていた。
 *   あいだにある日報（閉店後の金額）を通っていないので、
 *   実際にはズレていない日に警告が出たり、逆にズレを見逃したりしていた。
 *
 * ■ 号車（ごうしゃ）ごとに追いかける
 *   レジは号車ごとに別々。1号車と2号車を混ぜて比べると意味がないので、
 *   号車ごとに時系列でつなぐ。
 */

/** 開店前の記録（設営後チェック） */
export type OpenRecord = {
  date: string;
  /** 号車。文字列で扱う（日報とスタッフの入力形式が違うため） */
  unit: string;
  location: string;
  /** 開店前にレジに入っていた金額 */
  amount: number;
};

/** 閉店後の記録（営業後日報） */
export type CloseRecord = {
  date: string;
  unit: string;
  location: string;
  /** 閉店後にレジに残した金額 */
  amount: number;
  /** その日の売上 */
  sales: number;
  /** その日レジから払った経費 */
  expenses: number;
  /** 日報に入力されたレジの過不足 */
  reportedDiff: number;
};

export type ChainRow = {
  unit: string;
  /** 開店前を記録した日 */
  date: string;
  location: string;
  openAmount: number;
  /** 直前の営業日（閉店後の記録がある日）。無ければ null */
  prevDate: string | null;
  prevLocation: string | null;
  /** 直前の営業日の閉店後の金額。無ければ null */
  prevCloseAmount: number | null;
  /**
   * 開店前 − 前営業日の閉店後。
   * 0 なら正常。プラスは「増えている」、マイナスは「減っている」。
   * 前営業日が見つからないときは null（＝確かめられない）。
   */
  diff: number | null;
  /** 突き合わせできたか。false は「前の記録が無くて確かめられない」 */
  checkable: boolean;
};

export type ChainSummary = {
  rows: ChainRow[];
  /** 突き合わせできた件数 */
  checked: number;
  /** ぴったり合っていた件数 */
  matched: number;
  /** ズレがあった件数 */
  mismatched: number;
  /** 前の記録が無くて確かめられなかった件数 */
  unknown: number;
  /** ズレの合計（プラスとマイナスは打ち消し合う） */
  netDiff: number;
};

/** 号車の書き方を揃える（"2" と 2 と "2号車" を同じものとして扱う） */
export function normalizeUnit(unit: string | number | null | undefined): string {
  if (unit === null || unit === undefined) return "";
  const s = String(unit).trim();
  if (!s) return "";
  const m = s.match(/\d+/);
  return m ? m[0] : s;
}

/**
 * 開店前の記録それぞれについて、直前の営業日の閉店後の金額を探して突き合わせる。
 *
 * 「直前の営業日」は、同じ号車で、その日より前にある閉店後の記録のうち一番新しいもの。
 * 週をまたいで休んでいても、ちゃんと前の営業日までさかのぼる。
 */
export function buildRegisterChain(
  opens: OpenRecord[],
  closes: CloseRecord[],
): ChainSummary {
  // 号車ごとに、閉店後の記録を日付順に並べておく
  const closesByUnit = new Map<string, CloseRecord[]>();
  for (const c of closes) {
    const unit = normalizeUnit(c.unit);
    if (!unit || !c.date) continue;
    const list = closesByUnit.get(unit) ?? [];
    list.push({ ...c, unit });
    closesByUnit.set(unit, list);
  }
  for (const list of closesByUnit.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  const rows: ChainRow[] = [];
  for (const o of opens) {
    const unit = normalizeUnit(o.unit);
    if (!unit || !o.date) continue;

    const list = closesByUnit.get(unit) ?? [];
    // その日より前で一番新しい閉店後の記録
    let prev: CloseRecord | null = null;
    for (const c of list) {
      if (c.date < o.date) prev = c;
      else break;
    }

    const openAmount = Number(o.amount) || 0;
    const prevCloseAmount = prev ? Number(prev.amount) || 0 : null;

    rows.push({
      unit,
      date: o.date,
      location: o.location,
      openAmount,
      prevDate: prev?.date ?? null,
      prevLocation: prev?.location ?? null,
      prevCloseAmount,
      diff: prevCloseAmount === null ? null : openAmount - prevCloseAmount,
      checkable: prevCloseAmount !== null,
    });
  }

  // 新しい順に並べる（画面では最近のものを上に出す）
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const checkable = rows.filter((r) => r.checkable);
  const mismatchedRows = checkable.filter((r) => r.diff !== 0);

  return {
    rows,
    checked: checkable.length,
    matched: checkable.length - mismatchedRows.length,
    mismatched: mismatchedRows.length,
    unknown: rows.length - checkable.length,
    netDiff: mismatchedRows.reduce((s, r) => s + (r.diff ?? 0), 0),
  };
}

/**
 * その日1日のなかでのつじつま合わせ。
 *
 *   開店前 ＋ 売上 − レジから払った経費 − 持ち帰った金額 ＝ 閉店後
 *
 * 持ち帰る金額は「売上 − 経費」なので、計算上は
 *
 *   開店前 ＝ 閉店後
 *
 * になるはず。ここがズレていたら、その日のうちに違算が出ている。
 */
export function withinDayDiff(open: number, close: number): number {
  return (Number(close) || 0) - (Number(open) || 0);
}
