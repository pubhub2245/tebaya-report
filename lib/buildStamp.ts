/**
 * 「いま見ているページは、最新の版か」を1回で確かめるための合言葉。
 *
 * ■ 何のためにあるか（2026-09-19）
 *   本番に出した直しが「出ていない」と誤って報告されることが、この日だけで3回あった。
 *   3回とも本番は正しく、外からページを読む道具が古い中身をおぼえていただけだった。
 *   そのたびに最優先の仕事が1つ立ち、売る手が止まった。
 *
 *   目で「3,000円が出ているか」を数える方法では、これは何度でも起きる。
 *   そこで「組み立てた瞬間に焼き込む合言葉」を1つ持たせ、
 *   　① 外向きページの見えない札 <meta name="x-build">
 *   　② /api/version（毎回その場で答える窓口）
 *   を見比べるだけで判断できるようにした。
 *
 * ■ 使い方（やさしく）
 *   ページの札と /api/version の合言葉が **同じ → そのページは最新**。
 *   **違う → 配り先（途中の保管庫）が古い中身を配っている**＝そこが直すところ。
 *
 * ■ 入っているもの
 *   コミットの短い番号（倉庫の「何番目の直しか」の目印）と、組み立てた時刻だけ。
 *   鍵・合言葉・環境変数の値は入らない（next.config.js で組み立てている）。
 */

/** 組み立てたときに焼き込まれる合言葉。例: "a34e8b1@2026-09-19T05:42:31.000Z" */
export const BUILD_STAMP: string =
  process.env.NEXT_PUBLIC_BUILD_STAMP || "unknown";

/** 合言葉を「コミットの番号」と「組み立て時刻」に分ける（表示用） */
export function parseBuildStamp(stamp: string = BUILD_STAMP): {
  commit: string;
  builtAt: string | null;
} {
  const at = stamp.indexOf("@");
  if (at < 0) return { commit: stamp, builtAt: null };
  const builtAt = stamp.slice(at + 1);
  return {
    commit: stamp.slice(0, at),
    builtAt: builtAt || null,
  };
}
