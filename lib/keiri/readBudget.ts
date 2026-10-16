/**
 * 経理の数字を倉庫（Supabase）から読むときの「ここまでで諦める」線。
 *
 * ■ なぜ要るか（2026-10-16・kp255・f4-1・f5-1）
 *   倉庫へ届かない状態で月の数字を1回 読むと、答えが返るまで **63.2秒** かかりました。
 *   読めなかったときは「手で確認した控え」に戻る作りなので**数字は狂いません**が、
 *   倉庫が応えない日は 紹介ページ・お試し版・見本が**1分ちかく白いまま**になります。
 *   店主に見せている所なので、そこが一番こわい。
 *
 * ■ 63.2秒 の正体（2026-10-16 実測。ここを間違えると直せません）
 *   1回ぶんの通信が遅いのではありません。**倉庫に届かないとき、倉庫をつなぐ部品が
 *   同じ問い合わせを自分で4回 試します**（あいだに 1秒→2秒→4秒 待つ）。
 *   ＝ 1つの棚につき 7.1秒。月の数字は棚を9回に分けて聞くので、合計 63.2秒。
 *   そのため「1回ぶんの上限」を足しても縮みません（待っているのは通信ではなく、
 *   部品の中の“間”だからです）。実際に試して、63.2秒 のまま変わりませんでした。
 *
 * ■ だからこうする
 *   **読み終わるのを待つのを、こちらの線でやめる**（`raceWithDeadline`）。
 *   線に当たったら「読めませんでした」の形をそのまま返すので、呼んだ側は
 *   今までどおり**手で確認した控え**に戻ります（**数字は作りません**）。
 *   やり直し（4回 試す）はそのまま残すので、一瞬の不調は今までどおり勝手に直ります。
 *
 * ■ 守ること
 *   ・**手羽屋が毎日使う画面（日報・シフト・レジ・LINE）には入れない。**
 *     この線を使うのは経理の読む所（lib/keiri/loadMonthServer.ts）だけ。
 *   ・線を短くしすぎると、ふだんの日に控えの数字が出てしまう。
 *     本番の実測（2026-10-16・暖まった状態）は 月の数字ぜんぶで 0.7〜1.5秒、
 *     1つの棚が一瞬 不調で4回 試し直しても 7.1秒 なので、**10秒**にしてある。
 */

/** 読むのをやめる線（ミリ秒）。ふだん 0.7〜1.5秒・やり直し込みでも 7.1秒 */
export const KEIRI_READ_BUDGET_MS = 10_000;

/** 線に当たったときの断り文（人が読む。鍵も金額も入れない） */
export const READ_TIMED_OUT_MESSAGE =
  "倉庫からの返事が時間内に来なかったので、ここで待つのをやめました（数字は手で確認した控えに戻ります）";

/** 待つのをやめた結果 */
export type DeadlineResult<T> = {
  value: T;
  /** 線に当たったか（true＝倉庫の返事を待たずに戻した） */
  timedOut: boolean;
  /** 実際にかかった時間（ミリ秒） */
  elapsedMs: number;
};

/**
 * `work` を待つ。`ms` を過ぎたら待つのをやめて `onTimeout()` の形を返す。
 *
 * ★`work` を**止めはしません**（止められないので）。こちらが待つのをやめるだけです。
 *   やめたあとに `work` が失敗しても、迷子の例外になりません（受け止めてあります）。
 * ★`ms` が0以下なら、今までどおり最後まで待ちます。
 */
export async function raceWithDeadline<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => T,
  now: () => number = () => Date.now(),
): Promise<DeadlineResult<T>> {
  const startedAt = now();
  if (!(ms > 0)) {
    const value = await work;
    return { value, timedOut: false, elapsedMs: now() - startedAt };
  }
  // 待つのをやめたあとに失敗しても、迷子の例外にならないようにする
  work.catch(() => {});
  const marker = Symbol("timed-out");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bell = new Promise<typeof marker>((resolve) => {
    timer = setTimeout(() => resolve(marker), ms);
  });
  try {
    const won = await Promise.race([work, bell]);
    if (won === marker) {
      return { value: onTimeout(), timedOut: true, elapsedMs: now() - startedAt };
    }
    return { value: won as T, timedOut: false, elapsedMs: now() - startedAt };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
