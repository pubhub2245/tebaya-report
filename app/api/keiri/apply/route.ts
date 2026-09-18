import { NextRequest, NextResponse } from "next/server";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import {
  keiriApplyNotificationText,
  normalizeKeiriApplication,
  type KeiriApplication,
} from "@/lib/keiri/apply";
import { KEIRI_COMPANY } from "@/lib/keiri/legal";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";
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

/** 倉庫に1行控える。表が無い・鍵が無いなど、どんな理由で失敗しても false を返すだけ */
async function saveApplication(a: KeiriApplication): Promise<boolean> {
  try {
    // 申し込みには連絡先が入るので、ブラウザから読めない合鍵があるときはそちらを使う。
    // 無ければ通常の鍵で入れる（鍵が壊れていても全体が止まらない作り／CLAUDE.md 4-10）。
    const db = serviceClientOrNull() ?? serverClient();
    const { error } = await db.from(TABLE).insert({
      shop_name: a.shop_name,
      contact_name: a.contact_name,
      email: a.email,
      phone: a.phone,
      note: a.note,
      source: "form",
      status: "new",
    });
    if (error) {
      console.error(`[経理お申し込み] 控えを残せませんでした: ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[経理お申し込み] 控えを残せませんでした", e);
    return false;
  }
}

/** LINE で知らせる。失敗しても false を返すだけ（例外を外に出さない） */
async function notifyApplication(a: KeiriApplication): Promise<boolean> {
  try {
    return await sendLineGroupMessage(
      keiriApplyNotificationText({ application: a, priceLabel: priceLabel() }),
    );
  } catch (e) {
    console.error("[経理お申し込み] 知らせを送れませんでした", e);
    return false;
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

  const parsed = normalizeKeiriApplication((body ?? {}) as Record<string, unknown>);

  if (!parsed.ok) {
    return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });
  }

  // 機械の書き込み。画面には成功と同じ顔を見せ、誰にも知らせない
  if (parsed.spam) return NextResponse.json({ ok: true });

  // 知らせと控えは同時に走らせる。片方が遅くても、もう片方は待たされない
  const [notified, saved] = await Promise.all([
    notifyApplication(parsed.value),
    saveApplication(parsed.value),
  ]);

  if (!notified && !saved) {
    // どこにも残らなかった。ここで「受け付けました」と返すのが一番まずい
    console.error("[経理お申し込み] 知らせも控えも失敗しました");
    return NextResponse.json(
      {
        ok: false,
        errors: [
          `いま受け付けができませんでした。お手数ですが ${KEIRI_COMPANY.email} までご連絡ください。`,
        ],
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
