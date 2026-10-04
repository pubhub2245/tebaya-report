import { NextRequest, NextResponse } from "next/server";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import {
  APPLY_BLANK_MARK,
  APPLY_TEST_NOTICE,
  keiriApplyNotificationText,
  normalizeKeiriApplication,
  type KeiriApplication,
} from "@/lib/keiri/apply";
import { KEIRI_COMPANY } from "@/lib/keiri/legal";
import { applicationIsReachable } from "@/lib/keiri/notifyHealth";
import {
  describeLineFailure,
  sendLineGroupMessageDetailed,
  type LineSendResult,
} from "@/lib/line/sendMessage";
import { serviceClientOrNull, serverClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 経理パッケージの「お申し込み」の受け口。
 *
 * ■ 何をするか（2つだけ）
 *   ① スタッフの LINE グループへ「申し込みが1件入りました」と知らせる
 *   ② 倉庫（keiri_applications）に1行控える
 *   どちらか片方でも通れば、申し込みは受け取れたものとして「ありがとうございます」を返す。
 *   両方だめだったときだけ、画面に「メールでご連絡ください」と正直に出す
 *   （黙って消える申し込みを作らないため）。
 *
 * ■ ②の表がまだ無くても動く
 *   keiri_applications は supabase/migrations/keiri_applications.sql で作る。
 *   まだ流していない間は、②は静かに失敗して①だけで受け取る。
 *   表ができたら、何も直さずに②も効き始める。
 *
 * ■ 手羽屋の機能には一切さわっていない
 *   日報・シフト・レジ・お金の計算は1行も変えていない。
 *   LINE も「すでにある送り方（sendLineGroupMessage）を呼ぶだけ」で、送り方そのものは変えていない。
 */

const TABLE = "keiri_applications";


/** 決まりに断られたか（権利が無い・表が無いのとは直し方が違う） */
function rejectedByPolicy(message: string | null | undefined): boolean {
  return /row-level security/i.test(String(message ?? ""));
}

/**
 * 倉庫に1行控える。表が無い・鍵が無いなど、どんな理由で失敗しても false を返すだけ。
 *
 * ★test が true のときは控えを残さず null を返す（2026-10-04・kp228）。
 */
async function saveApplication(a: KeiriApplication, test = false): Promise<boolean | null> {
  // ★試しの1通は控えを残さない（2026-10-04・kp228 を本番で1回通して分かったこと）。
  //   棚の受け入れの決まり（keiri_applications_insert_only.sql）は
  //   **status が 'new' の行しか通しません**。試しの行を残すには決まりを緩める必要があり、
  //   そうすると誰でも好きな status の行を入れられるようになります。
  //   試しの1通で確かめたいのは「知らせが人に届くか」なので、控えは残さずに
  //   「残していない」と正直に返します（本物のデータに混ぜないため）。
  if (test) return null;
  try {
    // 申し込みには連絡先が入るので、ブラウザから読めない合鍵があるときはそちらを使う。
    // 無ければ通常の鍵で入れる（鍵が壊れていても全体が止まらない作り／CLAUDE.md 4-10）。
    const db = serviceClientOrNull() ?? serverClient();
    const row = {
      shop_name: a.shop_name,
      contact_name: a.contact_name,
      email: a.email,
      phone: a.phone,
      note: a.note,
      // ★source は必ず "form"。棚の受け入れの決まりが form（と paid_pending）だけを
      //   通すので、ここを変えると控えが1行も残らなくなります（2026-10-04 実測で確認）。
      source: "form",
      status: "new",
    };
    const { error } = await db.from(TABLE).insert(row);
    if (!error) return true;

    // ★決まりに断られ、かつ空の欄があるときだけ、印を入れてもう1回だけ入れる（f2-1）。
    //   申し込みが黙って消えるのを防ぐための、最後の1回です。
    const hasBlank = a.contact_name === "" || a.email === "";
    if (rejectedByPolicy(error.message) && hasBlank) {
      const { error: retryError } = await db.from(TABLE).insert({
        ...row,
        contact_name: a.contact_name === "" ? APPLY_BLANK_MARK : a.contact_name,
        email: a.email === "" ? APPLY_BLANK_MARK : a.email,
      });
      if (!retryError) {
        console.warn(
          "[経理お申し込み] 空の欄に「（未記入）」を入れて控えを残しました" +
            "（supabase/migrations/keiri_applications_optional_contact.sql を流すと、この回り道は不要になります）",
        );
        return true;
      }
      console.error(`[経理お申し込み] 控えを残せませんでした: ${retryError.message}`);
      return false;
    }
    console.error(`[経理お申し込み] 控えを残せませんでした: ${error.message}`);
    return false;
  } catch (e) {
    console.error("[経理お申し込み] 控えを残せませんでした", e);
    return false;
  }
}

/**
 * LINE で知らせる。失敗しても例外を外に出さず、**なぜ失敗したか**まで返す。
 *
 * ★2026-09-28（kp198）：これまでは true/false だけで、理由は
 *   サーバーのログにしか出ていませんでした。9/28 13:46 に本番で
 *   「控えは残ったのに知らせだけ届かない」が起きたとき、外からは理由が読めず
 *   「今月の数を使い切ったのだろう」と見立てるしかありませんでした
 *   （実際には5通 残っていたので、別の理由です）。
 *   理由が分からないと直せないので、返事に短い印として載せます。
 *   **合言葉も送り先のIDも載せません。**
 */
async function notifyApplication(
  a: KeiriApplication,
  test = false,
): Promise<LineSendResult> {
  try {
    return await sendLineGroupMessageDetailed(
      keiriApplyNotificationText({ application: a, priceLabel: priceLabel(), test }),
    );
  } catch (e) {
    console.error("[経理お申し込み] 知らせを送れませんでした", e);
    return { ok: false, failure: "push_failed", status: null };
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, errors: ["入力の中身を読み取れませんでした。もう一度お試しください。"] },
      { status: 400 },
    );
  }

  /**
   * 試しの1通か（2026-10-04・kp228）。
   *
   * ■ なぜ要るか
   *   本物のお申し込みが0件のあいだ、知らせの道は**一度も通っていません**。
   *   いちばん高くつくのは、最初の1件が来た日に知らせが飛ばず、
   *   誰も気づかないまま置かれることです。本物を待たずに1回通せるようにします。
   *
   * ■ 守ること
   *   ・知らせの本文には必ず「これはテストです」が入る（文を作る1か所で付けている）
   *   ・控えは残さない（棚の決まりは status が 'new' の行しか通さないので、
   *     試しの行を残そうとすると決まりを緩めることになる）。本物の件数には1件も混ざりません
   *   ・それ以外の道（入力の確かめ方・送り方・控えの残し方）は本物とまったく同じ
   */
  const test = (body as Record<string, unknown> | null)?.test === true;

  const parsed = normalizeKeiriApplication((body ?? {}) as Record<string, unknown>);

  if (!parsed.ok) {
    return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });
  }

  // 機械の書き込み。画面には成功と同じ顔を見せ、誰にも知らせない
  if (parsed.spam) return NextResponse.json({ ok: true });

  // 知らせと控えは同時に走らせる。片方が遅くても、もう片方は待たされない
  const [notifyResult, savedResult] = await Promise.all([
    notifyApplication(parsed.value, test),
    saveApplication(parsed.value, test),
  ]);
  // null＝試しの1通なので控えを残していない（「失敗した」ではない）
  const saved = savedResult === true;
  const notified = notifyResult.ok;
  // 失敗の理由（人の言葉・1行）。届いたときは null
  const notifyNote = notifyResult.ok
    ? null
    : describeLineFailure(notifyResult.failure, notifyResult.status);
  if (notifyNote) console.error(`[経理お申し込み] 知らせが届きませんでした：${notifyNote}`);

  if (!notified && !saved) {
    // どこにも残らなかった。ここで「受け付けました」と返すのが一番まずい。
    // ★ reason: "delivery" を付けて返す（2026-09-19・kp60）。
    //   入力の間違い（400）と、届けられなかった（503）を画面が言い分けられるようにするため。
    //   画面はこれを見て「メールでそのまま送る」ボタンを出す。
    console.error("[経理お申し込み] 知らせも控えも失敗しました");
    return NextResponse.json(
      {
        ok: false,
        reason: "delivery",
        errors: [
          `いま受け付けができませんでした。お手数ですが ${KEIRI_COMPANY.email} までご連絡ください。`,
        ],
      },
      { status: 503 },
    );
  }

  // ★どの道で受け取れたかを画面に返す（2026-09-19・kp69）。
  //   いちばん危ないのは「LINE には飛んだが、倉庫に控えが残らなかった」とき。
  //   画面は「受け付けました」と出るが、**あとから一覧で見返せる形がどこにも無い**。
  //   LINE のグループは司令室からは読めないので、気づかないまま
  //   「申込0件」と書き続けることになる（訪問 kp54・控え kp57 と同じ形）。
  //   そこで saved を返し、残っていないときだけ画面に
  //   「念のための控えメール」を1つ出す（送らなくても申し込みは生きている）。
  // ★「残った」ではなく「**人が気づけるか**」で見る（2026-09-24・B）。
  //   LINE が飛ばず、控えは残ったが読み返せない（kp55）ときは、
  //   受け付けた顔をしながら誰にも届いていない。
  //   その1件を取りこぼさないよう、画面に「控えのメール」を出す。
  const recordReadable = serviceClientOrNull() !== null;
  const reachable = applicationIsReachable({ notified, saved, recordReadable });

  // ★notifyNote は「なぜ知らせが届かなかったか」の1行（2026-09-28・kp198）。
  //   届いたときは null。合言葉・送り先のIDは入りません。
  // ★test のときだけ、外から確かめられるように印を返す（本物の返事は1文字も変わらない）
  return test
    ? NextResponse.json({
        ok: true,
        test: true,
        notified,
        saved: savedResult,
        savedNote:
          "試しの1通なので、控えは残していません（棚の決まりは本物の申し込みだけを通します）",
        reachable,
        notifyNote,
        notice: APPLY_TEST_NOTICE,
      })
    : NextResponse.json({ ok: true, notified, saved, reachable, notifyNote });
}
