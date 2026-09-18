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
  ok: boolean;
  note: string;
};

/**
 * 置き場が読めなかったとき、原因が「表が無い」のか「鍵が使えない」のかを言い分ける。
 * 直し方が違う（SQLを1回流す／Vercelの設定を貼り直す）ので、混ぜない。
 */
export function describeRecordStore(
  check: TableCheck,
  key: ServerKeyReport,
): RecordStoreReport {
  if (check.ok) return { ok: true, note: "読めています" };
  if (!key.usable) {
    return {
      ok: false,
      note: `${check.reason ?? "読めませんでした"}（サーバー側の鍵が使えていないことが原因の可能性が高いです）`,
    };
  }
  return { ok: false, note: check.reason ?? "読めませんでした" };
}
