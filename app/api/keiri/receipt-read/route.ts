import { NextResponse, type NextRequest } from "next/server";

import { buildReceiptIntake, sumByAccount } from "@/lib/keiri/receiptIntake";
import { templateFor } from "@/lib/keiri/index";
import { readReceipt, type ReceiptMedia } from "@/lib/receiptOcr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * レシートの写真1枚を、**科目の付いた経費の行**にして返す窓口（kp229・f1-6）。
 *
 * ■ これは何のためにあるか（やさしい説明）
 *   「レシートの写真から、金額と中身を取り込んで仕分けできるか」を
 *   端から端まで1回で通せるようにしたものです。
 *   読み取り（写真→品名と金額）と税込への直しは日報の入力でも動いていますが、
 *   そのあとの**科目を当てるところ**までつながった道がどこにも無く、
 *   「取り込みと仕分けができる」と書いてあるのに一度も通っていませんでした。
 *
 * ■ 守っていること
 *   ・**1行も保存しません**（倉庫にも写真の置き場にも触りません）。
 *     お試しで写真を入れても、手羽屋の日報・経費は1行も増えません。
 *   ・読み取りの指示文は lib/receiptOcr.ts の1か所のまま（日報の入力と同じ）。
 *   ・科目の当て方は経理画面と同じ（lib/keiri/classify.ts）。
 *   ・金額を勝手に作りません。支払合計と合わない差は直さず「要確認」で返します。
 *   ・手羽屋が毎日使う画面（日報・シフト・レジ・LINE）には触れていません。
 *
 * GET  … 使える状態かどうかだけを返す（**写真を読む処理は呼びません**＝お金もかかりません）
 * POST … { image: "data:image/jpeg;base64,…" , mediaType?: "image/jpeg" } を渡すと
 *         科目つきの経費の行と、検算の結果を返す
 */

/** 受け取る写真の大きさの上限（置き場と同じ1枚5MBに合わせる。base64 は約1.37倍になる） */
const MAX_IMAGE_CHARS = Math.ceil(5 * 1024 * 1024 * 1.4);

const ALLOWED: ReceiptMedia[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function GET() {
  const keyConfigured = Boolean((process.env.ANTHROPIC_API_KEY ?? "").trim());
  return NextResponse.json({
    ready: keyConfigured,
    note: keyConfigured
      ? "レシートの写真を1枚 送ると、科目の付いた経費の行にして返します。保存はしません"
      : "写真を読む鍵が入っていないため、いまは読み取れません（設定の値を入れてください）",
    howto:
      'POST に {"image":"data:image/jpeg;base64,…","mediaType":"image/jpeg"} を渡してください。' +
      "この GET では写真を読む処理を呼びません（確かめるだけでお金はかかりません）",
    saves: "何も保存しません（倉庫・写真の置き場に1行も書きません）",
    maxImageBytes: 5 * 1024 * 1024,
    accepts: ALLOWED,
  });
}

export async function POST(req: NextRequest) {
  let body: { image?: unknown; mediaType?: unknown; businessCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "写真が入っていません" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  if (!image) {
    return NextResponse.json({ error: "写真が入っていません" }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json(
      { error: "写真が大きすぎます（1枚5MBまで）" },
      { status: 413 },
    );
  }

  const asked = String(body.mediaType ?? "image/jpeg") as ReceiptMedia;
  const mediaType: ReceiptMedia = ALLOWED.includes(asked) ? asked : "image/jpeg";
  const businessCode = typeof body.businessCode === "string" ? body.businessCode : "tebaya";

  try {
    const read = await readReceipt(image, mediaType);
    const intake = buildReceiptIntake({
      items: read.items,
      check: read.check,
      total: read.total,
      template: templateFor(businessCode),
    });

    return NextResponse.json({
      ok: intake.ok,
      rows: intake.rows,
      byAccount: sumByAccount(intake),
      total: intake.total,
      rowsTotal: intake.rowsTotal,
      tax: read.tax,
      taxAdjusted: intake.taxAdjusted,
      totalMatched: intake.totalMatched,
      unmatchedCount: intake.unmatchedCount,
      needsHuman: intake.needsHuman,
      message: intake.message,
      saved: false,
      note: "1行も保存していません（倉庫・写真の置き場に書いていません）",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "読み取りに失敗しました";
    console.error("keiri receipt-read error", message);
    return NextResponse.json(
      { error: "写真を読み取れませんでした", detail: message, saved: false },
      { status: 502 },
    );
  }
}
