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
  /** いま実際に鍵として使えているか（直したものを含む） */
  usable: boolean;
  /** 全角が混ざっていたので、半角に直して使っているか（2026-09-19・kp67） */
  repaired?: boolean;
  /** 人の言葉での説明 */
  note: string;
};

/**
 * 「未設定」と「値が壊れている」を必ず言い分ける。
 * 同じ「使えません」でも、やることが全く違うため（CLAUDE.md 4-10）。
 */
/** 鍵の壊れ方。**値そのものは含めない**（数と種類だけ） */
export type BrokenShape = {
  count: number;
  convertible: number;
  length?: number;
  japanese?: number;
  newlines?: number;
  startsLikeKey?: boolean;
};

/**
 * 「貼り付けのしそこない」と「そもそも別の物が入っている」を言い分ける。
 * 直し方が全く違うため（前者は貼り直し、後者は**どこから何をコピーするか**から違う）。
 */
function describeShape(b: BrokenShape): string {
  // 鍵は200文字ほど。日本語が入っている・書き出しが鍵でない なら、貼り間違いではなく別物
  const wrongThing =
    (b.japanese ?? 0) > 0 || (b.newlines ?? 0) > 0 || b.startsLikeKey === false;
  if (!wrongThing) return "";
  const parts: string[] = [];
  if (b.length) parts.push(`長さ ${b.length} 文字`);
  if (b.japanese) parts.push(`うち日本語が ${b.japanese} 文字`);
  if (b.newlines) parts.push(`改行が ${b.newlines} 個`);
  if (b.startsLikeKey === false) parts.push("書き出しが鍵の形（eyJ… / sb_…）ではありません");
  return (
    `【貼り間違いではなく、別の物が入っている可能性が高いです：${parts.join("・")}】` +
    "Supabase の Project Settings → API → service_role の値を、" +
    "その欄のコピーボタンからコピーして貼ってください（説明文や画面の文章を含めないこと）。"
  );
}

export function describeServerKey(
  check: KeyCheck,
  repair?: { repaired: boolean; broken: BrokenShape },
): ServerKeyReport {
  // 全角が混ざっていたが、半角に直して鍵の形も確かめられた場合（2026-09-19・kp67）。
  // 「直して動いている」ことと「正しく貼り直してほしい」ことは別なので、両方書く。
  if (repair?.repaired) {
    return {
      configured: true,
      usable: true,
      repaired: true,
      note:
        `値に全角の文字が ${repair.broken.count} 個混ざっていましたが、` +
        "決まりどおり半角に直したうえで、鍵の形（この倉庫の service_role）を確かめて使っています。" +
        "記録は残ります。ただし直しに頼らずに済むよう、Vercel の環境変数 " +
        "SUPABASE_SERVICE_ROLE_KEY はいずれ貼り直してください（kp55）",
    };
  }
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
  const detail = repair
    ? `（使えない文字が ${repair.broken.count} 個。うち半角に直せるのは ${repair.broken.convertible} 個で、` +
      "直しても鍵の形になりませんでした＝値そのものが違います）"
    : "";
  const shape = repair ? describeShape(repair.broken) : "";
  return {
    configured: true,
    usable: false,
    repaired: false,
    note:
      `値に全角などの使えない文字が入っています${detail}。` +
      `${shape}` +
      "Vercel の環境変数 SUPABASE_SERVICE_ROLE_KEY を貼り直してください。" +
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
 * ■ 「表の側を緩めて回避する」について（2026-09-19 夜・実際にやった形）
 *   当初は「誰でも申し込みの控えに行を足せてしまう」ので避ける判断だった。
 *   その後、**足すことだけ許し・読み出しも書き換えも削除も一切許さない**
 *   「郵便ポスト」の形（入れる中身の条件も縛る）で入れた。
 *   ＝ 鍵が壊れているあいだも控えは残る。鍵が直ったら外す（kp88）。
 *   ただし**一覧として読み返すにはサーバー側の鍵が要る**ので、
 *   ここから「残った」ことは確かめられない。だから下の note は
 *   「残った／残っていない」を断定せず、確かめられないことをそう書く。
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
      "表はありますが、ここからは「残った」ことを確かめられません。" +
      "読めることと書けることは別で、この表はサーバー側の鍵が無いと" +
      "読むと必ず0件が返ります（入れることだけは許してあります）。" +
      "一覧として読み返せるようにするには、Vercel の " +
      "SUPABASE_SERVICE_ROLE_KEY を貼り直してください（kp55）",
  };
}
