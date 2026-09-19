/**
 * 「お申し込みの控えが、いま本当に残るか」を確かめるためのファイル。
 *
 * ■ なぜ要るのか（2026-09-19・kp103）
 *   申し込みの棚（keiri_applications）は 9/19 に
 *   「**入れることだけ許す郵便ポスト**」の形にした（keiri_applications_insert_only.sql）。
 *   ＝ **外から1行ずつ読めないのが正しい状態**。
 *   ところが診断（/api/keiri/diagnose）は「1行読んでみる」だけで確かめていたので、
 *   正しい状態を「**読む許可がありません（鍵が使えていない可能性）**」と
 *   まちがって報告していた。訪問（site_visits）で 9/19 に直したのと同じ形の見落とし。
 *
 *   いま申し込みの受け口は「LINE の知らせ（今月あと数通）」と「この控え」の2本だけ。
 *   診断が控えを「残らない」側に倒すと、
 *   **送ってよいかの判断をまちがえる**（今日この形の誤報が3回出ている）。
 *
 * ■ どう確かめるか（1行も残さずに、書ける道が生きていることを確かめる）
 *   **わざと決まりに引っかかる行**を1件入れてみて、返ってきた断られ方を読む。
 *   決まりは `status = 'new'` しか通さないので、`status` を別の値にすれば **必ず断られる**。
 *   断られ方で、次の3つを言い分けられる：
 *     ・表が無い            → SQL を1回流す
 *     ・入れる権利が無い     → grant を流し直す
 *     ・決まりに断られた     → **表も権利も決まりも生きている＝正しい行なら残る**
 *   断られるので **行は1件も増えません**（万一入ってしまったら、そのことを正直に出す）。
 *
 * ★ 連絡先は入れません（点検用と分かる値だけ）。
 * ★ 手羽屋の日報・シフト・レジ・LINE・お金の計算には一切さわっていません。
 */

import type { RecordStoreReport } from "./serverHealth";

/** 点検のときに入れてみる中身。**決まりに必ず断られる値**にしてある */
export const APPLICATION_PROBE_ROW = {
  shop_name: "__diagnose__",
  contact_name: "__diagnose__",
  email: "diagnose@example.invalid",
  phone: null,
  note: null,
  source: "form",
  // ★ここが肝。決まりは status='new' しか通さないので、これは必ず断られる
  status: "__diagnose__",
  tenant_id: null,
} as const;

/** 断られ方の見分け */
export type ApplicationProbeOutcome =
  /** 決まりに断られた＝表も権利も決まりも生きている（正しい行なら残る） */
  | "rejected_by_policy"
  /** 表がまだ無い */
  | "no_table"
  /** 入れる権利が渡っていない */
  | "no_grant"
  /** 断られずに入ってしまった＝決まりが効いていない（起きてはいけない） */
  | "inserted"
  /** 上のどれでもない */
  | "unknown";

export type ApplicationProbe = {
  outcome: ApplicationProbeOutcome;
  /** そのまま人に見せてよい短い理由（鍵や値は入らない） */
  detail: string;
};

/** 入れてみた結果のエラーを、見分けに直す（通信はしない・純粋な判定） */
export function classifyApplicationProbe(error: {
  code?: string | null;
  message?: string | null;
} | null): ApplicationProbe {
  if (!error) {
    return {
      outcome: "inserted",
      detail: "断られずに入ってしまいました（入れてよい中身を絞る決まりが効いていません）",
    };
  }
  const code = (error.code ?? "").trim();
  const message = (error.message ?? "").trim();

  // 表が無い（Postgres の 42P01／PostgREST の schema cache 由来の言い方の両方）
  if (code === "42P01" || /could not find the table/i.test(message)) {
    return { outcome: "no_table", detail: "表がまだありません" };
  }
  if (code === "42501" || /permission denied|row-level security/i.test(message)) {
    // 同じ 42501 でも、「権利が無い」と「決まりに断られた」は直し方が全く違う
    if (/row-level security/i.test(message)) {
      return { outcome: "rejected_by_policy", detail: "決まりに断られました（正しい形）" };
    }
    return { outcome: "no_grant", detail: "入れる権利が渡っていません" };
  }
  return { outcome: "unknown", detail: message || code || "理由は分かりません" };
}

/**
 * 見分けを、診断に出す言葉に直す（通信はしない・純粋な判定）。
 *
 * `readable` は「1行ずつ読めるか」。郵便ポストの形では **読めないのが正しい**ので、
 * 読めないこと自体を不具合として出さない。
 */
export function describeApplicationStore(
  probe: ApplicationProbe,
  readable: boolean,
): RecordStoreReport {
  if (readable) {
    return {
      ok: true,
      readable: true,
      note: "記録できます（読み書きとも通ります）",
    };
  }
  switch (probe.outcome) {
    case "rejected_by_policy":
      return {
        ok: true,
        readable: false,
        note:
          "残ります（入れる道が生きていることを、1行も残さずに確かめました）。" +
          "棚は「入れるだけの郵便ポスト」にしてあるので1行ずつは読めません（これが正しい状態です）。" +
          "一覧として読み返せるようにするには、Vercel の SUPABASE_SERVICE_ROLE_KEY を" +
          "貼り直してください（kp55）",
      };
    case "inserted":
      return {
        ok: false,
        readable: false,
        note:
          "点検用の行が1件入ってしまいました。入れてよい中身を絞る決まりが効いていません。" +
          "倉庫の SQL Editor で supabase/migrations/keiri_applications_insert_only.sql を" +
          "1回流し、入った点検用の行（お店の名前が __diagnose__）を消してください",
      };
    case "no_table":
      return {
        ok: false,
        readable: false,
        note:
          "表がまだありません。倉庫の SQL Editor で " +
          "supabase/migrations/keiri_applications.sql を1回流してください。" +
          "このままだと、お申し込みが入っても控えが残りません",
      };
    case "no_grant":
      return {
        ok: false,
        readable: false,
        note:
          "入れる権利が渡っていません。倉庫の SQL Editor で " +
          "supabase/migrations/keiri_applications_insert_only.sql を1回流してください。" +
          "このままだと、お申し込みが入っても控えが残りません",
      };
    default:
      return {
        ok: false,
        readable: false,
        note:
          `控えが残るかどうかを確かめられませんでした（${probe.detail}）。` +
          "お申し込みは LINE の知らせでも届きますが、控えが残らない恐れがあります",
      };
  }
}

/** 入れてみる相手（Supabase のクライアント。試験では差し替える） */
export type ApplicationInsertClient = {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<{
      error: { code?: string | null; message?: string | null } | null;
    }>;
  };
};

/**
 * 実際に1回だけ「わざと断られる行」を入れてみる。
 * ★通るはずがないので、行は増えません。誰にも知らせません。
 */
export async function probeApplicationStore(
  db: ApplicationInsertClient,
): Promise<ApplicationProbe> {
  try {
    const { error } = await db.from("keiri_applications").insert({ ...APPLICATION_PROBE_ROW });
    return classifyApplicationProbe(error);
  } catch (e) {
    return {
      outcome: "unknown",
      detail: e instanceof Error ? e.message : "通信に失敗しました",
    };
  }
}
