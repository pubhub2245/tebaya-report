/**
 * 倉庫から「その条件に合う行をぜんぶ」読むための、ただ1か所の読み方。
 *
 * ■ なぜ要るのか（やさしい説明・2026-11-03・f1-5／f1-7／f3-3）
 *   倉庫（Supabase）は、1回の問い合わせで返す行数に**上限**を持っています。
 *   上限を超えた分は**エラーにならず、黙って切り落とされます**。
 *   経理の締めは「数え始めの日から今日まで」をまとめて読むので、
 *   日が経つほど行が増え、ある日を境に**古い行だけが入り、新しい行が落ちます**。
 *
 *   2026-11-02 の夜に10月の日報が5件 入ったのに、11-03 の朝も締めの窓口が
 *   「日報10件」と答え続けたのがこれです（10/18 までで切れていました）。
 *   月だけを読む窓口（/api/keiri/scopecheck）は15件と正しく答えていたので、
 *   「サイトが古い答えをためている」のではなく、**読む行数が足りていなかった**のが正体です。
 *
 * ■ どう直すか
 *   ① 問い合わせに「ぜんぶで何行あるか」も一緒に聞く（count: "exact"）
 *   ② 返ってきた行数が足りなければ、続きを順番に読み足す
 *   ③ 全部そろったら止める（上限より少ない1回で終わるときは、今までと同じ1回だけ）
 *
 * ■ 守っていること
 *   ・金額の計算はしない。**読むだけ**で、1行も書き込まない
 *   ・行が足りないまま返すことはしない。足りなければ `incomplete` を立てて知らせる
 *   ・手羽屋が毎日使う画面（日報・シフト・レジ・LINE）からは呼ばれない（経理だけ）
 */

/** 1回の問い合わせで頼む行数。倉庫側の上限が小さいときは、そのぶん何回かに分かれる */
export const READ_ALL_PAGE_SIZE = 1000;

/** 念のための打ち切り。無限に読み続けないため（1000行×40回＝4万行まで） */
export const READ_ALL_MAX_PAGES = 40;

/** 1回ぶんの答え（倉庫の返事のうち、ここで使う3つだけ） */
export type ReadAllPage<R> = {
  data: R[] | null;
  error: unknown;
  count?: number | null;
};

/** 「続きから読める」問い合わせの最小の形。テストでは偽物を渡して確かめる */
export type RangeableQuery<R> = {
  range(from: number, to: number): PromiseLike<ReadAllPage<R>>;
};

export type ReadAllResult<R> = {
  /** 読めた行（順番は倉庫に頼んだ並びのまま） */
  rows: R[];
  /** 倉庫が断ったときの理由。null なら読めた */
  error: unknown;
  /** 倉庫が「ぜんぶで何行あるか」を答えたときの数。答えなければ null */
  total: number | null;
  /** 何回 問い合わせたか */
  pages: number;
  /** 行がそろっていないかもしれない（断られた・打ち切った） */
  incomplete: boolean;
};

/**
 * 同じ問い合わせを「続きから」何回か行って、行をぜんぶ集める。
 *
 * @param makeQuery 毎回 新しく問い合わせを組み立てる関数
 *   （同じ物を使い回すと `range` が二重に付くため、必ず作り直します）
 */
export async function readAllRows<R>(
  makeQuery: () => RangeableQuery<R>,
  opts?: { pageSize?: number; maxPages?: number },
): Promise<ReadAllResult<R>> {
  const pageSize = Math.max(1, Math.floor(opts?.pageSize ?? READ_ALL_PAGE_SIZE));
  const maxPages = Math.max(1, Math.floor(opts?.maxPages ?? READ_ALL_MAX_PAGES));

  const rows: R[] = [];
  let total: number | null = null;
  let pages = 0;
  let offset = 0;

  while (pages < maxPages) {
    const page = await makeQuery().range(offset, offset + pageSize - 1);
    pages += 1;
    if (page.error) {
      return { rows, error: page.error, total, pages, incomplete: true };
    }
    if (typeof page.count === "number" && Number.isFinite(page.count)) {
      total = page.count;
    }
    const got = page.data ?? [];
    for (const row of got) rows.push(row);

    // もう1行も返らなければ、ここで終わり
    if (got.length === 0) return { rows, error: null, total, pages, incomplete: false };

    offset += got.length;

    // ぜんぶで何行あるかを倉庫が答えているなら、そこに届いたら終わり
    if (total !== null && rows.length >= total) {
      return { rows, error: null, total, pages, incomplete: false };
    }
    // 行数が分からないときは、頼んだ数より少なく返ってきたら終わり（今までと同じ動き）
    if (total === null && got.length < pageSize) {
      return { rows, error: null, total, pages, incomplete: false };
    }
  }

  // 打ち切り（ここに来るのは4万行を超えたときだけ）
  return { rows, error: null, total, pages, incomplete: true };
}
