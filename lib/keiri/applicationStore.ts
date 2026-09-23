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

/* ==========================================================================
 * ここから下：「まだ手当てしていない申し込みが何件あるか」を数える（kp124）
 *
 * ■ なぜ要るのか
 *   上の probeApplicationStore は「入れる道が生きているか」しか見ていない。
 *   ＝ **入った件数は誰も見られない**（棚は郵便ポストの形、合鍵は壊れたまま・kp55）。
 *   いま申し込みが1件入っても、気づけるのは LINE の知らせ1本だけ。
 *   見落とすと最初の1件を取りこぼすので、**数だけ**を見られるようにする。
 *
 * ■ 数え方の優先順（上から順に試す）
 *   1. サーバー側の合鍵が生きている → 棚をそのまま数える（いちばん強い）
 *   2. 数だけ答える窓口（keiri_applications_summary）→ 件数と最新時刻だけ返る
 *   3. どちらも駄目 → 「まだ数えられません」と正直に出し、直し方を1つだけ書く
 *
 * ★ 返すのは**数と時刻だけ**。お店の名前・お名前・メール・電話は受け取りません。
 * ★ 1行も書き込みません。誰にも知らせません。
 * ★ 手羽屋の日報・シフト・レジ・LINE・お金の計算には一切さわっていません。
 * ========================================================================== */

/** 「まだ手当てしていない申し込み」の数（連絡先は一切入らない） */
export type PendingApplications = {
  /** 数えられたか */
  countable: boolean;
  /** まだ手当てしていない件数（数えられないときは null） */
  pending: number | null;
  /** これまでに入った全件数（数えられないときは null） */
  total: number | null;
  /** いちばん新しい申し込みが入った時刻（無ければ null） */
  latestAt: string | null;
  /** 人の言葉での説明 */
  note: string;
};

/** 窓口・棚から返ってきた「数」の素（通信はここに入らない） */
export type ApplicationCount = {
  pending: number;
  total: number;
  latestAt: string | null;
};

/** 数え方の結果（見分け） */
export type ApplicationCountResult =
  /** 数えられた */
  | { outcome: "counted"; count: ApplicationCount; readable: boolean }
  /** 窓口がまだ無い（SQL を1回流せば数えられる） */
  | { outcome: "no_window" }
  /** 窓口はあるが呼べなかった */
  | { outcome: "failed"; detail: string };

/**
 * 数え方の結果を、診断に出す言葉に直す（通信はしない・純粋な判定）。
 *
 * ★ここは「0件」と「数えられない」を**必ず言い分ける**。
 *   ひとまとめにすると「申し込みが来ていない」のか
 *   「来ているのに見えていない」のか分からなくなり、判断をまちがえる（kp89 と同じ考え方）。
 */
export function describePendingApplications(result: ApplicationCountResult): PendingApplications {
  if (result.outcome === "counted") {
    const { pending, total, latestAt } = result.count;
    const how = result.readable
      ? "（棚をそのまま数えました）"
      : "（数だけ答える窓口で数えました。棚は「入れるだけの郵便ポスト」のままです）";
    if (pending > 0) {
      return {
        countable: true,
        pending,
        total,
        latestAt,
        note:
          `★まだ手当てしていないお申し込みが ${pending} 件あります${how}。` +
          (latestAt ? `いちばん新しいのは ${latestAt} に入りました。` : "") +
          "中身（お店の名前・ご連絡先）は Supabase の Table Editor で " +
          "keiri_applications を開くと見られます",
      };
    }
    return {
      countable: true,
      pending: 0,
      total,
      latestAt,
      note:
        `まだ手当てしていないお申し込みは 0 件です${how}。` +
        `これまでに入った数は ${total} 件です` +
        (latestAt ? `（いちばん新しいのは ${latestAt}）` : ""),
    };
  }

  if (result.outcome === "no_window") {
    return {
      countable: false,
      pending: null,
      total: null,
      latestAt: null,
      note:
        "まだ数えられません（数だけ答える窓口がありません）。" +
        "倉庫の SQL Editor で supabase/migrations/keiri_applications_summary_fn.sql を" +
        "1回流すと数えられるようになります。" +
        "Vercel の SUPABASE_SERVICE_ROLE_KEY を貼り直しても数えられます（kp55）。" +
        "※ 数えられないあいだも、お申し込みは控えとして残り、LINE でも知らせます",
    };
  }

  return {
    countable: false,
    pending: null,
    total: null,
    latestAt: null,
    note:
      `まだ数えられません（${result.detail}）。` +
      "SQL はもう流してあるので、原因は別にあります。" +
      "※ 数えられないあいだも、お申し込みは控えとして残り、LINE でも知らせます",
  };
}

/** 窓口が返した1行を「数」に直す（通信はしない・純粋な判定） */
export function readApplicationCount(data: unknown): ApplicationCount | null {
  const row = Array.isArray(data)
    ? (data[0] as Record<string, unknown> | undefined)
    : (data as Record<string, unknown> | null);
  if (!row || typeof row !== "object") return null;
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const pending = num(row.pending);
  const total = num(row.total);
  if (pending === null || total === null) return null;
  const latest = row.latest_at;
  return {
    pending,
    total,
    latestAt: typeof latest === "string" && latest.trim() !== "" ? latest : null,
  };
}

/** 数えるときに使う相手（Supabase のクライアント。試験では差し替える） */
export type ApplicationCountClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

/**
 * 「数だけ答える窓口」を1回叩いて数える。
 * ★読むだけ。1行も書き込みません。連絡先は受け取りません。
 */
export async function countApplicationsViaWindow(
  db: ApplicationCountClient,
  isMissing: (error: { code?: string; message?: string } | null) => boolean,
): Promise<ApplicationCountResult> {
  try {
    const { data, error } = await db.rpc("keiri_applications_summary");
    if (error) {
      if (isMissing(error)) return { outcome: "no_window" };
      return { outcome: "failed", detail: String(error.message ?? "呼べませんでした") };
    }
    const count = readApplicationCount(data);
    if (!count) return { outcome: "failed", detail: "窓口の返事を読めませんでした" };
    return { outcome: "counted", count, readable: false };
  } catch (e) {
    return {
      outcome: "failed",
      detail: e instanceof Error ? e.message : "通信に失敗しました",
    };
  }
}
