/**
 * 「外から確かめる窓口」の一覧と、その返し方を決める、ただ1か所のファイル（f1-5・f3-3・f3-4）。
 *
 * ■ なぜ要るか（2026-10-06・B2 の気づきから）
 *   仕上げチェック表は「外から確かめられるか」で合否を付けます。そのために
 *   読むだけの窓口をいくつか作ってありますが、**検査役（B2）がそれを開けません**でした。
 *   原因はコードではなく、このサイトの `robots.txt` が
 *   「経理の売り場だけ読んでよい・あとは全部ことわる」になっていたことです。
 *   自動で読む道具は、ことわられている住所を読みません。
 *   ＝ こちらが「確かめられます」と言っている窓口を、検査役が確かめられない状態でした。
 *
 * ■ どう直すか
 *   読むだけの窓口だけを `robots.txt` で**読んでよい**ことにし、
 *   そのかわり返事に「検索結果には載せないでください」の札（X-Robots-Tag）を付けます。
 *   ＝ 検査役は開ける。検索結果には出ない。
 *
 * ■ ここに載せてよい窓口の決まり（守ること）
 *   ① **読むだけ**。1行も書き込まない
 *   ② お店の名前・連絡先・鍵や合言葉の値を1文字も返さない
 *   ③ 本物の金額を返さない（返してよいのは件数・○×・架空のお店の金額だけ）
 *   この3つに当てはまらないものは、ここに**足さないこと**。
 */

export type CheckWindow = {
  /** 住所 */
  path: string;
  /** 何を確かめる窓口か（1行） */
  what: string;
  /** 仕上げチェック表のどの項目につながるか */
  check: string;
};

export const CHECK_WINDOWS: CheckWindow[] = [
  {
    path: "/api/version",
    what: "いま本番に出ている版の合言葉（ページの <meta name=\"x-build\"> と見比べる）",
    check: "共通",
  },
  {
    path: "/api/keiri/selfcheck",
    what: "前の月の締めが人の手なしで出たか（金額は伏せて○×だけ）",
    check: "f1-5・f1-2",
  },
  {
    path: "/api/keiri/scopecheck",
    what: "サーバー側で読むとき、よそのお店のものが混ざらないか（件数だけ）",
    check: "f3-4",
  },
  {
    path: "/api/keiri/shelves",
    what: "倉庫の貼り紙（棚を足す1枚）が流れたか",
    check: "f1-4・f1-5・f1-6",
  },
  {
    path: "/api/keiri/firstmonth",
    what: "まっさらなお店に日報1枚で、今月の利益と今の現金が出るか（架空のお店の数字）",
    check: "f3-3",
  },
];

/** 窓口の住所だけ（robots.txt が読む） */
export const CHECK_WINDOW_PATHS: string[] = CHECK_WINDOWS.map((w) => w.path);

/**
 * 窓口の返事に必ず付ける札。
 * ・保存させない（古い中身で「出ていない」と誤報が出ないように）
 * ・検索結果には載せない（読んでよいが、載せる物ではない）
 */
export const CHECK_WINDOW_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
};
