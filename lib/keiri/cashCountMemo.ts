/**
 * 金庫を数えた記録を、**置き場（keiri_cash_events）ができるまでのあいだ**
 * 経理の設定の行（keiri_settings.memo）に1件だけ控えておくところ。**計算だけ**。
 *
 * ■ なぜ要るのか（2026-10-13・kp245・f1-4）
 *   f1-4（計算上の現金と、実際の金庫が合うか）は、じゅんの手続きが**2つ**そろうまで
 *   確かめられない作りになっていました。
 *     ① 倉庫に貼り紙を1回 貼る（置き場＝keiri_cash_events を作る・2分）
 *     ② 金庫を数えて金額を1回 入れる（1分）
 *   ①は 2026-10-03 から10日 動いていません。そのあいだ②を押しても、画面に答えは出るのに
 *   **記録が1行も残らない**ので、こちら側から「合っていた」を確かめられませんでした。
 *   ＝ **1分で済む②が、2分の①を待っている**状態。
 *
 *   経理の設定の行は、もうある棚で、ブラウザから書き換えられます。
 *   そこで「数えた1回」だけをこの行のおまけ欄（memo）に控えます。
 *   こうすると **②の1分だけで f1-4 を確かめられます**（①を待ちません）。
 *
 * ■ 守ること
 *   ・**金額は作らない。** 入れた金額をそのまま控えるだけ。
 *   ・**いま memo に書いてある文は消さない。** 控えは挟み込みの印の中だけに書き、
 *     印ごと外せば元の文がそのまま戻る（＝1行で元に戻せる）。
 *   ・控えるのは **いちばん新しい1回だけ**（おまけ欄を長くしない）。
 *   ・置き場ができたあとは、置き場の記録とこの控えを**両方 読んで重なりを外す**。
 *     控えが残っていても二重に数えない。
 *   ・手羽屋の日報・シフト・レジ・LINE・お金の計算（lib/money.ts）には触らない。
 */

import type { CashEvent } from "./cashCheck";

/** 控えの始まりの印 */
export const CASH_MEMO_BEGIN = "［金庫を数えた控え v1 ここから］";
/** 控えの終わりの印 */
export const CASH_MEMO_END = "［金庫を数えた控え v1 ここまで］";

/** 控えの中に書く、人が読んでも分かる1行の説明 */
const CASH_MEMO_NOTE =
  "※ 置き場（keiri_cash_events）ができるまでの仮置きです。" +
  "この印から印までを消すと、元のひとことだけが残ります。金額は1円も計算していません。";

/** 控え1件の形（倉庫に文字として置くときの中身） */
type MemoCount = {
  happened_on: string;
  amount: number;
  note: string | null;
  saved_at: string;
};

/** ひとことの長さの上限（おまけ欄を長くしないため） */
const NOTE_MAX = 100;

/** 挟み込みの印の中を取り除いて、元の文だけを返す */
export function stripCashCountMemo(memo: string | null | undefined): string {
  const text = String(memo ?? "");
  const begin = text.indexOf(CASH_MEMO_BEGIN);
  if (begin < 0) return text.trim();
  const endAt = text.indexOf(CASH_MEMO_END, begin);
  const after = endAt < 0 ? "" : text.slice(endAt + CASH_MEMO_END.length);
  return `${text.slice(0, begin)}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 数えた1回を控えた memo の文を作る。
 *
 * ★いま書いてある文はそのまま残し、前の控えだけ入れ替える。
 * ★日付・金額がおかしいときは null を返す（＝控えない。黙って直さない）。
 */
export function encodeCashCountMemo(
  memo: string | null | undefined,
  ev: { happened_on: string; amount: number; note?: string | null; saved_at?: string },
): string | null {
  const on = String(ev.happened_on ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return null;
  const amount = Number(ev.amount);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const row: MemoCount = {
    happened_on: on,
    amount: Math.round(amount),
    note: typeof ev.note === "string" && ev.note.trim() !== ""
      ? ev.note.trim().slice(0, NOTE_MAX)
      : null,
    saved_at: ev.saved_at ?? new Date().toISOString(),
  };

  const base = stripCashCountMemo(memo);
  const block = [CASH_MEMO_BEGIN, CASH_MEMO_NOTE, JSON.stringify(row), CASH_MEMO_END].join("\n");
  return base === "" ? block : `${base}\n\n${block}`;
}

/**
 * memo に控えてある「数えた1回」を読む。
 *
 * ★読めない・印が無い・中身がおかしい ときは **空**（＝今までどおり何も無い扱い）。
 *   ここで例外を投げると、経理の画面が丸ごと開かなくなるため。
 */
export function decodeCashCountMemo(memo: string | null | undefined): CashEvent[] {
  const text = String(memo ?? "");
  const begin = text.indexOf(CASH_MEMO_BEGIN);
  if (begin < 0) return [];
  const endAt = text.indexOf(CASH_MEMO_END, begin);
  const inner = text.slice(begin + CASH_MEMO_BEGIN.length, endAt < 0 ? undefined : endAt);
  for (const line of inner.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const r = JSON.parse(t) as Partial<MemoCount>;
      const on = String(r.happened_on ?? "").slice(0, 10);
      const amount = Number(r.amount);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return [];
      if (!Number.isFinite(amount) || amount < 0) return [];
      return [
        {
          kind: "count",
          happened_on: on,
          amount: Math.round(amount),
          actor: null,
          note: typeof r.note === "string" ? r.note : null,
        },
      ];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 置き場の記録と、memo の控えを1つにまとめる。
 *
 * ★同じ日・同じ金額・同じ種類は**1件として数える**（置き場に移ったあと、控えが
 *   残っていても二重に出さないため）。置き場の記録を先に置く（そちらが正）。
 */
export function mergeCashEvents(shelf: CashEvent[], memo: CashEvent[]): CashEvent[] {
  const key = (e: CashEvent) => `${e.kind}|${e.happened_on}|${e.amount}`;
  const seen = new Set(shelf.map(key));
  const out = shelf.slice();
  for (const e of memo) {
    if (seen.has(key(e))) continue;
    seen.add(key(e));
    out.push(e);
  }
  return out;
}

/**
 * 「いま おまけ欄に書いてある ひとこと（人が書いた文）は、控えを足しても残るか」を
 * **中身を返さずに**答える（2026-10-20・kp245・f1-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   控えを置く場所は、いま『経理の設定』の ひとこと欄 1つだけです。
 *   そこには じゅんが 2026-09-10 に書いた「数え始めの説明」が入っています。
 *   金庫を数えて押したときに **その説明が上書きで消えないか**——これが
 *   押す前に いちばん気になる所です（2026-10-20 18:04 A の申し送り）。
 *   コードは「印の中だけに書く」作りですが、**外から1回で確かめられる形**にしておきます。
 *
 * ■ どう答えるか
 *   実際に書くのと同じ手順を**試しに1回だけ頭の中でやって**（倉庫には1行も書きません）、
 *   足したあとに ひとことが そのまま残るかを見ます。
 *   **返すのは「入っているか・何文字か・そのまま残るか」だけで、文そのものは返しません**
 *   （確かめ窓口は だれでも読めるため）。
 */
export type NoteKeepPlan = {
  /** 人が書いた ひとこと が入っているか */
  has: boolean;
  /** その文字数（中身は返さない） */
  chars: number;
  /** 控えを足したあとも、ひとことが1文字も消えずに残るか */
  keptExactly: boolean;
  /** 前後の空白・3行以上の空行だけ そろえるか（文は消さない） */
  tidied: boolean;
  /** 人が読む1行 */
  line: string;
};

export function planCashCountNoteKeep(memo: string | null | undefined): NoteKeepPlan {
  const raw = String(memo ?? "");
  const before = stripCashCountMemo(raw);
  // 試し書き（倉庫には1行も書きません）。日付と金額は、結果に影響しない当たり障りのない値
  const next = encodeCashCountMemo(raw, {
    happened_on: "2026-01-01",
    amount: 0,
    saved_at: "1970-01-01T00:00:00.000Z",
  });
  const after = next === null ? "" : stripCashCountMemo(next);
  const keptExactly = next !== null && after === before && next.includes(before);
  const hasBlock = raw.indexOf(CASH_MEMO_BEGIN) >= 0;
  const tidied = !hasBlock && raw !== before;

  if (before === "") {
    return {
      has: false,
      chars: 0,
      keptExactly: true,
      tidied: false,
      line: "ひとことは入っていません（控えの印だけが入ります）。消える文はありません。",
    };
  }

  if (!keptExactly) {
    return {
      has: true,
      chars: before.length,
      keptExactly: false,
      tidied,
      line:
        `ひとこと（${before.length}文字）が、控えを足したあとに そのままの形で残りません。` +
        "金庫を数えてもらう前に、ここを直すこと（文を失うため）。",
    };
  }

  return {
    has: true,
    chars: before.length,
    keptExactly: true,
    tidied,
    line:
      `いま書いてある ひとこと（${before.length}文字）は、控えを足しても1文字も消えません` +
      "（控えは印から印までの中だけに書き、印ごと外せば ひとことだけが残ります）。" +
      (tidied
        ? "前後の空白と3行以上の空行だけ そろえます（文は1文字も消しません）。"
        : ""),
  };
}
