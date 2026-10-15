import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { probeCopyTables } from "@/lib/keiri/copyProbe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * 持ち時間（2026-10-15）。
 * 組み立てた名前は 800 通りをこえます。既定の10秒では途中で止まり、
 * 外から確かめる人が ?from=… で何回も開き直さないと
 * 「ぜんぶ聞き終えた」になりません（10/15 の朝は 72 本で止まっていました）。
 * 1回 開けば終わるように、ここだけ60秒にします（**読むだけ**の窓口です）。
 */
export const maxDuration = 60;

/**
 * GET /api/keiri/copies
 *
 * 「手羽屋のデータの**写し**が、公開の鍵で読めてしまわないか」を
 * **読むだけ**で確かめる窓口（f3-4・2026-10-14）。
 *
 * ■ なぜ要るのか
 *   お店ごとに分ける工事は、**いま使っている棚**にだけ入れてきました。
 *   2026-10-13 に、その工事の外に置かれていた棚が1つ見つかりました
 *   （2026-09-02 に取った日報の控え・13行）。鍵の決まりが1本も無く、
 *   ブラウザに配られている公開の鍵で、アプリを通さずに読めました。
 *   **本体を分けても、同じ中身の写しが開いていれば「分かれている」とは言えません。**
 *   1つ見つけて終わりにしないため、ここで**名前から機械的に**数え上げます。
 *
 * ■ 読み方が逆です（ここだけ）
 *   ほかの窓口は「読めたら、できている」でした。ここは鍵をかける話なので、
 *   **読めてしまったら、まだ開いている**という逆の読み方になります。
 *   だから必ず**公開の鍵**で聞きます（サーバー側の鍵では決まりを飛び越えてしまう）。
 *
 * ■ 分からないときは「閉まった」と言いません
 *   聞けなかった・一覧が読めなかったときは、そのまま「分かりません」と返します。
 *
 * ★ 1行も書き込みません。行の中身（金額・お店の名前・連絡先）は1文字も読みません。
 * ★ 鍵・合言葉の値は返しません。返すのは棚の名前と ○× だけです。
 * ★ 手羽屋の日報・シフト・レジ・LINE には一切触れていません。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 0);
  const report = await probeCopyTables({
    sweep: url.searchParams.get("sweep") !== "no",
    from: Number.isFinite(from) ? from : 0,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  });

  return NextResponse.json(
    stampCheckWindow({
      ...report,
      how: "公開の鍵（ブラウザに配られているのと同じ鍵）で、棚ごとに件数だけを聞いています。行の中身は1文字も読みません",
      reversed:
        "読み方が逆です：『まだ読めます』＝ まだ開いている（直すことがある）。『読めません』＝ 鍵が効いている",
      fix: "開いている写しは、/keiri/sql の貼り紙⑦を1回 流すと閉まります（消しません・中身は1行も触りません・1行で元に戻せます）",
      tenantRowsHow:
        "**手羽屋の行（印が空）は、貼り紙を流したあとも公開の鍵で読めます。それが正しい形です**" +
        "（ブラウザから倉庫を読む作りで、お店ごとの入室がまだ無いため）。" +
        "f3-4 が聞いているのは『よその店のデータが見えないか』なので、" +
        "tenantRows では**印が付いた行だけ**を数えています。" +
        "よその店の行が1行も無いあいだは『閉まっている』と『まだ試せていない』の" +
        "見分けが付かないので、同じ行を倉庫の窓口ごしにも読んで見比べています",
      sweepHow:
        "倉庫が棚の名前の一覧を出してくれないので（公開の読み取りでは 401）、" +
        "こちらで写しの名前を組み立てて片っぱしから聞いています。" +
        "『そんな棚はありません』がほとんどなので、無かった数だけを返し、" +
        "開いている／聞けなかった棚だけを並べます。" +
        "続きがあるときは ?from=… を付けて開いてください（?sweep=no で組み立てを止められます）",
    }),
    { status: 200, headers: CHECK_WINDOW_HEADERS },
  );
}
