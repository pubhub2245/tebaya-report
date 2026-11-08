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
import { isUnreachableMessage } from "./readFailure";

/** Stripe の画面で1回だけ人が設定する値（このアプリからは見えない） */
export const STRIPE_MANUAL_SETUP = {
  /** 支払いが終わったお客さんの戻り先 */
  returnUrl: "https://tebaya-report.vercel.app/keiri/welcome?session={CHECKOUT_SESSION_ID}",
  /** 支払いが終わったことを知らせてもらう先 */
  webhookUrl: "https://tebaya-report.vercel.app/api/keiri/signup-webhook",
  /** 知らせてもらう出来事 */
  webhookEvent: "checkout.session.completed",
} as const;

export type TableCheck = {
  ok: boolean;
  reason: string | null;
  /**
   * 倉庫（データのしまい場所）まで**届かなかった**か。
   *
   * ★2026-11-08（B／f2-1・f2-2）に足しました。**ここを分けないと嘘の赤が出ます。**
   *   倉庫が眠っている日、診断は「つながっていません。残り 2 か所」と答え、
   *   お店の置き場（keiri_tenants）と初回設定の置き場（keiri_settings）を
   *   **読めなかった＝使えない**として数えていました。倉庫に1回も届いていないので、
   *   置き場があるのか・読めるのかは分かりません。
   *   ＝ 実際より悪く出して、要らない手続きに人を向かわせる形
   *   （このファイルの 2026-09-26 の注意書きと同じまちがい）。
   *   true のときは ready も checks も **null（測れていない）** にします。
   */
  unreachable?: boolean;
};

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
  /**
   * つながっているか。**null＝いまは測れませんでした**
   * （倉庫に届かなかった日。合格にも不合格にもしていません）。
   */
  ready: boolean | null;
  /**
   * 倉庫に届いて、判定できたか。false のときは ready・shop_table・settings_table が
   * ぜんぶ null になります（2026-11-08・B）。
   */
  measurable: boolean;
  summary: string;
  checks: {
    payment_button: boolean;
    signup_notice: boolean;
    /** null＝倉庫に届かなかったので確かめられなかった */
    shop_table: boolean | null;
    /** null＝倉庫に届かなかったので確かめられなかった */
    settings_table: boolean | null;
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

  /*
   * ★2026-11-08（B／f2-1・f2-2）：**届かなかったことを「駄目だった」と数えません。**
   *
   *   倉庫が眠っている日、置き場を1行 読もうとすると「fetch failed」が返ります。
   *   それまでは その2つを **読めなかった＝使えない** として数え、
   *   「つながっていません。残り 2 か所」と答えていました。
   *   倉庫に1回も届いていないので、置き場があるのか・読めるのかは分かりません。
   *   ＝ 実際より悪く出して、要らない手続きに人を向かわせる形です
   *   （このファイルの 2026-09-26 の注意書きとまったく同じまちがい）。
   *
   *   倉庫の窓口（tenantRpcUsable）が実際に答えているときは、届いている証拠が
   *   あるので今までどおり判定します。届いた証拠が無いときだけ「測れません」に倒します。
   */
  const unreachable =
    (input.tenants.unreachable === true || input.settings.unreachable === true) &&
    input.tenantRpcUsable !== true;
  const measurable = !unreachable;

  const ready = measurable ? (route === "card" ? cardReady : bankReady) : null;

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
          "お振込先は、担当がいただいたお電話番号かメールアドレスへご案内します" +
            "（公開ページには口座を書きません）",
        ]
      : [];

  const summary = !measurable
    ? "いまは測れませんでした（倉庫＝データのしまい場所に、いまつながりません）。" +
      "つながっているとも、つながっていないとも言っていません。" +
      "倉庫が読めるようになってから、もう一度 開いてください"
    : ready
      ? route === "card"
        ? "申し込みから使い始めまで、人の手を借りずにつながっています"
        : "銀行振込でお申し込みを受け付けられます" +
          "（お店1軒ぶんの用意とお振込先のご案内は、担当が行います）"
      : `つながっていません。残り ${activeTodo.length} か所`;

  /*
   * 測れなかった日は「残り ◯か所」を出しません（確かめていない数なので）。
   * 代わりに、何が確かめられなかったかを1行だけ出します。
   */
  const shownTodo = measurable
    ? activeTodo
    : [
        "お店の置き場（keiri_tenants）と初回設定の置き場（keiri_settings）は、" +
          "いま確かめられませんでした（倉庫から返事がありません）。" +
          "**合格にも不合格にもしていません**",
      ];

  return {
    ready,
    measurable,
    summary,
    route,
    checks: {
      payment_button: hasButton,
      signup_notice: secret.ok,
      shop_table: measurable ? tenants.ok : null,
      settings_table: measurable ? settings.ok : null,
      shop_create: canCreateShop,
    },
    todo: shownTodo,
    manual_steps: manualSteps,
    card: { ready: cardReady, todo: cardTodo },
  };
}

/** 置き場を読もうとしたときのエラーを、人の言葉に直す */
export function describeTableError(code: string | null | undefined, message: string): string {
  // ★ いちばん先に見るのは「倉庫まで届いたか」。届いていないなら、
  //   置き場がある／ないも、読めるかどうかも分かりません（2026-11-08・B）。
  //   英語のエラー文はそのまま出しません（読む人がじゅんなので）。
  if (isUnreachableMessage(message)) {
    return (
      "倉庫（データのしまい場所）に、いまつながりませんでした" +
      "（眠っているのかもしれません。お金はかかっていません）。" +
      "置き場があるかどうかは、ここでは分かりません"
    );
  }
  // ★ 置き場そのものが無いときは、直し方が違う（SQLを1回実行する）ので言い分ける
  if (code === "42P01" || /does not exist|could not find the table/i.test(message)) {
    return "置き場（表）が本番にありません。SQLをまだ実行していない可能性があります";
  }
  // ★ 表はあるのに「読む許可がありません」のときは、直し方がまた違う
  //   （サーバー側の鍵 SUPABASE_SERVICE_ROLE_KEY を貼り直す）ので言い分ける
  if (code === "42501" || /permission denied/i.test(message)) {
    return "表はありますが、読む許可がありません。サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）が使えていない可能性があります";
  }
  // ★ code が空文字のときに「読めませんでした（）」と出ていたので直した（2026-11-08・B）
  const why = String(code ?? "").trim() || "理由不明";
  return `読めませんでした（${why}）`;
}
