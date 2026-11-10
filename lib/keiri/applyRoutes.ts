/**
 * お申し込みが入ってくる「道」の一覧（2026-10-04・kp236・f2-3）。
 *
 * ■ なぜ1枚にまとめたか
 *   お申し込みの入口は、紙・見せる1枚・お試し・アプリ・倉庫の表紙・その場で代わりに登録 の
 *   6つあります。どれも合言葉（?from=◯◯）を付けていますが、**どこにも「これで全部」と
 *   書いた場所がありません**でした。そのため
 *     ・道を1つ足したときに、合言葉を付け忘れても誰も気づかない
 *     ・「どの道から来たかが残るか」を確かめようにも、確かめる対象が分からない
 *   という形になっていました（f2-3 が合格にできなかった理由のひとつ）。
 *
 * ■ 守ること
 *   ① **合言葉そのものは、それぞれの入口のファイルが正。** ここは**写しません**。
 *      読み込んで並べるだけなので、入口を直せばここも自動でそろいます。
 *   ② 道を1本足したら、ここにも1行足す。tests/keiriApplyRoutes.test.ts が
 *      「全部の道に別々の合言葉が付いているか」を見張ります。
 *   ③ 倉庫の「どこから来たか」の欄（source）は 'form' のままにします。
 *      棚の受け入れの決まりが 'form' と 'paid_pending' しか通さないためで、
 *      道そのものは**ひとことの中の1行**（［どこから：card］）として残ります。
 *      ここを変えるには棚の決まりを書き換える必要があり、**それは別の一手**です。
 */

import { CARD_FROM_KEY } from "./card";
import { README_FROM_KEY } from "./readmeLink";
import { SHOW_FROM_KEY, ONSITE_FROM_KEY } from "./show";
import { APP_FROM_KEY } from "./appLink";
import { TRIAL_FROM_KEY } from "./trial";
import { campaignNoteMark, keiriApplyCampaign } from "./apply";

/** その入口が本当に画面に出ているかを確かめる場所（f2-3・2026-11-10） */
export type ApplyRouteSource = {
  /** 倉庫の中のファイル（このファイルが無くなったら試験が落ちる） */
  file: string;
  /** そのファイルの中に必ず入っている文字（全部そろって初めて「出ている」） */
  must: readonly string[];
};

/** 道1本ぶん */
export type ApplyRoute = {
  /** 合言葉（?from=◯◯ の値） */
  key: string;
  /** 画面と報告に出す呼び名 */
  label: string;
  /** どこに置いてある入口か（人が探せるように） */
  where: string;
  /**
   * その入口が **本当にいま画面に出ているか** を確かめる場所（f2-3・2026-11-10）。
   *
   * ■ なぜ足したか
   *   2026-11-09 の作り変え（手羽屋の日報を写真だけにする）で、
   *   ホームに出していた「アプリ」の入口が外されました。道そのものは
   *   管理者ページに残っていたので申し込みは通りますが、
   *   **この一覧の『どこに置いてあるか』だけが古いまま**になっていました。
   *   ＝「これで全部」と書いた紙が、黙って嘘になる形でした。
   *   そこで置き場所をここで名指しし、tests/keiriApplyRoutes.test.ts が
   *   **本当にそのファイルに入っているか**を毎回 読んで確かめます。
   *   入口を外したときは、ここも直さないと試験が落ちます。
   */
  renderedIn: readonly ApplyRouteSource[];
};

/**
 * お申し込みの道（全部）。
 * ★合言葉は、それぞれの入口のファイルから読み込んでいます（ここで打ち直していません）。
 */
export const APPLY_ROUTES: readonly ApplyRoute[] = [
  {
    key: CARD_FROM_KEY,
    label: "紙の札（QR）",
    where: "/keiri/card で刷る紙のQR",
    renderedIn: [{ file: "app/keiri/card/page.tsx", must: ["CARD_TAKEAWAY_URL"] }],
  },
  {
    key: SHOW_FROM_KEY,
    label: "見せる1枚",
    where: "/keiri/show の［申し込む］",
    renderedIn: [{ file: "app/keiri/show/page.tsx", must: ["SHOW_APPLY_HREF"] }],
  },
  {
    key: TRIAL_FROM_KEY,
    label: "お試し",
    where: "/keiri/demo の［このまま申し込む］",
    renderedIn: [{ file: "app/keiri/demo/page.tsx", must: ["TRIAL_APPLY_HREF"] }],
  },
  {
    key: APP_FROM_KEY,
    label: "アプリ",
    // 2026-11-09 の作り変えでホームからは外した（じゅん：ホームはボタン2つだけ）。
    // 道は管理者ページに残っている＝どの道から来たかは今までどおり残る。
    where: "日報アプリの管理者ページ（/admin）のご案内の1枚",
    renderedIn: [
      { file: "app/components/KeiriCaseLink.tsx", must: ["APP_CASE_HREF"] },
      { file: "app/admin/page.tsx", must: ["KeiriCaseLink"] },
    ],
  },
  {
    key: README_FROM_KEY,
    label: "倉庫の表紙",
    where: "GitHub の README",
    renderedIn: [{ file: "README.md", must: [`?from=${README_FROM_KEY}`] }],
  },
  {
    key: ONSITE_FROM_KEY,
    label: "その場で代わりに登録",
    where: "/keiri/show の［この場で代わりに登録する］",
    renderedIn: [
      { file: "app/keiri/show/OnsiteApplyForm.tsx", must: ["ONSITE_FROM_KEY"] },
      { file: "app/keiri/show/page.tsx", must: ["OnsiteApplyForm"] },
    ],
  },
] as const;

/** 合言葉 → 道（知らない合言葉なら null） */
export function applyRouteOf(key: string | null | undefined): ApplyRoute | null {
  const k = String(key ?? "").trim();
  if (k === "") return null;
  return APPLY_ROUTES.find((r) => r.key === k) ?? null;
}

/** 道の呼び名（知らない合言葉はそのまま返す。「ほかの道」と決めつけない） */
export function applyRouteLabel(key: string | null | undefined): string {
  const k = String(key ?? "").trim();
  if (k === "") return "どこから来たか分かりません";
  return applyRouteOf(k)?.label ?? k;
}

/**
 * 控えの「ひとこと」から、どの道から来たかを読み戻す。
 *
 * ★控えに残っているのは ［どこから：card］ の1行です。
 *   倉庫の Table Editor で見るときも、この1行が道の答えになります。
 */
export function routeFromNote(note: string | null | undefined): string | null {
  const m = /［どこから：([^］]+)］/.exec(String(note ?? ""));
  if (!m) return null;
  return keiriApplyCampaign(m[1]);
}

/** その道の控えに入るはずの1行（［どこから：card］）。道が無ければ空 */
export function routeNoteMarkFor(key: string | null | undefined): string {
  return campaignNoteMark(keiriApplyCampaign(key));
}
