/**
 * 「いま手に持っている文字は、サーバー側の鍵（service_role）か？」を、
 * **ブラウザの中だけで**見分けるための物差し（/keiri/key の貼る前チェック）。
 *
 * ■ なぜ要るのか（2026-11-15 18:3x B）
 *   本番の鍵の欄には、鍵ではないものが入ったままです
 *   （長さ700文字・うち日本語447文字・改行12個＝説明文を貼ってしまった形）。
 *   そのあいだ **毎日の自動の控え（バックアップ）が取れず**、
 *   2軒目のお店の行も作れません（仕上げの f5-4 の1手目）。
 *   じゅんの直しは1分で済むはずなのに、**貼ったあとで Vercel を出し直すまで
 *   合っているか分からない**ので、同じしくじりがもう一度 起きると
 *   また数日 止まります。そこで「貼る前に、その場で合っているか言う」物差しを作りました。
 *
 * ■ ここは「貼る前の見分け」専用です
 *   サーバーが「この値を本当に使ってよいか」を決める所は
 *   `lib/supabaseServer.ts`（looksLikeServiceRoleKey / serviceRoleKeyRepair）のままで、
 *   **1行も変えていません**。こちらは人に見せる言葉を作るだけで、
 *   どこにも送らず、どこにも残しません（呼ぶ側＝KeyShapeCheck.tsx が守ります）。
 *
 * ■ 値そのものは、返り値に1文字も入れません
 *   返すのは「合っているか」「なぜ違うか（長さ・日本語の数などの形だけ）」です。
 */

/** 見分けた結果 */
export type KeyShapeVerdict = {
  /** 貼ってよいか（true のときだけ「これを貼ってください」と言う） */
  ok: boolean;
  /** 画面のいちばん上に出す1行 */
  headline: string;
  /** なぜそう言えるか（1〜3行） */
  reasons: string[];
  /** 見分けの種類（試験で固定するため。画面には出さない） */
  kind:
    | "empty"
    | "service_role"
    | "secret_new"
    | "anon"
    | "publishable"
    | "other_project"
    | "not_a_key";
  /** 前後に空白や引用符が付いていたか（付いていても ok は変えない。注意だけ出す） */
  trimmed: boolean;
  /** 長さ（文字数だけ。値そのものは返さない） */
  length: number;
};

/** 前後の空白と、コピーのときに付きがちな引用符を取り除く */
function tidy(value: string): string {
  let v = value.trim();
  while (v.length >= 2 && /^["'`]/.test(v) && v.slice(-1) === v[0]) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/** JWT の真ん中（base64url）を読む。ブラウザでも Node でも動く形にする */
function readPayload(part: string): Record<string, unknown> | null {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  let json: string;
  try {
    if (typeof atob === "function") {
      const bin = atob(padded);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      json = new TextDecoder().decode(bytes);
    } else {
      // Node 側（試験）。Buffer はここでしか使わない
      json = Buffer.from(padded, "base64").toString("utf8");
    }
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 日本語（ひらがな・カタカナ・漢字）が何文字あるか */
function japaneseCount(value: string): number {
  let n = 0;
  for (const ch of value) if (/[぀-ヿ一-鿿]/.test(ch)) n++;
  return n;
}

/**
 * 貼ろうとしている文字を見分ける。
 *
 * @param raw      じゅんが入れた文字（**どこにも送らない**）
 * @param expectedRef いまつないでいる倉庫の名前（例 vtuyebyjbvjmucqpkxug）。
 *                    分からなければ空文字でよい（倉庫の一致だけ確かめません）
 */
export function judgeKeyShape(raw: string, expectedRef = ""): KeyShapeVerdict {
  const value = tidy(raw);
  const trimmed = value.length > 0 && value !== raw;
  const base = { trimmed, length: value.length };

  if (value.length === 0) {
    return {
      ...base,
      ok: false,
      kind: "empty",
      headline: "まだ何も入っていません",
      reasons: [
        "Supabase の Project Settings → API を開き、service_role の欄の" +
          "［コピー］のボタンを押してから、ここに貼ってください。",
      ],
    };
  }

  const ja = japaneseCount(value);
  const newlines = (value.match(/[\r\n]/g) ?? []).length;

  // 新しい形の鍵（sb_secret_… / sb_publishable_…）
  if (/^sb_publishable_/.test(value)) {
    return {
      ...base,
      ok: false,
      kind: "publishable",
      headline: "これは【公開用】の鍵です。貼っても直りません",
      reasons: [
        "sb_publishable_ で始まる鍵は、ブラウザに配ってよい公開用の鍵です。",
        "要るのは service_role（または sb_secret_ で始まる秘密の鍵）のほうです。",
      ],
    };
  }
  if (/^sb_secret_[A-Za-z0-9_-]{8,}$/.test(value)) {
    return {
      ...base,
      ok: true,
      kind: "secret_new",
      headline: "形は合っています（新しい形の秘密の鍵）。これを貼ってください",
      reasons: [
        "sb_secret_ で始まる秘密の鍵の形です。",
        "どの倉庫の鍵かは、この形からは読み取れません（貼って出し直したあと、この画面で確かめてください）。",
      ],
    };
  }

  const parts = value.split(".");
  const looksJwt =
    parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));

  if (!looksJwt) {
    const why: string[] = [];
    if (ja > 0) why.push(`日本語が ${ja} 文字 入っています（説明文を一緒に貼った形です）`);
    if (newlines > 0) why.push(`改行が ${newlines} 個 入っています（鍵は1行です）`);
    if (!/^(eyJ|sb_)/.test(value)) why.push("書き出しが鍵の形（eyJ… / sb_…）ではありません");
    if (why.length === 0) why.push("「.」で3つに分かれた形（JWT）になっていません");
    return {
      ...base,
      ok: false,
      kind: "not_a_key",
      headline: "これは鍵ではありません。貼らないでください",
      reasons: [
        `${why.join("／")}（長さ ${value.length} 文字）。`,
        "Supabase の Project Settings → API を開き、service_role の欄の" +
          "［コピー］のボタンを押してください（文字を選んでコピーすると、まわりの説明文が混ざります）。",
      ],
    };
  }

  const payload = readPayload(parts[1]);
  if (!payload) {
    return {
      ...base,
      ok: false,
      kind: "not_a_key",
      headline: "これは鍵ではありません。貼らないでください",
      reasons: [
        "「.」で3つには分かれていますが、真ん中を読んでも鍵の中身になりません。",
        "Supabase の service_role の欄の［コピー］のボタンを押し直してください。",
      ],
    };
  }

  const role = typeof payload.role === "string" ? payload.role : "";
  const ref = typeof payload.ref === "string" ? payload.ref : "";

  if (role !== "service_role") {
    return {
      ...base,
      ok: false,
      kind: role === "anon" ? "anon" : "not_a_key",
      headline:
        role === "anon"
          ? "これは【公開用】の鍵（anon）です。貼っても直りません"
          : "これは service_role の鍵ではありません。貼らないでください",
      reasons: [
        role === "anon"
          ? "anon はブラウザに配ってよい公開用の鍵で、止まっている所は動きません。"
          : "鍵の中身の役（role）が service_role ではありません。",
        "Supabase の Project Settings → API で、service_role と書いてあるほうの［コピー］を押してください。",
      ],
    };
  }

  if (expectedRef && ref && ref !== expectedRef) {
    return {
      ...base,
      ok: false,
      kind: "other_project",
      headline: "これは【別の倉庫】の鍵です。貼らないでください",
      reasons: [
        "service_role の鍵ではありますが、いまつないでいる倉庫のものではありません。",
        "手羽屋の倉庫（いまつないでいるほう）の Project Settings → API から取り直してください。",
      ],
    };
  }

  return {
    ...base,
    ok: true,
    kind: "service_role",
    headline: "これで合っています。この値を Vercel に貼ってください",
    reasons: [
      expectedRef && ref === expectedRef
        ? "いまつないでいる倉庫の service_role の鍵です（倉庫の名前まで一致しました）。"
        : "service_role の鍵の形です。",
      "貼ったあと、Vercel で［Redeploy］を1回 押すと効きます。",
    ],
  };
}
