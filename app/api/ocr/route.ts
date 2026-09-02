/**
 * レシート写真から金額を読み取る窓口（日報の入力から呼ばれる）。
 *
 * ★2026-09 修正：以前は「品物の値段だけ」を拾っていたため、
 *   品物が税抜（本体価格）で書かれているレシートでは
 *   消費税ぶん（8〜10%）が毎回まるごと抜けていました。
 *   いまは「支払合計（税込）」も読み取り、足りない分を品物に割り振ります。
 *
 * ★読み取りの中身（指示文・消費税の割り振り）は `lib/receiptOcr.ts` に置いてあります。
 *   管理者ページの「過去のレシートを読み直す」も同じファイルを使うため、
 *   指示文が2か所に分かれて食い違うことがありません。
 */

import { NextRequest, NextResponse } from "next/server";

import { readReceipt, type ReceiptMedia } from "@/lib/receiptOcr";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();
    if (!image) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }

    const media: ReceiptMedia = (mediaType as ReceiptMedia) || "image/jpeg";
    const result = await readReceipt(image, media);

    // 品物が1つも読み取れなかったとき：文字の中の数字だけを合計金額とみなす（従来どおり）
    if (result.items.length === 0) {
      const digits = result.raw.replace(/[^0-9]/g, "");
      return NextResponse.json({
        amount: digits ? parseInt(digits, 10) : 0,
        raw: result.raw,
      });
    }

    return NextResponse.json({
      items: result.items,
      total: result.total,
      tax: result.tax,
      // 画面が「合計と合っているか」を出すための情報
      check: result.check,
      raw: result.raw,
    });
  } catch (err: any) {
    console.error("OCR error", err);
    return NextResponse.json(
      { error: err?.message || "ocr failed" },
      { status: 500 }
    );
  }
}
