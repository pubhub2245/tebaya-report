import { NextResponse, type NextRequest } from "next/server";

import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { buildOneSheet } from "@/lib/keiri/oneSheet";
import { readIgnoreMarks } from "@/lib/keiri/expenseIgnores";
import { ignoreStoreOf } from "@/lib/keiri/expenseIgnoreMemo";
import { findDuplicateReports } from "@/lib/keiri/duplicates";
import { readReportDupMarks } from "@/lib/keiri/reportDups";
import { findResavedReportDups } from "@/lib/keiri/reportResave";
import {
  buildReportDupWindow,
  simulateCountOnceMarks,
} from "@/lib/keiri/reportDupWindow";
import { buildSelfCheck, unreadableSelfCheck } from "@/lib/keiri/selfCheck";
import { previousMonthRange, CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { templateFor } from "@/lib/keiri/index";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { monthParamWindow, readMonthParam, type MonthParam } from "@/lib/keiri/monthParam";
import {
  CASH_COUNT_KIND_LABEL,
  cashCountKind,
  cashCountMatched,
  latestCount,
  reconcileCash,
} from "@/lib/keiri/cashCheck";
import { calcCashPosition } from "@/lib/keiri/aggregate";
import {
  cashCountNeedsSheetFirst,
  cashShelfNote,
  cashShelfState,
} from "@/lib/keiri/cashShelfNote";
import {
  buildCashVariants,
  cashVariantWindow,
  pickCashVariant,
} from "@/lib/keiri/cashVariant";
import {
  latestRegisterFloat,
  registerFloatWindow,
} from "@/lib/keiri/registerFloat";
import { depositsOf } from "@/lib/keiri/cashCheck";
import { advanceReturnGapWindow } from "@/lib/keiri/advanceReturnGap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/selfcheck
 *
 * 「前の月の締めが、人の手を借りずに正しく出たか」を外から確かめる窓口（f1-5・f1-2）。
 *
 * ★本物のデータで、**本物と同じ関数**（buildOneSheet）に1枚を作らせ、
 *   その検算の結果（○／×）だけを返します。
 * ★1行も書き込みません。金額・お店の名前・連絡先・鍵の値は1文字も返しません。
 * ★手羽屋が毎日使う画面（日報・シフト・レジ・LINE）には触れていません。
 *
 * ■ 月を指定できます（2026-10-09・検査役 B2 の気づきから）
 *   `?ym=2026-08` のように付けると、**その月**で締め直して答えます。
 *   付けなければ今までどおり**前の月**です。
 *   それまでは何月を指定しても前の月の答えが返っていたため、
 *   外からは「今月ぶんや、もっと前の月が正しく締まるか」を確かめられませんでした。
 */
export async function GET(req: NextRequest) {
  // ★月の指定は1か所で受け取る（2026-11-10・f1-5／f1-2）。
  //   鍵の名前を間違えて ?month=2026-09 と書かれても、**黙って前の月で答えない**
  //   （答える月は今までどおりでも、「ちがう月の答えです」と必ず知らせる）。
  const { start } = previousMonthRange(new Date());
  const monthParam = readMonthParam(req.nextUrl.searchParams, start.slice(0, 7));
  const ym = monthParam.ym;
  const label = monthLabelOf(ym);
  try {
    // fresh ＝ 前の答えをためずに毎回 取りに行く（2026-11-06・f1-5）。
    // ためた答えを使うと、倉庫が止まっている日に**古い月の答え**がそのまま返ります。
    const data = await loadKeiriMonthServer({
      ym,
      businessCode: CASE_BUSINESS_CODE,
      fresh: true,
    });
    if (data.reportsUnreadable) {
      return jsonWindow(
        unreadableSelfCheck({ month: label, ym, reason: "日報の棚が読めませんでした" }),
        monthParam,
      );
    }
    if (data.advancesUnreadable) {
      return jsonWindow(
        unreadableSelfCheck({
          month: label,
          ym,
          reason: "立て替えて払った経費の棚が読めませんでした（経費がまるごと落ちるので数えません）",
        }),
        monthParam,
      );
    }
    if (data.reports.length === 0) {
      return jsonWindow(
        unreadableSelfCheck({ month: label, ym, reason: "その月の日報が1件もありません" }),
        monthParam,
      );
    }

    const marks = readIgnoreMarks(data.ignores);
    // 「同じ日報が2枚」の決めごと（2026-11-03・kp246・f1-5）。
    // 1件も無ければ空＝今までとまったく同じ数字になります。
    const reportDupMarks = readReportDupMarks(data.reportDups ?? []);
    const sheet = buildOneSheet({
      ym,
      monthLabel: label,
      shopName: "",
      reports: data.reports,
      payments: data.payments,
      advances: data.advances,
      settings: data.settings,
      template: templateFor(CASE_BUSINESS_CODE),
      cashEvents: data.cashEvents,
      // 「同じ支払いが2か所にある」ときに人が決めた印（kp230）。
      // 棚がまだ無い倉庫では空なので、数字は今までどおり。
      ignoreMarks: marks,
      reportDupMarks,
    });

    /**
     * 「同じ日報が2枚」を押して片付けられるか（2026-11-03・kp246・f1-5）。
     * ★金額は1円も返しません（件数と○×だけ）。**1行も書き込みません。**
     *   「もし1枚だけ数えるを選んだら」は、押したのではなく**計算してみせている**だけです。
     */
    const sameReportCheck = findDuplicateReports({ ym, reports: data.reports });
    const sameReportStore = ignoreStoreOf({
      // 置き場（専用の棚）はまだ無いので、いまは「ひとこと欄の控え」で決めます。
      // ★経費の二重と同じ関数で決めるので、画面の見え方と窓口の答えがずれません。
      shelf: "missing",
      settingsRowExists: !data.settingsMissing,
    });
    const simulated =
      sameReportCheck.groups.length > 0
        ? buildOneSheet({
            ym,
            monthLabel: label,
            shopName: "",
            reports: data.reports,
            payments: data.payments,
            advances: data.advances,
            settings: data.settings,
            template: templateFor(CASE_BUSINESS_CODE),
            cashEvents: data.cashEvents,
            ignoreMarks: marks,
            reportDupMarks: simulateCountOnceMarks(sameReportCheck, reportDupMarks),
          })
        : null;

    // 「同じ支払いが2か所にある」ときに、どちらを数えるかを決められる状態か（kp230・f1-5）。
    // ★金額は1円も返しません。返すのは「置き場があるか」と「決めた件数」だけです。
    const marked = marks.ignored.size + marks.bothCounted.size;
    // 決めた内容をどこに残せるか（棚／ひとこと欄の控え／残せない）。
    // ★画面と同じ関数で決めるので、窓口の答えと画面の見え方がずれません。
    const duplicateStore = ignoreStoreOf({
      shelf: data.ignoreShelf,
      settingsRowExists: !data.settingsMissing,
    });
    return jsonWindow({
      ...buildSelfCheck({ month: label, ym, sheet }),
      // 金庫を数えた記録と、計算上の現金が合っていたか（2026-10-11・f1-4）。
      // ★金額は1円も返しません。返すのは「記録があるか」と「5通りのどれか」だけです。
      cashCount: cashCountOf(data),
      // 金庫の数え方が2通りに分かれているか（2026-10-12・kp250・f1-4）。
      // ★金額は1円も返しません。返すのは行数と「分かれているか」だけです。
      cashVariants: cashVariantWindow({
        extraRows: (data.advancesRepaidEarlier ?? []).map((a) => ({
          settledInMonth: String(a.settledDate ?? "").startsWith(ym),
        })),
        readable: !data.advancesUnreadable && !data.advancesSkipped,
      }),
      // 会計ソフト向けの表には出るのに、金庫からは引かない返金が何行あるか
      // （2026-10-16・kp254・f1-7／f1-4）。
      // ★金額は1円も返しません。返すのは行数と「食い違っているか」だけです。
      advanceReturnGap: advanceReturnGapWindow({
        ym,
        openingDate: String(data.settings.opening_date ?? ""),
        advances: data.advances,
        readable: !data.advancesUnreadable && !data.advancesSkipped,
      }),
      // レジに残してあるつり銭（金庫の外のお金）を見分けられる状態か（2026-10-12・f1-4）。
      // ★金額は1円も返しません。返すのは号車の数・最後の日・相手の数だけです。
      registerFloat: registerFloatOf(data),
      // 同じ日報が2枚 入っているときに、押して片付けられるか（2026-11-03・kp246・f1-5）
      sameReportMarks: buildReportDupWindow({
        check: sameReportCheck,
        marks: reportDupMarks,
        store: sameReportStore,
        ifCountedOnce: simulated,
        // ★機械が「同じ日の入れ直し」とみて、押さずに1枚だけ数えた組（2026-11-03・kp273）
        resaved: findResavedReportDups({
          check: sameReportCheck,
          reports: data.reports,
          marks: reportDupMarks,
        }),
      }),
      duplicateMarks: {
        shelf: data.ignoreShelf,
        decided: marked,
        // どこに残せるか（2026-10-22・kp230・f1-5）。
        // ★棚がまだ無くても、経理の設定のひとこと欄に控えて先に決められます
        //   （金庫を数えた1回で先にうまくいった形と同じ）。
        store: duplicateStore,
        shelfNote:
          duplicateStore === "shelf"
            ? "決めた内容を残す置き場があります（画面で押して片付けられます）"
            : duplicateStore === "memo"
              ? "決めた内容を残す置き場（keiri_expense_ignores）はまだありませんが、経理の設定のひとこと欄に控えるので、いま画面で押して片付けられます（貼り紙②を待ちません）"
              : data.ignoreShelf === "missing"
                ? "決めた内容を残す置き場がまだありません（/keiri/sql の貼り紙②を1回 流すと使えます）。いまは疑いを出すだけです"
                : "置き場があるか確かめられませんでした（今までどおり、疑いを出すだけにしています）",
      },
    }, monthParam);
  } catch {
    return jsonWindow(
      unreadableSelfCheck({ month: label, ym, reason: "倉庫との通信に失敗しました" }),
      monthParam,
    );
  }
}

/**
 * 「金庫を数えた記録があるか、あれば合っていたか」を外から確かめられる形にする
 * （2026-10-11・f1-4）。
 *
 * ■ なぜ要るのか
 *   f1-4 の合否は「今の現金残高が、実際の金庫の残高と合うか」です。ところが
 *   じゅんが数えて入れる所は合言葉の内側なので、**入れたかどうかも、合ったかどうかも、
 *   外からは一度も分かりませんでした**（2026-10-11 の検査でも『じゅん待ち』のまま）。
 *   そこで金額を出さずに、記録の件数と「5通りのどれか」だけを返します。
 *
 * ■ 月は関係ありません（?ym= を変えても答えは同じ）。
 *   突き合わせは「最後に数えた日」で行うものなので、見ている月では動きません。
 *
 * ★返すのは件数・日付・5通りのどれか だけ。金額は1円も返しません。
 */
function cashCountOf(data: Awaited<ReturnType<typeof loadKeiriMonthServer>>) {
  const events = data.cashEvents ?? [];
  const counts = events.filter((e) => e.kind === "count").length;
  const deposits = events.filter((e) => e.kind === "deposit").length;
  const last = latestCount(events);
  const computedAtCount = last
    ? calcCashPosition({
        reports: data.reports ?? [],
        payments: data.payments ?? [],
        settings: data.settings,
        advances: data.advances ?? [],
        deposits: depositsOf(events),
        asOf: last.happened_on,
      }).balance
    : null;
  const r = reconcileCash({
    events,
    computedAtCount,
    today: new Date().toISOString().slice(0, 10),
  });
  const kind = cashCountKind(r);
  // ★数えた金額が「どの数え方」に合ったかも返す（2026-10-12・f1-4）。
  //   金庫だけを数えた／前の月に返した分を引く——どちらも「合っている」のに、
  //   kind だけ見ると「金庫のほうが少ない」に見えてしまい、外から見ると不合格に見える。
  const pick =
    last && computedAtCount !== null
      ? pickCashVariant({
          variants: buildCashVariants({
            screenBalance: computedAtCount,
            withRepaidBalance: withRepaidBalanceAsOf(data, last.happened_on),
            registerFloat: data.registerUnreadable
              ? 0
              : latestRegisterFloat(data.registerCloses ?? [], last.happened_on).total,
          }),
          counted: last.amount,
        })
      : null;
  const variantMatched = pick?.matched ?? null;
  return {
    shelf: cashShelfState(data.cashShelfMissing),
    /**
     * ★2026-11-12（B・f1-4）：この1行は **じゅんの順番を1つ逆にしていました。**
     *   「いまは画面で比べるところまでしかできません」と書いてあったので、
     *   読んだ側が「貼り紙（2分）を先に貼らないと金庫を数えても残らない」と受け取り、
     *   金庫（1分）が後ろに並べられていました。実際は控えの道が動いていて、
     *   **貼り紙を1枚も貼っていなくても、数えればその場で合否が出ます。**
     *   言い方は lib/keiri/cashShelfNote.ts の1か所だけ（試験で固定）。
     */
    shelfNote: cashShelfNote(data.cashShelfMissing),
    /** 金庫を数える前に貼り紙を流す必要があるか（＝どちらの道でも false） */
    needsSheetFirst: cashCountNeedsSheetFirst(data.cashShelfMissing),
    countRecords: counts,
    depositRecords: deposits,
    latestCountOn: last?.happened_on ?? null,
    daysSinceCount: r.daysSince,
    kind,
    kindLabel: CASH_COUNT_KIND_LABEL[kind],
    // ★どの数え方に合ったか（合わなければ null）。金額ではなく名前だけを返す
    variantMatch: variantMatched ? variantMatched.key : null,
    variantMatchLabel: variantMatched ? variantMatched.label : null,
    /**
     * 合っていたか。**数え方のちがいで説明がついた場合も「合った」**とします
     * （金庫だけを数えた／前の月に返した分を引く、は どちらも合っている状態です）。
     * ★まだ1回も数えていない日は **null**（合格にも不合格にもしません。2026-11-11）。
     */
    matched: cashCountMatched(kind, variantMatched !== null),
    /** matched の読み方（人が読む1行・2026-11-11・f1-4） */
    matchedMeans:
      kind === "none"
        ? "まだ金庫を1回も数えていないので、合否は付けていません（null）。" +
          "**合っているという意味でも、合っていないという意味でもありません。** " +
          "f1-4 の合否は /api/keiri/cashcount の ok を見てください。"
        : cashCountMatched(kind, variantMatched !== null)
          ? "数えた結果は合っている側です（数え方のちがいで説明がついた場合も含みます）。"
          : "数えた結果が合っていません（差に名前が付いていません）。",
    note:
      "金額は1円も返していません（記録の件数・最後に数えた日・5通りのどれか・合った数え方の名前 だけ）。" +
      "見ている月を変えても、この答えは変わりません（突き合わせは最後に数えた日で行うため）。" +
      "変わった数え方で合ったときは variantMatch にその名前が入ります（＝合っています）。" +
      "**matched が null のときは、まだ数えていないので合否を付けないでください。**",
  };
}

/** 「前の月に立て替えて、この期間に返した分も引く」側の、その日の時点の残高 */
function withRepaidBalanceAsOf(
  data: Awaited<ReturnType<typeof loadKeiriMonthServer>>,
  asOf: string,
): number | null {
  const repaid = data.advancesRepaidEarlier ?? [];
  if (repaid.length === 0) return null;
  return calcCashPosition({
    reports: data.reports ?? [],
    payments: data.payments ?? [],
    settings: data.settings,
    advances: [...(data.advances ?? []), ...repaid],
    deposits: depositsOf(data.cashEvents ?? []),
    asOf,
  }).balance;
}

/**
 * 「レジに残してあるつり銭を見分けられるか」を外から確かめられる形にする
 * （2026-10-12・f1-4）。
 *
 * ■ なぜ要るのか
 *   じゅんにお願いしているのは「**金庫**を数える」ことですが、お金の置き場は
 *   金庫だけではありません。閉店のときレジには翌日のつり銭が号車ごとに残っています。
 *   「合う」の線は1,000円 未満なので、黙っていると**合っているのに**
 *   「金庫のほうが少ないです。書き忘れた支払いを探してください」と出てしまいます。
 *   そこで比べる相手にその分を引いた金額も並べ、画面がどれに合うかを名指しします。
 *
 * ★返すのは号車の数・最後に数えた日・相手の数だけ。金額は1円も返しません。
 */
function registerFloatOf(data: Awaited<ReturnType<typeof loadKeiriMonthServer>>) {
  const readable = !data.registerUnreadable;
  const float = latestRegisterFloat(data.registerCloses ?? []);
  // 画面に並ぶ「比べる相手」の数だけを数える（金額は外に出さない）
  const screen = calcCashPosition({
    reports: data.reports ?? [],
    payments: data.payments ?? [],
    settings: data.settings,
    advances: data.advances ?? [],
    deposits: depositsOf(data.cashEvents ?? []),
  }).balance;
  const repaid = data.advancesRepaidEarlier ?? [];
  const withRepaid =
    repaid.length > 0
      ? calcCashPosition({
          reports: data.reports ?? [],
          payments: data.payments ?? [],
          settings: data.settings,
          advances: [...(data.advances ?? []), ...repaid],
          deposits: depositsOf(data.cashEvents ?? []),
        }).balance
      : null;
  const targets = buildCashVariants({
    screenBalance: screen,
    withRepaidBalance: withRepaid,
    registerFloat: readable ? float.total : 0,
  }).length;
  return registerFloatWindow({ float, readable, variantTargets: targets });
}

/**
 * 「2026年9月」の形の見出し。
 * ★前の月のときの書き方（previousMonthRange の label）と同じ形にそろえてあります。
 */
function monthLabelOf(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return `${Number(m[1])}年${Number(m[2])}月`;
}

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
function jsonWindow(body: unknown, monthParam?: MonthParam): NextResponse {
  const withMonth =
    monthParam && typeof body === "object" && body !== null
      ? { ...(body as object), monthParam: monthParamWindow(monthParam) }
      : body;
  return NextResponse.json(stampCheckWindow(withMonth), {
    status: 200,
    headers: CHECK_WINDOW_HEADERS,
  });
}
