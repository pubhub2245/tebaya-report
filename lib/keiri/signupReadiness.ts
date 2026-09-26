/**
 * 経理パッケージ「いま、お申し込みを受け付けられるか」の判定。
 *
 * app/api/keiri/diagnose/route.ts から呼ばれます。
 * ここは通信をしません（調べた結果を受け取って、言葉に直すだけ）。
 *
 * ■ いま正式なお支払い方法は「銀行振込」です（2026-09-25・kp181）
 *   カードの受付口（Stripe の支払いリンク）はまだ入れていません。
 *   **どちらの道を通るかで、「つながっている」の意味が変わります。**
 *
 *   〈銀行振込の道〉支払いリンクが入っていないとき ＝ いまの本番
 *     ① 申し込みフォームで受け取る（/keiri/apply）
 *     ② 入った申し込みが人に届く（スタッフのLINE か 倉庫の控え）
 *     ③④ お店の置き場と初回設定の置き場が使える（keiri_tenants／keiri_settings）
 *     ＋ お店1軒ぶんの行づくりと、お振込先のご案内は**担当が手で行います**
 *        （これは欠けているものではなく、この道の正しいやり方です）
 *
 *   〈カードの道〉支払いリンクが入ったとき
 *     上に加えて、支払いの通知（合言葉）と、行の自動づくり（サーバー側の鍵）が要ります。
 *
 * ■ なぜ分けたか（2026-09-26・B）
 *   銀行振込に決めたあとも、この判定はカードの道だけを見ていたため、
 *   本番は**お申し込みを受け付けられる状態なのに**
 *   「つながっていません。残り3か所」と出し続けていました。
 *   その3か所は全部カードの道の話で、**いま要らないものです。**
 *   実際より悪く出すと、要らない手続き（カードの受付口づくり）に人を向かわせ、
 *   いちばん大事な「1軒に送る」から目を離させます。
 *
 * ★ 合言葉・鍵の値そのものは扱いません（設定済み／未設定だけ）。
 */

import { paymentLinkEnvName, priceLabel } from "./caseNumbers";

/** Stripe の画面で1回だけ人が設定する値（このアプリからは見えない） */
export const STRIPE_MANUAL_SETUP = {
  /** 支払いが終わったお客さんの戻り先 */
  returnUrl: "https://tebaya-report.vercel.app/keiri/welcome?session={CHECKOUT_SESSION_ID}",
  /** 支払いが終わったことを知らせてもらう先 */
  webhookUrl: "https://tebaya-report.vercel.app/api/keiri/signup-webhook",
  /** 知らせてもらう出来事 */
  webhookEvent: "checkout.session.completed",
} as const;

export type TableCheck = { ok: boolean; reason: string | null };

export type SignupReadinessInput = {
  /** 申し込みボタンの飛び先。未設定なら null */
  paymentLink: string | null;
  /** 通知の合言葉の状態 */
  secret: { ok: boolean; reason?: string };
  /** お店の置き場が読めたか */
  tenants: TableCheck;
  /** 初回設定の置き場が読めたか */
  settings: TableCheck;
  /**
   * サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）が使えるか。
   *
   * ★2026-09-19（kp76）に足しました。**ここを見ないと嘘の緑が出ます。**
   *   お店の置き場（keiri_tenants）は鍵（RLS）を掛けてあり、
   *   サーバー側の鍵でしか読み書きできません。
   *   ところがその鍵が使えないとき、読みに行っても**エラーにならず「0件」が返る**ので、
   *   「読めました＝つながっています」に見えてしまいます。
   *   実際には、申し込んだお店は
   *     ・初回設定のリンクを開いても「このリンクは使えません」になり
   *     ・合言葉を入れても「パスワードが違います」になります（どちらも0件が返るため）
   *   ＝**お金を払っても、1歩も進めません。**
   *   控え（keiri_applications）で同じ見落としを直したのと同じ考え方です（kp57）。
   */
  serverKeyUsable: boolean;

  /**
   * 倉庫の「窓口」（keiri_tenant_activate / keiri_tenant_login）が使えるか。
   *
   * ★サーバー側の合鍵が壊れていても、この窓口があれば
   *   初回設定も合言葉での入室も通ります（2026-09-19・kp93）。
   *   ＝ここが true なら、鍵の貼り直し（kp55）を待たずにお店は使い始められます。
   */
  tenantRpcUsable?: boolean;

  /**
   * 入ったお申し込みが**人に届く**か（スタッフのLINE か 倉庫の控えのどちらかが生きているか）。
   *
   * ★銀行振込の道では、ここがいちばん大事です。カードの通知が無いぶん、
   *   申し込みに気づく道はこれ1本だけになります。
   *   分からないとき（渡されなかったとき）は true として扱います
   *   ＝ 調べていないことを「壊れている」と書かないため。
   */
  applicationDeliveryOk?: boolean;
};

export type SignupReadiness = {
  ready: boolean;
  summary: string;
  checks: {
    payment_button: boolean;
    signup_notice: boolean;
    shop_table: boolean;
    settings_table: boolean;
    /**
     * 申し込みが決まったときに「お店1軒ぶんの行」を**作れる**か。
     * ★2026-09-24（kp144）に足しました。**ここが無いと嘘の緑が出ます。**
     *   窓口（keiri_tenant_activate / keiri_tenant_login）が代わりにやってくれるのは
     *   「初回設定」と「合言葉での入室」の2つだけで、**行を作るのは入っていません**。
     *   行を作るのはサーバー側の合鍵（SUPABASE_SERVICE_ROLE_KEY）だけです。
     *   合鍵が壊れたまま支払いがつながると、お金は動いたのに行が作られず、
     *   お店は戻ってきた先で「このリンクは使えません」になります。
     */
    shop_create: boolean;
  };
  todo: string[];

  /**
   * いま正式なお支払い方法。"bank"＝銀行振込（kp181）／"card"＝カードでその場で払える。
   * 支払いリンクが入った瞬間に "card" に変わります（ここを誰かが直す必要はありません）。
   */
  route: "bank" | "card";

  /**
   * 担当が手で行う手順。**欠けているものではありません**（銀行振込の道の正しいやり方）。
   * カードの道では空になります。
   */
  manual_steps: string[];

  /**
   * カードでその場で払えるようにしたいときの残り。
   * ★ready の判定には入れません（いまのお支払い方法は銀行振込なので、
   *   ここが空でなくてもお申し込みは受け付けられます）。
   */
  card: { ready: boolean; todo: string[] };
};

export function buildSignupReadiness(input: SignupReadinessInput): SignupReadiness {
  const { paymentLink, secret, serverKeyUsable } = input;
  // 合鍵が生きている か、倉庫の窓口がある。どちらかあればお店は進める
  const tenantAccessOk = serverKeyUsable || input.tenantRpcUsable === true;
  const hasButton = !!paymentLink;
  // ★支払いリンクが入っているかが、そのまま「どちらの道か」になります。
  //   入っていない＝銀行振込の道（いまの本番）。入った＝カードの道。
  //   lib/keiri/caseNumbers.ts の cardPaymentLive() と同じ見方です。
  const route: "bank" | "card" = hasButton ? "card" : "bank";
  const deliveryOk = input.applicationDeliveryOk !== false;
  // カードの道のための残り（銀行振込の道では ready の判定に入れない）
  const cardSetupTodo: string[] = [];
  const shopCreateTodo: string[] = [];
  const todo: string[] = [];

  // ★鍵が使えないときは、読めていても「つながっている」とは言わない（安全側に倒す）
  const keyReason =
    "表はありますが、サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）が使えないので、" +
    "申し込んだお店は初回設定も、合言葉での入室もできません" +
    "（どちらも0件が返るため「このリンクは使えません」「パスワードが違います」になります）。" +
    "Vercel の SUPABASE_SERVICE_ROLE_KEY を貼り直すか、" +
    "倉庫の SQL Editor で supabase/migrations/keiri_tenant_rpc.sql を1回流してください（kp55／kp93）";
  const tenants: TableCheck = tenantAccessOk
    ? input.tenants.ok || input.tenantRpcUsable === true
      ? { ok: true, reason: null }
      : input.tenants
    : { ok: false, reason: input.tenants.reason ?? keyReason };
  const settings: TableCheck = tenantAccessOk
    ? input.settings.ok || input.tenantRpcUsable === true
      ? { ok: true, reason: null }
      : input.settings
    : { ok: false, reason: input.settings.reason ?? keyReason };

  if (!hasButton) {
    cardSetupTodo.push(
      `申し込みボタンが出ていません。Vercel の環境変数 ${paymentLinkEnvName()} に、いまの価格（${priceLabel()}）の支払いリンクを入れてください。` +
        "※ 名前に金額が入っています。値上げしたときは、新しい金額で支払いリンクを作り直してこの名前で登録してください（前の金額のリンクは自動で使われなくなります）",
    );
  }
  if (!secret.ok) {
    cardSetupTodo.push(
      secret.reason === "未設定"
        ? `支払いが終わった通知を受け取れません。Stripe で通知先（Webhook）を ${STRIPE_MANUAL_SETUP.webhookUrl} に登録し、出てきた合言葉を Vercel の環境変数 KEIRI_SIGNUP_WEBHOOK_SECRET に入れてください`
        : "KEIRI_SIGNUP_WEBHOOK_SECRET に全角などの使えない文字が入っています（貼り直してください）",
    );
  }
  if (!tenants.ok) todo.push(`お店の置き場（keiri_tenants）：${tenants.reason}`);
  if (!settings.ok) todo.push(`初回設定の置き場（keiri_settings）：${settings.reason}`);

  /*
   * ★銀行振込の道では、申し込みに気づく道は「スタッフのLINE」と「倉庫の控え」だけです
   *   （カードの支払い通知が無いため）。その両方が死んでいると、
   *   お申し込みは受け付けた顔をして誰にも届きません。ここは赤くします。
   */
  if (!deliveryOk) {
    todo.push(
      "入ったお申し込みが、どこにも届きません（スタッフのLINEも、倉庫の控えも通りませんでした）。" +
        "**これが直るまで、1軒目に送るのは止めてください。**" +
        "詳しい理由は、この画面の application_delivery をご覧ください",
    );
  }

  /*
   * ★2026-09-24（kp144）：窓口があっても、**お店1軒ぶんの行を作ることはできません。**
   *   窓口が代わりにやるのは「初回設定」と「合言葉での入室」の2つだけです
   *   （supabase/migrations/keiri_tenant_rpc.sql にもそう書いてあります）。
   *   行を作るのは支払いの通知を受けたときで、そこはサーバー側の合鍵を使います。
   *   合鍵が壊れたまま支払いだけつながると、**お金は動いたのに行が作られません。**
   *
   * ★2026-09-25（kp159）：↑の言い方を直しました。
   *   9/24 は「お店は戻ってきた先で『このリンクは使えません』になります」と書いて
   *   いましたが、**本番のコードを読み直したところ、そうはなりません。**
   *   Stripe の戻り先は /keiri/welcome?session={CHECKOUT_SESSION_ID} で、
   *   合言葉（t=）が付きません。この形で行が見つからないときは kp95 で
   *   「お手続きを確認しています。担当からすぐにご連絡します」を返し、
   *   スタッフのLINEへ支払い画面の番号つきで知らせ、控えにも1行残します
   *   （app/api/keiri/welcome/route.ts の isPaidPendingArrival → receivePaidPending）。
   *   ＝ **行き止まりではなく、「自動では始められず、人が引き受ける」状態**です。
   *   実際より悪く書くと、お支払いの道をつなぐこと自体をためらわせるので直しました。
   *
   *   あわせて、最初の1件を鍵の貼り直しより先に始められる回り道を書き添えます
   *   （倉庫の窓口を1行呼ぶだけです：
   *    select * from public.keiri_tenant_create_manual('お店の名前');
   *    手順は supabase/migrations/keiri_tenant_create_manual.sql の方法A。
   *    ★ファイルを丸ごと貼っても何も起きません。人が1行だけ選んで流す形にしてあります＝kp176）。
   *
   *   窓口が無いときは、上の2件がすでに同じ鍵の話をしているので足しません
   *   （同じお願いを3回並べても、やることが増えて見えるだけです）。
   */
  const canCreateShop = serverKeyUsable;
  if (!canCreateShop && tenantAccessOk) {
    shopCreateTodo.push(
      "お申し込みが決まっても、お店1軒ぶんの行（keiri_tenants）を**自動では作れません**。" +
        "倉庫の窓口が代わりにやってくれるのは「初回設定」と「合言葉での入室」の2つだけで、" +
        "行を作るのはサーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）だけです。" +
        "**ただし行き止まりにはなりません。**お支払いのあと戻ってきた方には" +
        "「お手続きを確認しています。担当からすぐにご連絡します」と出て、" +
        "スタッフのLINEに支払い画面の番号つきで知らせが飛び、控えにも1行残ります（kp95）。" +
        "最初の1件は、鍵を待たずに手で始められます" +
        "（倉庫の SQL Editor で select * from public.keiri_tenant_create_manual('お店の名前'); を1行流すと、" +
        "そのお店の初回設定リンクが1本出ます。手順は supabase/migrations/keiri_tenant_create_manual.sql の方法A）。" +
        "自動でつながるようにするには、Vercel の SUPABASE_SERVICE_ROLE_KEY を貼り直してください（kp55）",
    );
  }

  /*
   * ★ここが 2026-09-26（B）で変えた所です。
   *
   *   これまでは、カードの道がそろっているかだけで ready を決めていました。
   *   いまのお支払い方法は**銀行振込**なので、カードの3か所（支払いリンク・支払いの通知・
   *   行の自動づくり）は**いま要らないもの**です。要らないものを「残り」に数えると、
   *   本番は受け付けられる状態なのに「つながっていません」と出続けます。
   *
   *   そこで、通る道で判定します。**どちらの道でも、facts（checks）は1つも隠しません。**
   *   カードの残りは card.todo に、そのまま全部出します。
   */
  // カードの道がそろっているか（銀行振込の道でも、参考としてそのまま出す）
  const cardReady = hasButton && secret.ok && tenants.ok && settings.ok && canCreateShop;
  const cardTodo = [...cardSetupTodo, ...shopCreateTodo];

  // 銀行振込の道：受け口（置き場）が使えて、入った申し込みが人に届けば受け付けられる
  const bankReady = tenants.ok && settings.ok && deliveryOk;

  const activeTodo =
    route === "card" ? [...cardSetupTodo, ...todo, ...shopCreateTodo] : todo;
  const ready = route === "card" ? cardReady : bankReady;

  /*
   * 担当が手で行う手順。**欠けているものではありません。**
   * 銀行振込の道では、これが正しいやり方です（ここを「残り」に数えない）。
   */
  const manualSteps =
    route === "bank"
      ? [
          "お申し込みが決まったら、倉庫の SQL Editor で " +
            "select * from public.keiri_tenant_create_manual('お店の名前'); を1行流します" +
            "（そのお店の初回設定リンクが1本出ます。手順は " +
            "supabase/migrations/keiri_tenant_create_manual.sql の方法A）",
          "お振込先は、担当がいただいたメールアドレスへご案内します" +
            "（公開ページには口座を書きません）",
        ]
      : [];

  const summary = ready
    ? route === "card"
      ? "申し込みから使い始めまで、人の手を借りずにつながっています"
      : "銀行振込でお申し込みを受け付けられます" +
        "（お店1軒ぶんの用意とお振込先のご案内は、担当が行います）"
    : `つながっていません。残り ${activeTodo.length} か所`;

  return {
    ready,
    summary,
    route,
    checks: {
      payment_button: hasButton,
      signup_notice: secret.ok,
      shop_table: tenants.ok,
      settings_table: settings.ok,
      shop_create: canCreateShop,
    },
    todo: activeTodo,
    manual_steps: manualSteps,
    card: { ready: cardReady, todo: cardTodo },
  };
}

/** 置き場を読もうとしたときのエラーを、人の言葉に直す */
export function describeTableError(code: string | null | undefined, message: string): string {
  // ★ 置き場そのものが無いときは、直し方が違う（SQLを1回実行する）ので言い分ける
  if (code === "42P01" || /does not exist|could not find the table/i.test(message)) {
    return "置き場（表）が本番にありません。SQLをまだ実行していない可能性があります";
  }
  // ★ 表はあるのに「読む許可がありません」のときは、直し方がまた違う
  //   （サーバー側の鍵 SUPABASE_SERVICE_ROLE_KEY を貼り直す）ので言い分ける
  if (code === "42501" || /permission denied/i.test(message)) {
    return "表はありますが、読む許可がありません。サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）が使えていない可能性があります";
  }
  return `読めませんでした（${code ?? "理由不明"}）`;
}
