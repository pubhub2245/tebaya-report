/**
 * 「お申し込みが、ちゃんと人に届くか」を言葉に直すだけのファイル。
 *
 * ■ なぜ作ったか（2026-09-19・kp60）
 *   お申し込みフォーム（/keiri/apply）は、申し込みが入ると2つのことをします。
 *   ① スタッフの LINE グループへ知らせる ② 倉庫（keiri_applications）に1行控える。
 *   ②は サーバー側の鍵が壊れているあいだ通りません（kp54・kp55）。
 *   つまり **いまは①の LINE が唯一の受け口** です。
 *
 *   そこで本番で実際に試したところ（2026-09-19 05:40 B）、
 *   **①も通りませんでした。理由は「今月の送信できる数を使い切っていた」**（LINE の 429）。
 *   ①も②も死んでいると、店主が申し込んでも誰にも届きません。
 *   外からは分からなかったので、診断（/api/keiri/diagnose）から見えるようにします。
 *
 * ★ 合言葉・鍵の値そのものは絶対に返しません（設定済み／未設定だけ）。
 * ★ ここは通信をしません。調べた結果を受け取って、言葉に直すだけです。
 * ★ 数えるだけで、LINE のメッセージは1通も送りません
 *   （送って確かめると、その1通ぶん残りが減ってしまうため）。
 * ★ 手羽屋の日報・シフト・レジ・LINE の送り方は1行も変えていません。
 */

/** 調べて分かった事実（通信をした側から渡してもらう） */
export type NotifyFacts = {
  /** 合言葉（LINE_CHANNEL_ACCESS_TOKEN）が入っているか */
  tokenSet: boolean;
  /** その合言葉がいま通るか（LINE に1回たずねて確かめた結果） */
  tokenValid: boolean;
  /** 送り先のグループが分かるか */
  groupFound: boolean;
  /**
   * 今月の送信できる数。分からなければ null。
   * limited=false は「数の上限が無い」という意味（有料の契約など）。
   */
  quota: { limited: boolean; limit: number | null; used: number | null } | null;
};

/** 見立て */
export type NotifyReport = {
  /** 「いま申し込みが LINE で人に届く」と言い切れるか */
  ok: boolean;
  /** 今月あと何通送れるか。分からなければ null */
  remaining: number | null;
  /** 人の言葉での説明 */
  note: string;
};

/** 残りが少ないと見なす数（これ以下になったら、届かなくなる前に知らせる） */
export const NOTIFY_LOW_REMAINING = 10;

/** 今月あと何通送れるか。分からなければ null */
export function remainingMessages(quota: NotifyFacts["quota"]): number | null {
  if (!quota || !quota.limited) return null;
  if (quota.limit === null || quota.used === null) return null;
  const left = quota.limit - quota.used;
  return left > 0 ? left : 0;
}

/**
 * 事実を「届くか／届かないか」の言葉に直す。
 *
 * ■ 気をつけていること
 *   合言葉が正しくても「今月の数を使い切っている」と1通も出ていきません。
 *   ここを ok にしてしまうと、kp57 で直した「読めた＝大丈夫」と同じ失敗になります。
 *   **送れると言い切れないときは ok にしない。**
 */
export function describeNotify(facts: NotifyFacts): NotifyReport {
  const remaining = remainingMessages(facts.quota);

  if (!facts.tokenSet) {
    return {
      ok: false,
      remaining,
      note:
        "スタッフの LINE へ知らせる合言葉が設定されていません" +
        "（Vercel の環境変数 LINE_CHANNEL_ACCESS_TOKEN）。お申し込みが誰にも届きません",
    };
  }
  if (!facts.tokenValid) {
    return {
      ok: false,
      remaining,
      note:
        "スタッフの LINE の合言葉が、いま通りません（古いか、間違っている可能性があります）。" +
        "お申し込みが誰にも届きません",
    };
  }
  if (!facts.groupFound) {
    return {
      ok: false,
      remaining,
      note:
        "送り先の LINE グループが分かりません（ボットをグループに招き直すか、LINE_GROUP_ID を設定してください）。" +
        "お申し込みが誰にも届きません",
    };
  }
  if (remaining === 0) {
    return {
      ok: false,
      remaining: 0,
      note:
        "今月ぶんの送信できる数を使い切っています。毎月1日に戻るまで、" +
        "LINE には1通も届きません（お申し込みの知らせも、手羽屋の日報の知らせも同じです）。" +
        "お申し込みフォームは、届けられなかったときに" +
        "「メールでそのまま送る」ボタンを出す作りになっています",
    };
  }
  if (remaining !== null && remaining <= NOTIFY_LOW_REMAINING) {
    return {
      ok: true,
      remaining,
      note: `届きます。ただし今月あと ${remaining} 通で、使い切ると届かなくなります（毎月1日に戻ります）`,
    };
  }
  if (remaining === null) {
    return { ok: true, remaining: null, note: "届きます（送れる数の上限はありません）" };
  }
  return { ok: true, remaining, note: `届きます（今月あと ${remaining} 通）` };
}

/**
 * 「知らせ」と「控え」を合わせて、**申し込みが人に届くか**を1つの答えにする。
 * どちらか片方でも生きていれば、申し込みは受け取れる。
 * 両方だめなら、フォームは受け付けずに「メールで送る」ボタンを出す。
 */
export function describeApplicationDelivery(args: {
  notifyOk: boolean;
  recordOk: boolean;
  /**
   * 届けられなかったときに開く「メールの下書き」の宛先（To と写し）。
   * 2026-09-19（kp63）に追加。ここが1か所しかないと、
   * その1つの受信箱を誰も見ていない月に、申し込みが静かに消える。
   */
  mailRecipients?: string[];
  /**
   * 控えを**読み返せる**か（サーバー側の合鍵が生きているか）。2026-09-24 追加。
   * 控えが残るだけでは「人が気づける」ことになりません（kp55 で読めない間は特に）。
   * 渡さなければ、これまでとまったく同じ答えになります。
   */
  recordReadable?: boolean;
}): { ok: boolean; note: string; mail_fallback: MailFallbackReport } {
  const { notifyOk, recordOk } = args;
  const mail_fallback = describeMailFallback(args.mailRecipients ?? []);
  const wrap = (r: { ok: boolean; note: string }) => ({ ...r, mail_fallback });

  // ★LINE が届かず、控えも読み返せないときは「届きます」と言ってはいけない
  //   （2026-09-24・B）。控えは残るので申し込みは消えないが、
  //   **こちら側の誰も気づけない**ので、いちばん危ない状態として出す。
  if (!notifyOk && recordOk && args.recordReadable === false) {
    return wrap({
      ok: false,
      note:
        "★控えは残りますが、**こちら側の誰も気づけません**。" +
        "LINE の知らせが止まっていて、倉庫の控えも1行ずつ読み返せないためです（kp55）。" +
        "お申し込みフォームは、この状態のとき店主に「控えのメールを1通だけ」お願いする作りにしてあります。" +
        "Vercel の SUPABASE_SERVICE_ROLE_KEY を貼り直すか、LINE の残り通数が戻れば解消します",
    });
  }

  return wrap(deliveryVerdict(notifyOk, recordOk));
}

/** 「メールの下書き」の宛先の見立て */
export type MailFallbackReport = {
  /** 宛先が何か所あるか */
  count: number;
  /** 宛先（メールアドレス。ここは公開ページにも出ている値なので隠さない） */
  recipients: string[];
  note: string;
};

/**
 * 下書きの宛先が何か所あるかを言葉にする。
 * **1か所だけ**のときは、そのことを警告として出す
 * （kp54・kp57 と同じ「数えられていないのに0に見える」形を、次に誰が見ても1回で分かるように）。
 */
export function describeMailFallback(recipients: string[]): MailFallbackReport {
  const list = Array.from(
    new Set(recipients.filter((v) => typeof v === "string" && v.trim() !== "")),
  );
  if (list.length === 0) {
    return {
      count: 0,
      recipients: [],
      note: "メールの下書きの宛先がありません。届かなかった申し込みは、どこにも残りません",
    };
  }
  if (list.length === 1) {
    return {
      count: 1,
      recipients: list,
      note:
        `メールの下書きの宛先は ${list[0]} の1か所だけです。` +
        "この受信箱を誰も見ていない期間があると、申し込みが入っても気づけません",
    };
  }
  return {
    count: list.length,
    recipients: list,
    note: `メールの下書きは ${list.length} か所に届きます（${list.join("、")}）`,
  };
}

function deliveryVerdict(
  notifyOk: boolean,
  recordOk: boolean,
): { ok: boolean; note: string } {
  if (notifyOk && recordOk) {
    return { ok: true, note: "届きます（LINE の知らせと、倉庫の控えの両方が通ります）" };
  }
  if (notifyOk) {
    return {
      ok: true,
      // ★「控えは残りません」と言い切っていたのを直した（2026-09-19・kp89）。
      //   9/19 に申し込みの棚を「入れることだけ許す郵便ポスト」の形にしたので、
      //   サーバー側の鍵が壊れていても**控えは残る**。
      //   ただし**一覧として読み返すにはサーバー側の鍵が必要**で、
      //   ここからは「残った」ことを確かめようがない（読むと必ず0件が返るため）。
      //   分からないことを「残りません」と断定すると、
      //   「もう送ってよいか」の判断をまちがえるので、事実だけを書く。
      note:
        "届きます（LINE の知らせが通ります）。控えは残る形にしてありますが、" +
        "一覧として読み返すにはサーバー側の鍵が要ります（kp55）",
    };
  }
  if (recordOk) {
    return {
      ok: true,
      note: "控えは残ります。ただし LINE の知らせは届かないので、人が控えを見に行くまで気づけません",
    };
  }
  return {
    ok: false,
    note:
      "いまお申し込みは、誰にも届きません（LINE の知らせも、倉庫の控えも通りません）。" +
      "フォームは「受け付けました」と嘘をつかず、その場で" +
      "「メールでそのまま送る」ボタンを出します",
  };
}

/* ==========================================================================
 * 「そのお申し込みに、人が気づけるか」（2026-09-24・B）
 *
 * ■ 見つけた穴（本番で実測）
 *   受け口（/api/keiri/apply）は「LINE の知らせ」か「倉庫の控え」の
 *   **どちらか片方でも通れば**「ありがとうございます」を返します。
 *   ところが 9月24日の本番はこうなっています：
 *     ・LINE は今月あと 5 通（手羽屋の日報の知らせと同じ枠を使うので、月末前に尽きます）
 *     ・倉庫の控えは残るが、サーバー側の鍵が壊れていて**1行も読み返せない**（kp55）
 *   この2つが重なると「控えは残った → ありがとうございます」と返しながら、
 *   **誰にも知らされず、誰にも読めない**状態になります。
 *   お店の人は申し込んだつもりで待ち、こちらは「申込0件」と書き続けます。
 *   最初の1件でこれが起きるのがいちばん痛いので、ここを言い分けます。
 *
 * ■ 考え方
 *   「残った」ではなく「**人が気づけるか**」で判定します。
 *     ・LINE が飛んだ → 気づけます
 *     ・控えが残り、かつ読み返せる（サーバー側の鍵が生きている）→ 気づけます
 *     ・それ以外 → 気づけません
 *   気づけないときは、申し込み自体は生かしたまま、
 *   お店の人に「控えのメールを1通だけ」お願いします（打ち直しは要りません）。
 *
 * ★ここは判定だけで、通信も保存もしません。
 * ★手羽屋の日報・シフト・レジ・LINE・お金の計算には一切さわっていません。
 * ========================================================================== */

/**
 * そのお申し込みに、こちら側の誰かが気づけるか。
 *
 * @param notified      LINE の知らせが実際に飛んだか
 * @param saved         倉庫に1行控えられたか
 * @param recordReadable 控えを**読み返せる**か（サーバー側の合鍵が生きているか）
 */
export function applicationIsReachable(args: {
  notified: boolean;
  saved: boolean;
  recordReadable: boolean;
}): boolean {
  if (args.notified) return true;
  return args.saved && args.recordReadable;
}
