import { NextResponse } from "next/server";

import { summarizeShelves } from "@/lib/keiri/shelves";
import { probeShelfLeak } from "@/lib/keiri/shelfScope";
import { readShelfReports, probeCashCount } from "@/lib/keiri/shelvesProbe";
import { buildSetupTodo } from "@/lib/keiri/setupTodo";
import { describeServerKey } from "@/lib/keiri/serverHealth";
import { photoLockStatus } from "@/lib/keiri/photoLockServer";
import { serviceRoleKeyRepair, serviceRoleKeyStatus } from "@/lib/supabaseServer";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/setuptodo
 *
 * 「じゅんにしかできない、一度きりの手続き」が いま何件のこっているかを、
 * **1回で**確かめる窓口（kp247）。
 *
 * ■ なぜ要るのか（2026-10-10）
 *   のこりの手続きは3つ（貼り紙・金庫を数える・サーバー側の鍵）で、
 *   確かめる窓口も3つに分かれていました。司令室の5本が毎回3か所を見に行くうえ、
 *   **じゅんが開く画面にはどれも出ていない**ので、同じお願いが積み上がります。
 *   ここは「のこり何件・どの順でやると何が前に進むか」だけを返します。
 *   経理の画面（/keiri）のいちばん上に出るのも、同じこの窓口の答えです。
 *
 * ★ 1行も書き込みません。
 * ★ 鍵・合言葉・金額・お店の名前は1文字も返しません（済み／のこり だけ）。
 * ★ 手羽屋の日報・シフト・レジ・LINE には一切触れていません。
 */
export async function GET() {
  /**
   * ★2026-10-28（f3-4）：レシート写真の置き場が「公開」のままかも一緒に見ます。
   *   ここを足さないと、鍵を貼り直した瞬間に「鍵」の行が消え、
   *   **置き場を閉める最後の1タップが、じゅんが見る唯一の一覧から消えます**。
   *   読むだけ（鍵が無ければ、鍵をまったく付けずに置き場をたたいて見分けます）。
   */
  /**
   * ★2026-11-13（f3-4）：いま公開の鍵で「よその店の行」が何行 読めているかも
   *   一緒に数えます。これが じゅんの一覧（/keiri のいちばん上）に出ていないと、
   *   貼り紙のお願いが **これから** の話だけになり、**いま漏れている**ことが
   *   どこにも出ません（いまは /api/keiri/copies だけ）。
   *   聞けなかったときは null にして、今までどおり1文字も増やしません。
   */
  const [reports, cash, photo, leak] = await Promise.all([
    readShelfReports(),
    probeCashCount(),
    photoLockStatus().catch(() => null),
    probeShelfLeak().catch(() => null),
  ]);
  const shelfSummary = summarizeShelves(reports);

  const repair = serviceRoleKeyRepair();
  const key = describeServerKey(serviceRoleKeyStatus(), {
    repaired: repair.repaired,
    broken: repair.broken,
  });

  const todo = buildSetupTodo({
    // ★unknown も渡す（2026-11-07）。渡さないと「確かめられなかった本数」が
    //   「のこり」に混ざり、倉庫が眠っている日に『のこり 9 本』と数えたふりをする
    shelves: {
      done: shelfSummary.done,
      total: shelfSummary.total,
      unknown: shelfSummary.unknown,
    },
    key: { configured: key.configured, usable: key.usable },
    cash: cash.unreadable
      ? null
      : {
          shelfMissing: cash.shelfMissing,
          counted: cash.counted,
          countedInMemo: cash.countedInMemo,
        },
    photo: photo ? { bucketPublic: photo.bucketPublic, keyUsable: photo.keyUsable } : null,
    leak: leak ? { rows: leak.rows, line: leak.line } : null,
  });

  return NextResponse.json(
    stampCheckWindow({
      what:
        "じゅんにしかできない一度きりの手続きが、いま何件のこっているか。" +
        "経理の画面（/keiri）のいちばん上に出るのと同じ答えです",
      ...todo,
      sheets: { shelves: "/keiri/sql", cash: "/keiri", key: "/keiri/key", photo: "/keiri/key" },
      shelfDetail: `${shelfSummary.done}／${shelfSummary.total}`,
      /**
       * ★外から読む人のために、数字そのものも出します（2026-11-13・f3-4）。
       *   中身（名前・金額・お店の番号）は1文字も入りません。
       */
      leak: leak
        ? {
            rows: leak.rows,
            tables: leak.tables,
            measured: leak.measured,
            unknown: leak.unknown,
            cannotLeak: leak.cannotLeak,
            line: leak.line,
            note:
              "公開の鍵（ブラウザに配られている鍵）で『どの店か の印が付いた行』が" +
              "何行 読めるかを、棚ごとに件数だけ数えたものです。行の中身は1文字も読んでいません。" +
              "cannotLeak は『棚そのものが無い／印の欄が無い』棚の数で、**聞けなかったのではなく " +
              "漏れる入れ物がありません**（unknown は本当に聞けなかった数です）。" +
              "棚ごとの内わけと、締める工事が済んだかは /api/keiri/copies で読めます",
          }
        : null,
    }),
    { status: 200, headers: CHECK_WINDOW_HEADERS },
  );
}
