/**
 * 「よその店の数字が、手羽屋の側へ流れないか」を機械で見張る、ただ1か所のファイル
 * （2026-11-11・f3-4）。**計算だけ**（倉庫もネットも触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   写真日報（app/report/photo/page.tsx）は、手羽屋と「写真だけの日報のお店」
 *   （牟田町店）が**同じ1枚**を使います。保存したあとに動く3つは、
 *   **手羽屋のものなので、よその店では動かしてはいけません**（CLAUDE.md 3-3）：
 *     ① 出店先のランクの付け直し（recalcRankForLocation）
 *     ② 原価率の見張り（watchCostsFromReport）
 *     ③ 手羽屋のスタッフのLINEグループへの送信（/api/line/send-report）
 *   ③が特に大事です。動いてしまうと、**よその店の売上が手羽屋のスタッフの
 *   LINEに流れます**（取り消せません）。
 *
 * ■ いまの作りと、その弱さ
 *   画面の中で「お店なら、ここで終わり」と1行で止めています（early return）。
 *   ところがこれは**画面の中の1行**なので、消しても試験は1つも落ちませんでした。
 *   ＝ 消したことに気づけるのは、誰かが目でその行を読み直したときだけです。
 *
 * ■ どう直すか
 *   画面の中身を**文字として読んで**、「止める1行」が3つの呼び出しより
 *   **先にあること**を数えます。無くなったら、その場で試験が落ちます。
 *   ★画面の動きは1行も変えていません（見張るだけ）。
 */

/** 手羽屋のときだけ動かしてよい3つ（名前で見分ける） */
export const TEBAYA_ONLY_CALLS: readonly { label: string; needle: string }[] = [
  { label: "出店先のランクの付け直し", needle: "recalcRankForLocation(" },
  { label: "原価率の見張り", needle: "watchCostsFromReport(" },
  { label: "手羽屋のスタッフのLINEへの送信", needle: "/api/line/send-report" },
];

/**
 * 「よその店ならここで終わり」の1行の見分け方。
 * `if (shop) {` … 写真日報の画面で使っている形。
 */
const GATE_RE = /if\s*\(\s*shop\s*\)\s*\{/;

/** 「ここで終わり」と書いてあるか（gate のすぐ後ろに return があるか） */
const RETURN_RE = /\breturn\b/;

export type GuardFinding = { label: string; line: number };

export type GuardResult = {
  /** 止める1行が見つかった行（見つからなければ null） */
  gateLine: number | null;
  /** 止める1行の中に「ここで終わり」が書いてあるか */
  gateReturns: boolean;
  /** 止める1行より**前**にあった、手羽屋だけの呼び出し（1件でもあれば不合格） */
  before: GuardFinding[];
  /** 止める1行より後ろにあった、手羽屋だけの呼び出し（ここにあるのが正しい） */
  after: GuardFinding[];
  /** 見張りの対象なのに1つも見つからなかった呼び出し（名前が変わった可能性） */
  missing: string[];
  ok: boolean;
  reason: string;
};

/**
 * 写真日報の画面の中身（文字）を読んで、見張りの結果を返す。
 * @param source app/report/photo/page.tsx の中身
 */
export function checkPhotoShopGuard(source: string): GuardResult {
  const lines = source.split("\n");

  let gateLine: number | null = null;
  let gateReturns = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (!GATE_RE.test(lines[i])) continue;
    // その行から3行のうちに「ここで終わり」が書いてあるものだけを数える
    const near = lines.slice(i, i + 4).join("\n");
    if (RETURN_RE.test(near)) {
      gateLine = i + 1;
      gateReturns = true;
      break;
    }
    if (gateLine === null) gateLine = i + 1;
  }

  const before: GuardFinding[] = [];
  const after: GuardFinding[] = [];
  const missing: string[] = [];

  for (const c of TEBAYA_ONLY_CALLS) {
    let found = false;
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes(c.needle)) continue;
      found = true;
      const hit = { label: c.label, line: i + 1 };
      if (gateLine !== null && i + 1 > gateLine) after.push(hit);
      else before.push(hit);
    }
    if (!found) missing.push(c.label);
  }

  const ok =
    gateLine !== null && gateReturns && before.length === 0 && missing.length === 0;

  return { gateLine, gateReturns, before, after, missing, ok, reason: reasonOf({ gateLine, gateReturns, before, missing }) };
}

function reasonOf(p: {
  gateLine: number | null;
  gateReturns: boolean;
  before: GuardFinding[];
  missing: string[];
}): string {
  if (p.gateLine === null || !p.gateReturns) {
    return (
      "写真日報の画面から「よその店ならここで終わり」の1行（if (shop) … return）が無くなっています。" +
      "このままだと、よその店の売上が**手羽屋のスタッフのLINEに流れます**（取り消せません）。" +
      "保存のすぐ後ろに、その1行を戻してください（CLAUDE.md 3-3）"
    );
  }
  if (p.before.length > 0) {
    const where = p.before.map((b) => `${b.label}（${b.line}行目）`).join("・");
    return (
      `手羽屋だけの処理が、止める1行（${p.gateLine}行目）より**前**にあります：${where}。` +
      "よその店でも動いてしまうので、止める1行の後ろへ動かしてください"
    );
  }
  if (p.missing.length > 0) {
    return (
      `見張りの対象が見つかりませんでした：${p.missing.join("・")}。` +
      "呼び出しの名前が変わったのなら、lib/photoShopGuard.ts の一覧も直してください" +
      "（見張りが空振りしたまま通るのを防ぐため）"
    );
  }
  return (
    `手羽屋だけの3つ（ランク・原価率の見張り・LINE）は、すべて止める1行（${p.gateLine}行目）の後ろにあります` +
    "＝よその店では動きません"
  );
}
