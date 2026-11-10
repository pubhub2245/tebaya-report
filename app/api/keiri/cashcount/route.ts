import { NextResponse } from "next/server";

import { calcCashPosition } from "@/lib/keiri/aggregate";
import { depositsOf, latestCount, reconcileCash } from "@/lib/keiri/cashCheck";
import {
  buildCashCountReady,
  buildCashCountWindow,
  cashCountNotMeasurable,
  cashCountOk,
  type CashCountPlace,
} from "@/lib/keiri/cashCountWindow";
import {
  buildCashBooksGapWindow,
  measureBooksGap,
} from "@/lib/keiri/cashBooksGap";
import {
  booksGapDates,
  EMPTY_CASH_BOOKS_GAP_OPEN,
  measureBooksGapOpen,
  type CashBooksGapOpen,
} from "@/lib/keiri/cashBooksGapOpen";
import {
  buildRegisterDiffGapWindow,
  measureRegisterDiffGap,
} from "@/lib/keiri/registerDiffGap";
import {
  buildFieldRepayGapWindow,
  measureFieldRepayGap,
} from "@/lib/keiri/advanceFieldRepayGap";
import {
  buildUnpaidPayrollGapWindow,
  measureUnpaidPayrollGap,
} from "@/lib/keiri/unpaidPayrollGap";
import {
  buildCashDiffCoverageWindow,
  fieldRepayPiece,
  measureCashDiffCoverage,
  openingExpensesPiece,
  registerDiffPiece,
  unpaidPayrollPiece,
} from "@/lib/keiri/cashDiffCoverage";
import {
  buildCashShopScopeWindow,
  measureCashShopScope,
} from "@/lib/keiri/cashShopScope";
import { buildCashOpeningSource } from "@/lib/keiri/cashOpeningSource";
import {
  buildCashOpeningGapWindow,
  EMPTY_CASH_OPENING_GAP,
  expensesBeforeOpening,
} from "@/lib/keiri/cashOpeningGap";
import { buildCashCountPress } from "@/lib/keiri/cashCountPress";
import { planCashCountNoteKeep, type NoteKeepPlan } from "@/lib/keiri/cashCountMemo";
import { buildCashVariants, pickCashVariant } from "@/lib/keiri/cashVariant";
import { CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { defaultSettingsFor } from "@/lib/keiri/index";
import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { latestRegisterFloat } from "@/lib/keiri/registerFloat";
import { anonClient, serverClient } from "@/lib/supabaseServer";
import { probeWarehouseAlive } from "@/lib/keiri/warehouseAlive";
import { probeShiftsTenantState, scopeShiftsQuery } from "@/lib/shiftScope";
import { TEBAYA_SCOPE } from "@/lib/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/cashcount
 *
 * 「金庫を数えた結果が、計算上の現金と合っていたか」を外から1回で確かめる窓口（f1-4）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   じゅんが金庫を数えて金額を入れると、画面には合否が出ます。ところが
 *   じゅんの経理の画面は合言葉の内側で、こちら（Claude）からは開けません。
 *   ＝ 入れてもらっても「合っていたか」をこちら側で確かめられず、
 *   仕上げチェック表の f1-4 に合否を付けられませんでした。
 *   この窓口は、その1点だけを答えます。
 *
 * ■ 返さないもの（ここが大事）
 *   **金額は1円も返しません**（計算上の現金・数えた金額・差のどれも）。
 *   返すのは「合っていたか」「差が1,000円より小さいか」「どの数え方に合ったか」
 *   「数えた日」だけです。合言葉・鍵・お店の名前は1文字も返しません。
 *
 * ■ 1行も書き込みません。手羽屋が毎日使う画面（日報・シフト・レジ・LINE）にも触れません。
 */
export async function GET() {
  const today = new Date();
  const todayJst = todayStr(today);
  const ym = todayJst.slice(0, 7);

  try {
    // ★fresh ＝ ためた答えを使わず、毎回 倉庫へ取りに行く（2026-11-10・f1-4）。
    //   これが無いと、**前に読んだ古い日報のまま**合否を答えます。
    //   2026-11-10 の朝、11月の日報が4枚 入ったあとも この窓口だけが
    //   「日報は10月31日まで・10日 空き」と答え続けていました
    //   （同じ読み方をする /api/keiri/selfcheck は fresh 付きで4枚 見えていた）。
    //   金庫の合否を測る窓口が古い日報で答えると、**じゅんが数えた1分が無駄になります**。
    const db = serverClient({ fresh: true });

    /**
     * ⓪ 対照：**同じつなぎ方**で手羽屋の行が1件でも見えるか（2026-11-08・f1-4）。
     *   見えなければ「測れません」で返し、月の数字は読みに行きません。
     *   ★ここが無いと、倉庫が眠っている日に ok: false ＝
     *     **金庫と合っていない（不合格）**と読める答えを返します。
     */
    const warehouse = await probeWarehouseAlive(db as never);
    if (!warehouse.alive) {
      return json({
        ...cashCountNotMeasurable(warehouse.reason),
        warehouse: { alive: false, state: warehouse.state, reason: warehouse.reason },
      });
    }

    // 手羽屋ぶんを、画面と同じ読み方（サーバー側の窓口が使う道）で読む
    const data = await loadKeiriMonthServer({
      ym,
      businessCode: CASE_BUSINESS_CODE,
      scope: TEBAYA_SCOPE,
      monthOnly: false,
      db,
    });
    if (data.reportsUnreadable) {
      // ★読めなかっただけ＝「合っていない」ではありません（0件とも取り違えないこと）
      return json({
        ...cashCountNotMeasurable("日報の棚を読めませんでした（0件と取り違えないこと）"),
        warehouse: { alive: warehouse.alive, state: warehouse.state, reason: warehouse.reason },
      });
    }

    const settings = data.settingsMissing
      ? defaultSettingsFor(CASE_BUSINESS_CODE)
      : data.settings;
    const deposits = depositsOf(data.cashEvents);
    const last = latestCount(data.cashEvents);

    const balanceAt = (date: string, withRepaid: boolean): number =>
      calcCashPosition({
        reports: data.reports,
        payments: data.payments,
        settings,
        advances: withRepaid
          ? [...data.advances, ...(data.advancesRepaidEarlier ?? [])]
          : data.advances,
        deposits,
        asOf: date,
      }).balance;

    const computedAtCount = last ? balanceAt(last.happened_on, false) : null;
    const reconcile = reconcileCash({
      events: data.cashEvents,
      computedAtCount,
      today: todayJst,
    });

    const repaidRows = data.advancesRepaidEarlier ?? [];

    // 数え方が2通りに分かれている月だけ、どちらに合ったかも出す（kp250）
    let pick: ReturnType<typeof pickCashVariant> | null = null;
    if (last) {
      const variants = buildCashVariants({
        screenBalance: computedAtCount,
        withRepaidBalance: repaidRows.length > 0 ? balanceAt(last.happened_on, true) : null,
        registerFloat: latestRegisterFloat(data.registerCloses ?? [], last.happened_on).total,
      });
      const p = pickCashVariant({ variants, counted: last.amount });
      pick = p.hasChoice ? p : null;
    }

    // ★数える前でも「いま数えてもらえば合否が出るか」を答える（2026-10-16・kp245）。
    //   金額は1円も出さない（相手の名前と数だけ）。
    // ★「日報がどこまで入っているか」（2026-11-01・f1-4）。
    //   日報がまだ入っていない営業日があると、その分だけ計算上の現金がずれます。
    //   数えた日に揃えて数え（まだ数えていなければ今日）、**金額は1円も返しません**
    //   （日付・件数・日数と、ひとことだけ）。
    const booksGap = measureBooksGap({
      reports: data.reports,
      asOf: last ? last.happened_on : todayJst,
    });
    // 数える前の用意にも、同じ答えを渡す（今日に揃えて見る）
    const booksGapToday = measureBooksGap({ reports: data.reports, asOf: todayJst });

    // ★「日報に入っている レジの過不足」（2026-11-04・f1-4）。
    //   この分は「計算上の現金」に入れていないので、必ずそのぶん食い違います。
    //   **金額は1円も返しません**（読めたか・件数・向きだけ）。
    const regDiffGap = measureRegisterDiffGap({
      rows: data.registerDiffs ?? null,
      openingDate: data.settingsMissing ? "" : (settings.opening_date ?? ""),
      asOf: last ? last.happened_on : todayJst,
    });

    // ★「現場スタッフが立て替えた分」（2026-11-04・f1-4）。
    //   お返しした日に金庫からお金が出ますが、現場ぶんの立替には「お返しした」を
    //   残す欄がまだ無いので（CLAUDE.md 5-4 の残課題）、計算上の現金から引けていません。
    //   そのぶん金庫のほうが少なく出るので、差の内わけとして名前を付けて出します。
    //   **金額は1円も返しません**（読めたか・件数・日付・説明がどこまでつくかだけ）。
    const fieldRepayGap = measureFieldRepayGap({
      advances: data.advances,
      // 読めなかった・そもそも読んでいない（手羽屋いがいのお店）ときは「0件」と言わない
      unreadable: data.advancesUnreadable || data.advancesSkipped,
      openingDate: data.settingsMissing ? "" : (settings.opening_date ?? ""),
      asOf: last ? last.happened_on : todayJst,
    });

    // ★「日当のうち、まだ払った記録が無い分」（2026-11-05・f1-4）。
    //   「計算上の現金」から引いているのは**払った記録がある分だけ**で、日報の日当は
    //   「まだ払っていないお金」として別に置いてあります（この数え方そのものは正しい）。
    //   ところが払った記録を付けずに金庫のお金からお渡ししていると、そのぶん
    //   金庫のほうが少なく出ます。日当は営業日ごとに付くので、ここは**ほかの内わけより
    //   ずっと大きくなりえます**。差の内わけとして名前を付けて出します。
    //   **金額は1円も返しません**（読めたか・件数・日付・説明がどこまでつくかだけ）。
    const unpaidPayrollGap = measureUnpaidPayrollGap({
      reports: data.reports,
      payments: data.payments,
      openingDate: data.settingsMissing ? "" : (settings.opening_date ?? ""),
      asOf: last ? last.happened_on : todayJst,
    });

    // ★「どの屋号の日報から数えているのか」（2026-11-04・f1-4）。
    //   金庫は1つとして数えるので、手羽屋ともも屋を分けていません
    //   （lib/keiri/cashCheck.ts の決まり①）。＝ 売上も経費も立替も両方の屋号ぶんが入ります。
    //   ここを外から読めるようにしておくと、「売上だけ片方の屋号を除いている」という
    //   取り違えを、読むだけで確かめられます。
    //   **金額も屋号の名前も返しません**（読めたか・屋号がいくつか・件数だけ）。
    const shopScope = measureCashShopScope({
      reports: data.reports,
      unreadable: data.reportsUnreadable,
      openingDate: data.settingsMissing ? "" : (settings.opening_date ?? ""),
      asOf: last ? last.happened_on : todayJst,
    });

    // ★「日報が空いている日は、営業した日なのか お休みなのか」（2026-11-09・f1-4）。
    //   空きがあるだけで、差の内わけは「分からない所がある」として合否を付けません
    //   （covered を null）。＝ **空きの正体が お休みだけでも、じゅんが金庫を数えても
    //   f1-4 の合否が出ません。** 出店の予定（shifts）を読んで、空きの正体を名指しします。
    //   **読むだけ**です（1行も書き込みません・金額も店名も担当者の名前も返しません）。
    /**
     * ここから下の4つの読みを**同時に**走らせる（2026-11-10・f1-4）。
     *
     * ■ なぜ直したか（やさしい説明）
     *   この窓口は倉庫に **5回** 聞きます（月の数字／空いている日の出店予定／
     *   毎日の現金画面の数え始め／控えを置く行／数え始めの月の経費）。
     *   その後ろの4回を**1つずつ順番に**待っていたので、ぜんぶ終わるまで
     *   **10〜15秒** かかっていました。外から読む道具の待ち時間はたいてい10秒なので、
     *   **答えが出ているのに「サーバー側の誤り」に見えます**
     *   （2026-11-10 13:0x に A が2回つづけてそれに当たり、f1-4 を測る道が閉じました）。
     *   4つは**おたがいの答えを必要としない**ので、同時に頼めば待ち時間は1回ぶんです。
     *
     * ■ 答えは1つも変えていません。読む関数・引数は1文字も変えず、順番だけを変えました。
     */
    const [booksGapOpen, openingSourceRead, memoProbe, openingGap] = await Promise.all([
      // 空いている日は、営業した日か お休みか（件数と日付だけ）
      readBooksGapOpen({
        lastDate: booksGapToday.lastDate,
        asOf: todayJst,
        wide: booksGapToday.wide,
        db,
      }),
      // 手羽屋が毎日使う現金の画面が読む棚の「数え始めの日」だけ
      readDailyScreenOpening(db),
      // いま押したら、ちゃんと記録に残るか（控えを置く行が公開の鍵で読めるか）
      probeMemoRow(data.cashShelfMissing),
      // 数え始めの日より前に払った経費（件数と日付だけ）
      readOpeningGap({
        openingDate: data.settingsMissing ? null : (settings.opening_date ?? null),
        ym,
        reports: data.reports,
        db,
      }),
    ]);

    const floatToday = latestRegisterFloat(data.registerCloses ?? [], todayJst);
    const ready = buildCashCountReady({
      booksGap: booksGapToday,
      gapOpen: booksGapOpen,
      variants: buildCashVariants({
        screenBalance: data.settingsMissing ? null : balanceAt(todayJst, false),
        withRepaidBalance:
          !data.settingsMissing && repaidRows.length > 0 ? balanceAt(todayJst, true) : null,
        registerFloat: floatToday.total,
      }),
      registerFloatOn: floatToday.latestOn,
    });

    // 記録がどこにあるか（置き場／おまけ欄の控え）。金額は見ません
    const place: CashCountPlace | null = last ? (data.cashShelfMissing ? "控え" : "棚") : null;

    // ★「どの数え始めと比べているのか」を外にも出す（2026-10-19・f1-4）。
    //   数え始めの記録は倉庫に2か所あり（経理＝keiri_settings／手羽屋の毎日の画面＝cash_settings）、
    //   どちらを読むかで「今の現金」が丸ごと変わります。経理が読むのは keiri_settings だけ
    //   という事実を、外から1回で読める形にしておきます。**金額は1円も出しません**（日付と棚の名前だけ）。
    const openingSource = buildCashOpeningSource({
      openingDate: data.settingsMissing ? null : (settings.opening_date ?? null),
      ...openingSourceRead,
    });

    // ★「いま じゅんが押したら、ちゃんと記録に残るか」を 頼む前に答える（2026-10-20・kp245）。
    //   控えの道は、先に経理の設定の行を読んでから足す作りなので、
    //   **その行が公開の鍵（画面と同じ鍵）で読めるか**が、1分が実るかどうかそのものです。
    const press = buildCashCountPress({
      shelfMissing: data.cashShelfMissing,
      ...memoProbe,
    });

    // ★「数え始めの日より前に払った経費」（2026-10-28・kp265・f1-4）。
    //   金庫を数えたときの差の内わけとして画面に出している1行を、外からも確かめられる形。
    //   **金額は1円も返しません**（件数と日付、説明がつくかどうかだけ）。
    //   この分が居られるのは**数え始めの月だけ**なので、その月を数えます
    //   （今月ぶんの読み込みは数え始めの日から始まるため、前の行がそもそも入っていません）。
    // ★「差は ぜんぶ名前が付いたか」（2026-11-08・f1-4）。
    //   上の5つの内わけは、**それぞれ自分のことしか言いません**。読んだ人には
    //   「で、この差は ぜんぶ説明が付いたの？ まだ探すものがあるの？」が分かりません。
    //   名前が付いた分を「説明できる幅」として足し、差がその幅に収まるかを1つに畳みます。
    //   読めていない所が1つでもあって、しかも差がはみ出しているときは
    //   **言い切りません**（covered を null にします）。
    //   **金額は1円も返しません**（収まっているか・名前の数・読めていない所の名前だけ）。
    const diffCoverage = measureCashDiffCoverage({
      diff: reconcile.diff,
      pieces: [
        registerDiffPiece(regDiffGap),
        openingExpensesPiece(openingGap, !data.reportsUnreadable),
        fieldRepayPiece(fieldRepayGap),
        unpaidPayrollPiece(unpaidPayrollGap),
      ],
      // ★空きが「お休みだけ」と読めた日は、分からない所として数えません
      //   （数えると、お休みがあるだけで永遠に合否が出ません）。
      //   読めなかった日・足りない日があった日は、今までどおり「分からない所」です。
      unknown:
        booksGap.wide && !booksGapOpen.holidaysOnly ? ["日報がまだ入っていない日"] : [],
    });

    // ★合否は1か所で決める（2026-11-09・f1-4）。
    //   ここは以前 `ok: true` の決め打ちで、**まだ一度も金庫を数えていない日でも
    //   「合格」と読める答え**を返していました（11/8 に直した「止まっている日を
    //   不合格にする」の裏返しです）。数えた結果と、差に名前が付いたか（covered）
    //   だけから決め、分からない日は null にします。**計算だけ**です。
    const countWindow = buildCashCountWindow({ reconcile, pick, place });
    const verdictOk = cashCountOk({
      verdict: countWindow.verdict,
      covered: diffCoverage.covered,
    });

    return json({
      ok: verdictOk.ok,
      okMeans: verdictOk.okMeans,
      measurable: true,
      warehouse: { alive: warehouse.alive, state: warehouse.state, reason: warehouse.reason },
      ...countWindow,
      // 差の内わけ（数え始めの日より前に払った経費・金額は出さない）
      openingGap: buildCashOpeningGapWindow({ gap: openingGap, diff: reconcile.diff }),
      // 差の内わけ（日報がどこまで入っているか・金額は出さない）
      booksGap: buildCashBooksGapWindow({ gap: booksGap, diff: reconcile.diff }),
      // 空いている日の正体（営業した日か お休みか・件数と日付だけ）
      booksGapOpen,
      // 差の内わけ（日報に入っているレジの過不足・金額は出さない）
      registerDiffGap: buildRegisterDiffGapWindow({
        gap: regDiffGap,
        diff: reconcile.diff,
      }),
      // 差の内わけ（現場スタッフの立替をお返しした分・金額は出さない）
      fieldRepayGap: buildFieldRepayGapWindow({
        gap: fieldRepayGap,
        diff: reconcile.diff,
      }),
      // 差の内わけ（払った記録が無い日当・金額は出さない）
      unpaidPayrollGap: buildUnpaidPayrollGapWindow({
        gap: unpaidPayrollGap,
        diff: reconcile.diff,
      }),
      // 差は ぜんぶ名前が付いたか（収まっているか・名前の数だけ・金額は出さない）
      diffCoverage: buildCashDiffCoverageWindow(diffCoverage),
      // どの屋号の日報から数えているのか（件数だけ・金額も屋号の名前も出さない）
      shopScope: buildCashShopScopeWindow(shopScope),
      shelfMissing: data.cashShelfMissing,
      // じゅんが押す回数と、いま押したら残るか（金額は出さない）
      press,
      // 数え方が2通りに分かれている月か（件数だけ・金額は返さない）
      variantRows: repaidRows.length,
      // 数える前の用意（じゅんの1分が、ちゃんと合否になるか）
      ready,
      // どの数え始めと比べているのか（棚の名前と日付だけ・金額は出さない）
      openingSource,
    });
  } catch (e: any) {
    // ★通信が失敗した日も「合っていません」とは言いません
    return json({
      ...cashCountNotMeasurable("倉庫との通信に失敗しました"),
      detail: String(e?.message ?? e).slice(0, 120),
    });
  }
}

/**
 * 日報が空いている日に、**出店の予定があったか**を読む（2026-11-09・f1-4）。
 * **読むだけ**です（1行も書き込みません）。
 *
 * ★返すのは件数と日付だけです。お店の名前・担当者の名前・金額は1文字も返しません。
 * ★手羽屋のぶんだけを読みます（lib/shiftScope.ts の既にある決まりをそのまま使う。
 *   棚に「どの店か」の欄がまだ無い倉庫では、今までどおり絞りません）。
 * ★読めなかったときは「お休みでした」と言いません（0件を「無い」と取り違えないため）。
 */
async function readBooksGapOpen(params: {
  lastDate: string | null;
  asOf: string;
  wide: boolean;
  db: ReturnType<typeof serverClient>;
}): Promise<CashBooksGapOpen> {
  const { lastDate, asOf, wide, db } = params;
  // 空きが短い日は、今までどおり何も言いません（よけいな問い合わせもしません）
  if (!wide || !lastDate) return EMPTY_CASH_BOOKS_GAP_OPEN;

  const gapDates = booksGapDates({ lastDate, asOf });
  if (gapDates.length === 0) return EMPTY_CASH_BOOKS_GAP_OPEN;

  try {
    const { data, error } = await scopeShiftsQuery<any>(
      db
        .from("shifts")
        .select("date")
        .gte("date", gapDates[0])
        .lte("date", gapDates[gapDates.length - 1])
        .eq("status", "published")
        .limit(500) as any,
      TEBAYA_SCOPE,
      await probeShiftsTenantState(db as never),
    );
    if (error || !data) return measureBooksGapOpen({ gapDates, shiftDates: null });
    const dates = (data as { date?: string | null }[])
      .map((r) => String(r.date ?? ""))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    return measureBooksGapOpen({ gapDates, shiftDates: dates });
  } catch {
    return measureBooksGapOpen({ gapDates, shiftDates: null });
  }
}

/**
 * 控えを置く場所（経理の設定の行）が、**公開の鍵**で読めるかを確かめ、あわせて
 * **いま書いてある ひとこと が、控えを足しても残るか**を答える
 * （2026-10-20・kp245・f1-4）。**読むだけ**です（1行も書き込みません）。
 *
 * ★ここはサーバー側の鍵ではなく、**画面と同じ公開の鍵**で聞きます。
 *   じゅんが押すのはブラウザなので、ブラウザの鍵で読めるかどうかが答えになります。
 * ★画面と同じ聞き方（business_type_code で1行・maybeSingle）をそのまま真似ます。
 *   聞き方を変えると、画面では止まるのに ここでは通る、という食い違いが出ます。
 * ★ひとことは**残るかどうかを見るためだけ**に読み、**文そのものは窓口に返しません**
 *   （返すのは「入っているか・何文字か・そのまま残るか」だけ。だれでも読める窓口のため）。
 */
async function probeMemoRow(
  shelfMissing: boolean,
): Promise<{
  rowReadable: boolean;
  readError: string | null;
  existingNote: NoteKeepPlan | null;
}> {
  if (!shelfMissing) return { rowReadable: false, readError: null, existingNote: null };
  try {
    const { data, error } = await anonClient()
      .from("keiri_settings")
      .select("business_type_code, memo")
      .eq("business_type_code", CASE_BUSINESS_CODE)
      .maybeSingle();
    if (error)
      return {
        rowReadable: false,
        readError: String(error.message).slice(0, 120),
        existingNote: null,
      };
    return {
      rowReadable: !!data,
      readError: null,
      existingNote: data ? planCashCountNoteKeep((data as any).memo ?? null) : null,
    };
  } catch (e: any) {
    return {
      rowReadable: false,
      readError: String(e?.message ?? e).slice(0, 120),
      existingNote: null,
    };
  }
}

/**
 * 「数え始めの日より前に払った経費」を数える（2026-10-28・kp265・f1-4）。**読むだけ**です。
 *
 * ★この分が居られるのは**数え始めの日が入っている月だけ**です。
 *   いま読んでいる月がその月でなければ、その月をもう一度 読んで数えます
 *   （今月ぶんの読み込みは数え始めの日から始まるので、前の行が入っていません）。
 *   読めなかったら「無し」ではなく 0件のまま返します（0件と取り違えないよう、
 *   窓口の note で「差の説明にはなりません」と言うだけにします）。
 */
async function readOpeningGap(params: {
  openingDate: string | null;
  ym: string;
  reports: Awaited<ReturnType<typeof loadKeiriMonthServer>>["reports"];
  db: ReturnType<typeof serverClient>;
}) {
  const opening = params.openingDate ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opening)) return { ...EMPTY_CASH_OPENING_GAP };
  const openingYm = opening.slice(0, 7);
  if (openingYm === params.ym) {
    return expensesBeforeOpening({ reports: params.reports, openingDate: opening });
  }
  try {
    const month = await loadKeiriMonthServer({
      ym: openingYm,
      businessCode: CASE_BUSINESS_CODE,
      scope: TEBAYA_SCOPE,
      monthOnly: true,
      db: params.db,
    });
    if (month.reportsUnreadable) return { ...EMPTY_CASH_OPENING_GAP };
    return expensesBeforeOpening({ reports: month.reports, openingDate: opening });
  } catch {
    return { ...EMPTY_CASH_OPENING_GAP };
  }
}

/**
 * 手羽屋が毎日使う現金の画面（/cash）が読む棚の「数え始めの日」だけを読む。
 * **読むだけ**で、金額（期首残高）は読みません。読めなかったら「無い」ではなく
 * 日付なしとして扱います（0件と取り違えないため）。
 */
async function readDailyScreenOpening(
  db: ReturnType<typeof serverClient>,
): Promise<{ otherOpeningDate: string | null; otherShelfExists: boolean }> {
  try {
    const { data, error } = await db
      .from("cash_settings")
      .select("start_date")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) return { otherOpeningDate: null, otherShelfExists: false };
    const row = (data as Array<{ start_date?: unknown }> | null)?.[0] ?? null;
    if (!row) return { otherOpeningDate: null, otherShelfExists: false };
    const d = row.start_date;
    return {
      otherOpeningDate: typeof d === "string" && d ? d : null,
      otherShelfExists: true,
    };
  } catch {
    return { otherOpeningDate: null, otherShelfExists: false };
  }
}

/** 今日（YYYY-MM-DD・日本時間） */
function todayStr(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function json(body: Record<string, unknown>) {
  return NextResponse.json(stampCheckWindow(body), {
    status: 200,
    headers: CHECK_WINDOW_HEADERS,
  });
}
