/**
 * 「サーバー側の鍵と、記録の置き場が、本当に生きているか」を言葉に直すだけのファイル。
 *
 * ■ なぜ作ったか（2026-09-19・kp54）
 *   お申し込みフォーム（/keiri/apply）は、申し込みが入ると2つのことをします。
 *   ① スタッフの LINE グループへ知らせる ② 倉庫に1行控える。
 *   ②は **サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）** が使えないと通りません。
 *   ところが②が失敗しても、①が通れば画面は「ありがとうございます」と出ます
 *   （黙って消える申し込みを作らないための、正しい作りです）。
 *   つまり **②だけが静かに死んでいても、外からは分からない** 状態でした。
 *   同じ鍵は「サイトに来た人の数」を数える所（/api/hit）でも使っているので、
 *   ここが死んでいると、見る数字3つのうち「訪問」が永久に0のままになります。
 *
 *   そこで、鍵と置き場の状態を診断（/api/keiri/diagnose）から見えるようにしました。
 *
 * ★ 鍵・合言葉の値そのものは絶対に返しません（設定済み／未設定／壊れている だけ）。
 * ★ ここは通信をしません。調べた結果を受け取って、言葉に直すだけです。
 */

import type { KeyCheck } from "@/lib/supabaseServer";
import type { TableCheck } from "./signupReadiness";

/** サーバー側の鍵の状態。値は含めない */
export type ServerKeyReport = {
  /** 値が入っているか */
  configured: boolean;
  /** そのまま通信に使えるか（全角などが混ざっていないか） */
  usable: boolean;
  /** 人の言葉での説明 */
  note: string;
};

/**
 * 「未設定」と「値が壊れている」を必ず言い分ける。
 * 同じ「使えません」でも、やることが全く違うため（CLAUDE.md 4-10）。
 */
export function describeServerKey(check: KeyCheck): ServerKeyReport {
  if (check.ok) {
    return {
      configured: true,
      usable: true,
      note: "設定されていて、そのまま使えます",
    };
  }
  if (check.reason === "未設定") {
    return {
      configured: false,
      usable: false,
      note:
        "設定されていません。Vercel の環境変数 SUPABASE_SERVICE_ROLE_KEY を登録してください。" +
        "これが無いと、お申し込みの控えと、サイトに来た人の数が記録されません",
    };
  }
  return {
    configured: true,
    usable: false,
    note:
      "値に全角などの使えない文字が入っています。Vercel の環境変数 SUPABASE_SERVICE_ROLE_KEY を貼り直してください。" +
      "これが直るまで、お申し込みの控えと、サイトに来た人の数は記録されません",
  };
}

/** 記録の置き場ひとつぶんの見立て */
export type RecordStoreReport = {
  /** 「記録が残る」と言い切れるか */
  ok: boolean;
  /** 表があって読めるか（＝在るかどうかだけ。書けるかは別の話） */
  readable: boolean;
  /** 人の言葉での説明 */
  note: string;
};

/**
 * 置き場の状態を言葉に直す。
 *
 * ■ ここでいちばん気をつけていること（2026-09-19・kp57 で直した所）
 *   前は「1行読めたら ok」にしていた。ところが **読めることと、書けることは別** で、
 *   お申し込みの控え（keiri_applications）は
 *   「読むと0件が返ってくる（エラーにならない）のに、書き込みは断られる」
 *   という状態になりうる。そのため診断が **「読めています」** と出て、
 *   **控えが1行も残らないのに大丈夫そうに見えて**いた。
 *   訪問が何日も0のまま気づけなかったのと同じ失敗なので、
 *   **書けると言い切れないときは ok にしない。**
 *
 * ■ 原因の言い分け（直し方が全く違うので混ぜない）
 *   表が無い     → SQL を1回流す
 *   鍵が使えない → Vercel の SUPABASE_SERVICE_ROLE_KEY を貼り直す（kp55）
 *
 * ■ 「表の側を緩めて回避する」はやらない（2026-09-19 判断）
 *   ブラウザにも配られる通常の鍵に「足すことだけ許す」決まりを入れれば、
 *   人が Vercel を触らなくても記録は残せる。けれどそれは
 *   **誰でも申し込みの控えに行を足せる** ということでもある。
 *   鍵の貼り直しは2分で終わる正しい直し方なので、そちらを待つ。
 */
export function describeRecordStore(
  check: TableCheck,
  key: ServerKeyReport,
): RecordStoreReport {
  // 読むことすらできない
  if (!check.ok) {
    const reason = check.reason ?? "読めませんでした";
    return {
      ok: false,
      readable: false,
      note: key.usable
        ? reason
        : `${reason}（サーバー側の鍵が使えていないことが原因の可能性が高いです）`,
    };
  }

  // 読めて、鍵も生きている＝ふつうに記録できる
  if (key.usable) {
    return {
      ok: true,
      readable: true,
      note: "記録できます（読み書きとも通ります）",
    };
  }

  // 読めるけれど、鍵が壊れている＝書けたかどうかは、ここからは分からない
  return {
    ok: false,
    readable: true,
    note:
      "表はありますが、記録が残っているとは言い切れません。" +
      "読めることと書けることは別で、この表は読むと0件が返るだけで" +
      "書き込みだけが断られている状態になりえます。" +
      "サーバー側の鍵が使えないためなので、Vercel の " +
      "SUPABASE_SERVICE_ROLE_KEY を貼り直してください（kp55）",
  };
}
