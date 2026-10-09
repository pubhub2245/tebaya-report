/**
 * テストの店の様子を、窓口の返事の形に組み立てる（読む側・作る側で同じ形にするため）。
 *
 * ★ここから出るのは **件数と○×と架空の店の名前だけ**です。
 *   合言葉・鍵の値・お店の番号・本物の金額は1文字も出しません。
 */
import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS } from "@/lib/keiri/checkWindow";
import {
  TEST_SHOP,
  TRIAL_LIMIT_MS,
  elapsedLabel,
  separationOk,
  trialSummary,
  type TrialState,
} from "@/lib/keiri/tenantTrial";
import { readBothWays } from "@/lib/keiri/tenantTrialServer";

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
export function jsonWindow(body: unknown): NextResponse {
  return NextResponse.json(body, { status: 200, headers: CHECK_WINDOW_HEADERS });
}

/** 確かめられなかった・できなかったときの返事（理由を1行で返すだけ） */
export function cannot(summary: string): NextResponse {
  return jsonWindow({
    shop: TEST_SHOP.name,
    isTestShop: true,
    exists: null,
    summary,
    note: "合言葉・鍵の値は1文字も返しません",
  });
}

export async function describe(params: {
  state: TrialState;
  tenantId: string | null;
  elapsedMs: number | null;
  ran?: string;
  /** どの道で確かめたか。"sheet"＝貼り紙⑥（サーバー側の鍵を使っていない） */
  via?: "sheet" | "key";
}): Promise<NextResponse> {
  const { state, tenantId, elapsedMs, ran, via } = params;
  const read = await readBothWays(tenantId);
  const separated = state.exists ? separationOk(read) : false;

  return jsonWindow({
    shop: TEST_SHOP.name,
    isTestShop: true,
    month: read.month,
    ym: read.ym,
    exists: state.exists,
    createdNow: state.createdNow,
    setupDone: state.active,
    settingsReady: state.settingsReady,
    setupElapsedMs: elapsedMs,
    setupElapsed: elapsedMs === null ? null : elapsedLabel(elapsedMs),
    within30min: elapsedMs === null ? null : elapsedMs <= TRIAL_LIMIT_MS,
    tebaya: read.tebaya,
    testShop: read.testShop,
    separated,
    ...(ran ? { ran } : {}),
    ...(via
      ? {
          via,
          viaNote:
            via === "sheet"
              ? "貼り紙（/keiri/sql）の⑥で作られた店を、経理の設定の行から確かめました。" +
                "サーバー側の鍵は使っていません（鍵が壊れていても出ます）。" +
                "作りと初回設定は貼り紙1枚の中で終わるので、かかる時間は貼る数秒です"
              : "サーバー側の鍵で、お店の棚を直接 読んで確かめました",
        }
      : {}),
    summary: trialSummary({ state, separated, elapsedMs }),
    remaining:
      "手順4・5（出店場所・商品・スタッフ）はここでは入れていません。" +
      "出店場所と担当者の棚は、手羽屋が毎日使う画面がお店で絞らずに読んでいるため、" +
      "先にそちらを絞ってからでないとテストの店のぶんを入れられません",
    note:
      "テストの店は架空の1軒です（本物の軒数に数えないこと）。" +
      "合言葉・鍵の値・お店の番号は1文字も返しません。本物の金額も返しません",
  });
}
