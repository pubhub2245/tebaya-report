import { NextResponse, type NextRequest } from "next/server";

import {
  isAllowedPhotoPath,
  receiptObjectPath,
  tenantOfPhotoPath,
} from "@/lib/receiptViewUrl";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";
import { normalizeTenantScope } from "@/lib/tenantScope";
import { noStoreFetch, serviceClientOrNull } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/receipt-photo?p=<置き場の中の道>
 *
 * レシート写真を**こちら側の窓口ごしに**見せる所（f3-4・2026-10-26）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   レシート写真の置き場（receipts）は **「公開」の設定**になっています。
 *   住所さえ知っていれば、合言葉なしで だれでもその1枚を開けます
 *   （一覧は閉まっていますが、1枚ずつ開く道が開いたまま）。
 *   レシート写真はその店の経理そのものなので、お店が2軒になる前に、
 *   **置き場を非公開にして、見せるのはこの窓口だけ**にします。
 *   棚（テーブル）を「窓口ごしに読む」形に寄せてきたのと同じ形です。
 *
 * ■ いまの順番（ここが大事）
 *   ① 画面が窓口ごしに見る（→ lib/receiptViewUrl.ts）… この回で入れました
 *   ② 窓口が**期限つきの住所**（60秒だけ有効）を出す ………… この紙
 *   ③ 置き場を**非公開**にする ……………………………… **サーバー側の鍵が直ってから**（kp241）
 *   鍵が無いと期限つきの住所を作れないので、③を先にすると写真が映らなくなります。
 *   そのため鍵が無いあいだは、これまでどおり**公開の住所から読んで そのまま返します**
 *   （見え方は今までと1つも変わりません）。
 *
 * ■ 守っていること
 *   ・**1行も書き込みません**（倉庫・置き場ともに読むだけ）。
 *   ・返すのは写真1枚だけ。鍵・合言葉・環境変数の値は1文字も返しません。
 *   ・置き場の外へ出る道（`..` など）は受け取りません。
 *   ・手羽屋が毎日使う画面（日報・シフト・レジ・LINE）の中身は変えていません。
 */

/** 期限つきの住所が生きている時間（秒） */
const SIGN_SECONDS = 60;

/** 読み込んでよい写真の大きさの上限（置き場と同じ1枚5MB） */
const MAX_BYTES = 5 * 1024 * 1024;

function deny(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const asked = req.nextUrl.searchParams.get("p") ?? "";
  const path = receiptObjectPath(asked);
  if (!path || !isAllowedPhotoPath(path)) {
    return deny("写真の場所が正しくありません", 400);
  }

  // ■ どのお店の写真か
  //   道が `t/<お店の番号>/…` ならそのお店の写真、そうでなければ手羽屋（印が空）。
  //   断るのは「**よその店だとはっきり名乗ったとき**」だけにします
  //   （→ lib/tebayaOnlyApi.ts と同じ形。古い画面がそのまま開かれていても止まらないため）。
  //   ★入室（ログイン）の仕組みがまだ無いので、名乗りが本当かどうかは確かめられません。
  //     それでも「見せる道が1本だけ」になるので、入室ができた日にここ1か所で絞れます。
  const owner = tenantOfPhotoPath(path);
  const claimed = normalizeTenantScope(req.nextUrl.searchParams.get("t"));
  if (owner !== claimed) {
    // 名乗ったお店と、写真が入っているフォルダのお店が違う。
    // 手羽屋（名乗り無し＝印が空）は、今までどおりフォルダの分かれていない写真が見られます。
    return deny("この写真はよそのお店のものです", 403);
  }

  // ① サーバー側の鍵があるとき … 期限つきの住所を作って、そこへ案内する
  const service = serviceClientOrNull({ fresh: true });
  if (service) {
    const { data, error } = await service.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(path, SIGN_SECONDS);
    if (data?.signedUrl) {
      return NextResponse.redirect(data.signedUrl, {
        status: 302,
        headers: { "Cache-Control": "private, max-age=30" },
      });
    }
    const message = String((error as { message?: string } | null)?.message ?? "");
    if (/not found|does not exist/i.test(message)) {
      return deny("その写真は置き場にありません", 404);
    }
    // 鍵があるのに作れなかったときは、下の読み方を試す（映らないより良い）
  }

  // ② 鍵が無い（または作れなかった）とき … 公開の住所から読んで、そのまま返す
  //    置き場が非公開になっていれば、ここは読めません。その場合は正直に断ります。
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return deny("置き場の場所が設定されていません", 503);

  const publicUrl = `${base}/storage/v1/object/public/${RECEIPT_BUCKET}/${path
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;

  let res: Response;
  try {
    res = await noStoreFetch(publicUrl);
  } catch {
    return deny("写真を読み込めませんでした（通信に失敗しました）", 502);
  }
  if (!res.ok) {
    if (res.status === 404) return deny("その写真は置き場にありません", 404);
    return deny(
      "いまは写真を出せません（置き場が非公開で、期限つきの住所を作る鍵がまだ入っていません）",
      503,
    );
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return deny("写真が大きすぎます", 413);
  }
  const type = res.headers.get("content-type") ?? "image/jpeg";
  if (!/^image\//i.test(type)) {
    return deny("写真ではないものが入っています", 415);
  }
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=30",
      "X-Receipt-Photo-Source": service ? "signed-fallback-public" : "public",
    },
  });
}
