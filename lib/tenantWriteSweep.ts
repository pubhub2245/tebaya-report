/**
 * 「どの店のものか」の印がまだ無い棚に、**新しく書き込む所が増えていないか**を
 * 機械で数える、ただ1か所のファイル（2026-10-27・f3-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   お店が2軒になったとき、よその店の数字が手羽屋に混ざらないようにする工事
 *   （f3-4）は、棚（テーブル）を1つずつ塞いで進めてきました。
 *   ところがこの数え直しを**人が目で**やったため、同じ見落としを2回しています：
 *     ・2026-10-08「印の欄がある棚は全部 済み。残りはシフト1つだけ」
 *       → 10-23 に数え直したら、シフトを読む所が **13ファイル** 残っていた
 *     ・窓口（/api/…）が画面の門をすり抜ける裏口になっていたのを、
 *       10-23（レシート）・10-24（仕込み）・10-25（設営後チェック）と3回に分けて発見
 *   見落としは画面に何も出ないので、次に誰かが数え直すまで分かりません。
 *   そこで**書き込む所の一覧を、試験（npm test）で固定します。**
 *   新しく「印の無い棚へ書き込む所」が増えたら、その場で試験が落ちて名前が出ます。
 *
 * ■ ここが大事（これは「塞ぐ道具」ではありません）
 *   すでに開いている所を閉じる仕事ではなく、**増えたことに気づく**ための道具です。
 *   いま許してある所は下の一覧（ALLOWED_UNSCOPED）に、**なぜ許してよいか**を
 *   1行ずつ書いてあります。許す理由は次の4通りだけです：
 *     ・門あり … よその店だとはっきり名乗ったら断る（lib/tebayaOnlyApi.ts などの判定を通る）
 *     ・管理だけ … 管理の合言葉が無いと呼べない（よその店は持っていない）
 *     ・手羽屋だけの仕組み … 夜のまとめ処理・LINE・訪問数など、お店とは関係しない棚
 *     ・覚え書き … まだ開いているが、どこに書いてあるかを示してある
 *
 * ■ 守ること
 *   ・金額・鍵・合言葉・お店の名前は1文字も持ちません（ファイルの名前と棚の名前だけ）。
 *   ・手羽屋が毎日使う画面（日報・シフト・レジ・LINE）の中身は1行も変えていません。
 */

/**
 * 「どの店のものか」の印（tenant_id）の欄が **ある**棚。
 * ここに入っている棚は applyTenantScope で絞る決まりなので、この道具は数えません
 * （絞り忘れは tests/tenantScope.test.ts や各棚の試験の仕事です）。
 */
export const SCOPED_TABLES: readonly string[] = [
  "daily_reports",
  "locations",
  "staff_members",
  "sale_products",
  "shifts",
  "advance_expenses",
  "keiri_advance_expenses",
  "keiri_settings",
  "keiri_payments",
  "keiri_cash_events",
  "keiri_expense_ignores",
  "keiri_tenants",
  "keiri_applications",
  "keiri_reports",
  "keiri_account_mapping",
];

/** 書き込みのやり方 */
export type WriteOp = "insert" | "upsert" | "update" | "delete";

/** 1件の書き込み（棚の名前が分からないときは table が null） */
export type WriteHit = { table: string | null; op: WriteOp };

/** いま許してある書き込み（path と table の組で1件） */
export type AllowEntry = { path: string; table: string; why: string };

/**
 * いま許してある「印の無い棚への書き込み」。
 * ★ここに足すときは、必ず **なぜ許してよいか** を書くこと。
 *   書けないなら、それは許してよい書き込みではありません。
 */
export const ALLOWED_UNSCOPED: readonly AllowEntry[] = [
  // ── 門あり（よその店だと名乗ったら断る） ─────────────────────────
  {
    path: "app/api/setup-check/create/route.ts",
    table: "setup_checks",
    why: "門あり（lib/tebayaOnlyApi.ts の setup-check）",
  },
  {
    path: "app/api/setup-check/post-line/route.ts",
    table: "setup_checks",
    why: "門あり（lib/tebayaOnlyApi.ts の setup-check-line）",
  },
  {
    path: "app/api/feedback/[id]/replies/route.ts",
    table: "feedback_replies",
    why: "門あり（lib/tebayaOnlyApi.ts の feedback-reply）",
  },
  {
    path: "lib/cancellation/db.ts",
    table: "daily_cancellations",
    why: "門あり（lib/cancellation/scope.ts）。画面の入り口も外してある",
  },
  {
    path: "app/api/prep/save/route.ts",
    table: "prep_sessions",
    why: "門あり（lib/prepScope.ts の decidePrepSave）",
  },
  {
    path: "app/api/prep/save/route.ts",
    table: "prep_session_items",
    why: "門あり（lib/prepScope.ts の decidePrepSave）",
  },
  {
    path: "app/api/prep/save/route.ts",
    table: "prep_reports",
    why: "門あり（lib/prepScope.ts の decidePrepSave）",
  },
  {
    path: "app/api/prep/save/route.ts",
    table: "prep_carryovers",
    why: "門あり（lib/prepScope.ts の decidePrepSave）",
  },

  // ── 管理だけ（管理の合言葉が無いと呼べない／管理画面の中だけ） ──────
  {
    path: "app/api/feedback/[id]/implement/route.ts",
    table: "feedback_box",
    why: "管理だけ（Bearer の合言葉が要る＋FEEDBACK_AI_ENABLED が要る）",
  },
  {
    path: "app/api/feedback/[id]/implement/route.ts",
    table: "feedback_replies",
    why: "管理だけ（同上）",
  },
  {
    path: "app/components/FeedbackBoxAdmin.tsx",
    table: "feedback_box",
    why: "管理だけ（管理画面の中。画面に手羽屋だけの門あり）",
  },
  {
    path: "app/components/FeedbackBoxAdmin.tsx",
    table: "feedback_replies",
    why: "管理だけ（同上）",
  },
  {
    path: "app/components/EditReportModal.tsx",
    table: "daily_report_edits",
    why: "日報1枚の直しの控え。日報の番号で引くので、よその店の行は手羽屋の一覧に出ない",
  },
  {
    path: "app/components/PrepProductManager.tsx",
    table: "prep_products",
    why: "管理だけ（仕込みは入り口を外してある。CLAUDE.md 3）",
  },
  {
    path: "app/components/PrepSettingsManager.tsx",
    table: "prep_settings",
    why: "管理だけ（同上）",
  },
  {
    path: "app/api/admin/reocr-receipts/route.ts",
    table: "table_snapshots",
    why: "管理だけ（手羽屋の昔のレシートを読み直す前の控え）",
  },
  {
    path: "lib/receiptMigration.ts",
    table: "table_snapshots",
    why: "管理だけ（写真を置き場へ移す前の控え）",
  },

  // ── 画面に手羽屋だけの門あり（app/components/TebayaOnlyGate.tsx） ───
  {
    path: "app/agenda/page.tsx",
    table: "agenda_items",
    why: "画面に門あり（TebayaOnlyGate）",
  },
  {
    path: "app/cash/page.tsx",
    table: "cash_settings",
    why: "画面に門あり（TebayaOnlyGate）",
  },
  {
    path: "app/interim/page.tsx",
    table: "interim_reports",
    why: "画面に門あり（TebayaOnlyGate）",
  },
  {
    path: "app/events/EventsView.tsx",
    table: "event_plans",
    why: "画面に門あり（TebayaOnlyGate）",
  },
  {
    path: "app/feedback/new/page.tsx",
    table: "feedback_box",
    why: "画面に門あり（TebayaOnlyGate）",
  },

  // ── 手羽屋だけの仕組み（お店とは関係しない棚） ────────────────
  {
    path: "app/api/cron/calculate-achievement-rates/route.ts",
    table: "achievement_rates",
    why: "手羽屋だけの仕組み（夜のまとめ処理。外から呼ぶには CRON の合言葉が要る）",
  },
  {
    path: "app/api/cron/calculate-achievement-rates/route.ts",
    table: "achievement_rate_calculations",
    why: "手羽屋だけの仕組み（同上）",
  },
  {
    path: "app/api/cron/notify-weather/route.ts",
    table: "weather_alerts",
    why: "手羽屋だけの仕組み（同上）",
  },
  {
    path: "app/api/line/webhook/route.ts",
    table: "line_groups",
    why: "手羽屋だけの仕組み（スタッフ向けBotのグループ。CLAUDE.md 4-16）",
  },
  {
    path: "app/api/line/customer/webhook/route.ts",
    table: "customer_line_messages",
    why: "手羽屋だけの仕組み（お客さん向け公式LINE。CLAUDE.md 4-16）",
  },
  {
    path: "app/api/line/customer/webhook/route.ts",
    table: "customer_line_events",
    why: "手羽屋だけの仕組み（同上）",
  },
  {
    path: "app/api/hit/route.ts",
    table: "site_visits",
    why: "手羽屋だけの仕組み（訪問の数。お店の数字ではない）",
  },
  {
    path: "lib/backup.ts",
    table: "table_snapshots",
    why: "手羽屋だけの仕組み（毎日の控え。CLAUDE.md 4-6）",
  },
  {
    path: "lib/limitedProduct.ts",
    table: "monthly_limited_products",
    why: "手羽屋だけの仕組み（月替わりの限定商品。読む所は lib/limitedProductScope.ts で絞る）",
  },

  // ── 覚え書き（まだ開いている。どこに書いてあるかを示す） ──────────
  {
    path: "lib/locationRankUpdate.ts",
    table: "location_rank_history",
    why: "決めてから書く（lib/locationRankScope.ts の decideRankAutoJudge。よその店は判定しない）",
  },
  {
    path: "lib/venueInquiries.ts",
    table: "venue_inquiries",
    why: "覚え書き：この棚にはまだ印の欄が無い（司令室 kp242 の『門は外していません』の所）",
  },
];

/** 数えた結果（許してある一覧に無かった書き込み） */
export type Finding = { path: string; table: string | null; op: WriteOp };

const OPS: readonly WriteOp[] = ["insert", "upsert", "update", "delete"];

/**
 * ソース1枚から「棚への書き込み」を拾う。
 *
 * ■ 数え方（取り違えないために）
 *   `.from("棚")` を見つけたら、**次の `.from(` が出てくるまで**のあいだに
 *   `.insert(` `.upsert(` `.update(` `.delete(` があるかを見ます。
 *   区切りを置かないと、すぐ下の別の文の書き込みを取り違えます。
 *   `.storage.from(` は写真の置き場なので数えません（棚ではありません）。
 */
export function findTableWrites(source: string): WriteHit[] {
  const hits: WriteHit[] = [];
  const from = /\.from\(\s*("([a-z_0-9]+)"|[A-Za-z_$][A-Za-z_0-9$]*)\s*\)/g;
  const marks: { at: number; end: number; table: string | null }[] = [];
  let m: RegExpExecArray | null;
  while ((m = from.exec(source))) {
    const before = source.slice(Math.max(0, m.index - 9), m.index);
    if (before.endsWith(".storage")) continue;
    marks.push({ at: m.index, end: m.index + m[0].length, table: m[2] ?? null });
  }
  marks.forEach((mark, i) => {
    const until = i + 1 < marks.length ? marks[i + 1].at : source.length;
    const chunk = source.slice(mark.end, until);
    for (const op of OPS) {
      if (new RegExp(`\\.\\s*${op}\\s*\\(`).test(chunk)) {
        hits.push({ table: mark.table, op });
        break;
      }
    }
  });
  return hits;
}

/** その書き込みを許してあるか */
export function isAllowed(path: string, table: string | null): boolean {
  if (table === null) return true; // 棚の名前が文字で書かれていない＝この道具では判定しない
  if (SCOPED_TABLES.includes(table)) return true;
  return ALLOWED_UNSCOPED.some((a) => a.path === path && a.table === table);
}

/** 何枚ものソースをまとめて数える。返るのは「許してある一覧に無かったもの」だけ */
export function sweepFiles(
  files: readonly { path: string; source: string }[],
): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    for (const hit of findTableWrites(f.source)) {
      if (isAllowed(f.path, hit.table)) continue;
      if (out.some((o) => o.path === f.path && o.table === hit.table)) continue;
      out.push({ path: f.path, table: hit.table, op: hit.op });
    }
  }
  return out;
}

/** 落ちたときに画面（試験の答え）に出す1文。やさしい言葉で、やることまで書く */
export function describeFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) return "印の無い棚への新しい書き込みはありません";
  const lines = findings.map((f) => `・${f.path} → ${f.table}（${f.op}）`);
  return [
    `「どの店のものか」の印がまだ無い棚へ、新しく書き込む所が ${findings.length} か所 増えました。`,
    ...lines,
    "",
    "お店が2軒になると、よその店が入れた行が手羽屋の記録に混ざり、",
    "印の欄が無いのであとから見分けることもできません（f3-4）。",
    "次のどれかをしてください：",
    "① 棚に「どの店のものか」の欄を足して applyTenantScope で絞る（いちばん良い）",
    "② よその店だと名乗ったら断る門を付ける（lib/tebayaOnlyApi.ts と同じ形）",
    "③ 本当に手羽屋だけの仕組みなら、lib/tenantWriteSweep.ts の一覧に",
    "　 **なぜ許してよいか**を1行 書いて足す",
  ].join("\n");
}
