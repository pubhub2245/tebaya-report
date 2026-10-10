/**
 * テストの店の様子を、窓口の返事の形に組み立てる（読む側・作る側で同じ形にするため）。
 *
 * ★ここから出るのは **件数と○×と架空の店の名前だけ**です。
 *   合言葉・鍵の値・お店の番号・本物の金額は1文字も出しません。
 */
import { NextResponse } from "next/server";

import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import {
  TEST_SHOP,
  TRIAL_LIMIT_MS,
  TRIAL_CREATE_PATH,
  elapsedLabel,
  separationOk,
  trialSummary,
  type TrialCreatable,
  type TrialState,
} from "@/lib/keiri/tenantTrial";
import { readBothWays } from "@/lib/keiri/tenantTrialServer";

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
export function jsonWindow(body: unknown): NextResponse {
  return NextResponse.json(stampCheckWindow(body), { status: 200, headers: CHECK_WINDOW_HEADERS });
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
  /** いまここで1軒 作れるか（鍵が使えるか）。省略＝確かめていない */
  creatable?: TrialCreatable;
}): Promise<NextResponse> {
  const { state, tenantId, elapsedMs, ran, via } = params;
  const creatable: TrialCreatable = params.creatable ?? "unknown";
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
    summary: trialSummary({ state, separated, elapsedMs, creatable }),
    // いまここで作れるか（送る住所も一緒に出す。読む住所に POST すると 405 になるため）
    creatable,
    createPath: TRIAL_CREATE_PATH,
    remaining:
      "手順4・5（出店場所・商品・スタッフ）はここでは入れていません。" +
      "出店場所・担当者・商品の読みは、もうお店で絞ってあります（2026-10-08・kp242）。" +
      "のこっているのは、シフトの棚に「どの店か」の欄そのものが無いことだけで、" +
      "/keiri/sql の貼り紙（⑤）を1回 流すと埋まります",
    note:
      "テストの店は架空の1軒です（本物の軒数に数えないこと）。" +
      "合言葉・鍵の値・お店の番号は1文字も返しません。本物の金額も返しません",
  });
}
