import { NextResponse } from "next/server";

import {
  CHECK_WINDOWS,
  CHECK_WINDOW_HEADERS,
  CLOSED_ON_PURPOSE,
  VERDICT_VALID_MINUTES,
  freshWindowUrl,
  stampCheckWindow,
} from "@/lib/keiri/checkWindow";
import { PUBLIC_SITE_URL } from "@/lib/keiri/siteUrl";
import { BUILD_STAMP } from "@/lib/buildStamp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/windows
 *
 * 「外から確かめる窓口が、ぜんぶで何本あって、どれが何を測るのか」を
 * **1回 開くだけで分かる**ようにする、窓口の案内所（2026-11-09 18:34 B・共通）。
 *
 * ■ なぜ要るか（同じ取りこぼしが3回 起きている）
 *   ・2026-10-06 … robots.txt が窓口をことわっていて、検査役が1本も開けなかった
 *   ・2026-10-10 … 新しい窓口（/api/keiri/setuptodo）を一覧に足し忘れ、本番は正しいのに開けなかった
 *   ・2026-11-09 … お申し込みの数の窓口だけ、ことわられていて1文字も読めなかった
 *   どれも**「窓口はあるのに、外から確かめる人がそれを知らない／開けない」**でした。
 *   窓口の一覧はコードの中（CHECK_WINDOWS）にしかなく、**外から読む道がありませんでした。**
 *   ＝ 検査役は「何を開けば合否が付くか」を人づてに聞くしかなく、
 *   1本 抜けても気づけません（上の3回がそれです）。
 *
 * ■ これで何ができるか
 *   この1本を開くと、窓口の住所・何を測るか・仕上げチェック表のどの項目につながるかが
 *   ぜんぶ並びます。**抜けていれば、ここに出ていないことで分かります。**
 *   仕上げチェック表の項目ごとにまとめた表（byCheck）も付けるので、
 *   「f1-4 を測るには何を開けばいいか」が、聞かずに分かります。
 *
 * ★ 読むだけです。1行も書き込まず、誰にも知らせません。
 * ★ 返すのは**住所と説明だけ**です。お店の名前・金額・鍵・合言葉の値は1文字も返しません。
 * ★ 手羽屋の日報・シフト・レジ・LINE・お金の計算には一切さわっていません。
 */
export async function GET() {
  const base = PUBLIC_SITE_URL.replace(/\/$/, "");

  /**
   * ★住所そのものに「いまの時刻」を付けて渡す（2026-11-11・B）。
   *
   *   これまで `how` に「?v=いまの時刻 を付けて開いてください」と**書いて**いましたが、
   *   並んでいる `url` は素の住所でした。読む人（検査役・同期役）は当然 `url` を
   *   そのまま開くので、**読む道具が手元にためた古い答え**が返ります。
   *   11/9・11/10・11/11 と3日つづけて「本番は正しいのに古い答えに見える」が起き、
   *   そのたびに最優先の仕事が1つ立ちました（＝仕上げの合否が付けられない）。
   *   書いて頼むのをやめ、**渡す住所の側に札を入れます。**
   *   この案内所は毎回その場で作る（force-dynamic）ので、開くたびに札が変わります。
   */
  const v = Date.now().toString();
  const fresh = (path: string): string => freshWindowUrl(base, path, v);

  // 仕上げチェック表の項目ごとに、どの窓口で測れるかをまとめる（「・」区切りで書いてある）
  const byCheck: Record<string, string[]> = {};
  for (const w of CHECK_WINDOWS) {
    for (const id of w.check.split("・").map((s) => s.trim())) {
      if (!id) continue;
      (byCheck[id] ??= []).push(w.path);
    }
  }

  return NextResponse.json(
    stampCheckWindow({
      count: CHECK_WINDOWS.length,
      windows: CHECK_WINDOWS.map((w) => ({
        path: w.path,
        // ★そのまま開いてよい住所（古い答えが返らないよう、いまの時刻が入っています）
        url: fresh(w.path),
        // 札の無い素の住所（控え。ふだんは url を開いてください）
        plainUrl: `${base}${w.path}`,
        what: w.what,
        check: w.check,
      })),
      byCheck,
      // ★仕上げチェック表の項目ごとに「そのまま開ける住所」（札つき）
      byCheckUrls: Object.fromEntries(
        Object.entries(byCheck).map(([id, paths]) => [id, paths.map((p) => fresh(p))]),
      ),
      how:
        "**並んでいる url をそのまま開いてください。もう ?v=（いまの時刻）が入っています**" +
        "（素の住所＝plainUrl を開くと、読む道具がためた古い答えが返ることがあります。" +
        "11/9・11/10・11/11 に実際に起き、そのたびに『本番が古い』という誤報になりました）。" +
        `どの窓口の答えにも verdictValidUntil（答えを作った時刻＋${VERDICT_VALID_MINUTES}分）が入っていて、` +
        "それを過ぎた答えで合否を付けてはいけません",
      /**
       * ★**版がちがって見えたときの読み方**（2026-11-13・B）。
       *   11/9・11/10・11/11・11/13 と4回、「窓口のいくつかだけ古い版の答えを返す」が
       *   行き止まりとして立ちましたが、**4回とも本番は古くありませんでした**
       *   （11/13 は素の住所を6本 測って、ぜんぶ その場の時刻・同じ版でした）。
       *   窓口は全部 同じ1つの本番の上で動くので、**版はどの窓口も必ず同じ**です。
       */
      productionBuild: BUILD_STAMP,
      ifBuildDiffers:
        "**いま本番に出ている版は productionBuild です。窓口は全部 この同じ本番の上で動くので、" +
        "どの窓口を開いても build は同じになります。**" +
        "いくつかの窓口だけ別の版・古い answeredAt に見えるときは、" +
        "**本番の一部だけが古いのではありません**（そういう形にはなりません）。" +
        "**それを開いた道具が、前の答えを手元にためている**だけです。" +
        "直すところはサーバー側にないので、行き止まりとして残さず、" +
        "上の url（?v= 付き）で開き直してください",
      rule:
        "ここに並ぶ窓口は、どれも ①読むだけ ②お店の名前・連絡先・鍵の値を返さない " +
        "③本物の金額を返さない の3つを満たします（lib/keiri/checkWindow.ts の決まり）",
      missing:
        "**窓口を作ったのに、ここに出ていなければ外からは開けません**" +
        "（robots.txt はこの一覧から作られます）。" +
        "同じ取りこぼしが 10/06・10/10・11/09 の3回 起きたので、" +
        "tests/keiriCheckWindow.test.ts が「札を付けて返す窓口は、ぜんぶ一覧に入っている」を見張っています",
      /**
       * ★**わざと外から読めないままにしている住所**（2026-11-10・B）。
       *   ここに出ている住所は「開かないのが正しい状態」です。読めないことを
       *   行き止まりとして報告しなくてよいように、代わりに開く窓口まで書いてあります。
       *   （11/10 18:0x に A が /api/keiri/month で1回 立てています）
       */
      closedOnPurpose: CLOSED_ON_PURPOSE.map((c) => ({
        path: c.path,
        url: `${base}${c.path}`,
        why: c.why,
        insteadOpen: c.insteadOpen.map((p) => fresh(p)),
      })),
      closedOnPurposeNote:
        "**closedOnPurpose に出ている住所が外から読めないのは、直すべき不具合ではありません。**" +
        "合言葉が要る／本物の金額を返すので、外から読んでよい窓口の決まりに当たります。" +
        "同じことを測りたいときは insteadOpen の窓口を開いてください",
      note:
        "合否は、この案内所では付けません（住所を並べるだけです）。" +
        "それぞれの窓口を開いて、その答えで付けてください",
      check: "共通",
    }),
    { status: 200, headers: CHECK_WINDOW_HEADERS },
  );
}
