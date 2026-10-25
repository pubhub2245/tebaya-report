/**
 * 「知らせが届かなかったとき、なぜ届かなかったかが後から読める」を固定する（kp198）。
 *
 * ■ なぜ要るか
 *   2026-09-28 13:46、本番でお申し込みを1件通したところ、控えは残ったのに
 *   スタッフの LINE への知らせだけが届きませんでした。理由はサーバーのログにしか
 *   出ておらず、外からは分かりません。そのため「今月の送信数を使い切ったのだろう」と
 *   見立てるしかありませんでした（同じ日の診断では、まだ5通 残っていました＝別の理由）。
 *   **理由が分からないままだと、直しようがありません。**
 *
 * ■ ここで見張ること
 *   ①失敗の理由が、値そのものを出さずに人の言葉になる
 *   ②「送り先のIDがある」だけで「届きます」と言わない（嘘の緑を作らない）
 *   ③今までどおりの入り口（sendLineGroupMessage）が残っていて、
 *     手羽屋の日報・シフト・レジの送られ方が変わらない
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describeLineFailure } from "../lib/line/sendMessage";
import { describeNotify, type NotifyFacts } from "../lib/keiri/notifyHealth";

const sendMessage = readFileSync("lib/line/sendMessage.ts", "utf8");
const applyRoute = readFileSync("app/api/keiri/apply/route.ts", "utf8");
const diagnose = readFileSync("app/api/keiri/diagnose/route.ts", "utf8");
/**
 * ★2026-10-25（f2-2）：届くかを「送らずに」調べる所は lib/keiri/notifyProbe.ts の
 *   1か所に出した（診断の窓口と、読むだけの窓口 /api/keiri/notifycheck が同じ関数を呼ぶ）。
 *   見張る先も、その1か所にそろえる。
 */
const notifyProbe = readFileSync("lib/keiri/notifyProbe.ts", "utf8");
const notifyCheck = readFileSync("app/api/keiri/notifycheck/route.ts", "utf8");

const okFacts: NotifyFacts = {
  tokenSet: true,
  tokenValid: true,
  groupFound: true,
  groupReachable: true,
  quota: { limited: true, limit: 200, used: 10 },
};

test("①失敗の理由が、人の言葉になる", () => {
  assert.ok(describeLineFailure("token_missing", null).includes("合言葉"));
  assert.ok(describeLineFailure("group_missing", null).includes("グループ"));
  assert.ok(describeLineFailure("push_failed", 429).includes("使い切"));
  assert.ok(describeLineFailure("push_failed", 403).includes("外れている"));
  assert.ok(describeLineFailure("push_failed", 401).includes("通りません"));
  assert.ok(describeLineFailure("push_failed", null).includes("失敗"));
});

test("②理由の文に、合言葉や送り先のIDそのものは入らない", () => {
  const all = [
    describeLineFailure("token_missing", null),
    describeLineFailure("group_missing", null),
    describeLineFailure("push_failed", 429),
    describeLineFailure("push_failed", 403),
    describeLineFailure("push_failed", 500),
  ].join("\n");
  // 送り先のIDらしきもの（C…／U…／R… の長い英数字）が混ざらない
  assert.equal(/\b[CUR][0-9a-f]{20,}\b/.test(all), false);
  // 合言葉らしき長い英数字も混ざらない
  assert.equal(/[A-Za-z0-9+/=]{40,}/.test(all), false);
});

test("③送り先のグループに届かないと分かったら、緑にしない", () => {
  const good = describeNotify(okFacts);
  assert.equal(good.ok, true);

  const bad = describeNotify({ ...okFacts, groupReachable: false });
  assert.equal(bad.ok, false, "グループに届かないのに『届きます』と言っています");
  assert.ok(bad.note.includes("届きません"));
});

test("④確かめていない（null）を『だめ』に倒さない", () => {
  const unknown = describeNotify({ ...okFacts, groupReachable: null });
  assert.equal(unknown.ok, true);
  // 欄そのものを書かないときも、これまでどおり
  const legacy = describeNotify({
    tokenSet: true,
    tokenValid: true,
    groupFound: true,
    quota: { limited: true, limit: 200, used: 10 },
  });
  assert.equal(legacy.ok, true);
});

test("⑤今までどおりの入り口（sendLineGroupMessage）が残っている", () => {
  assert.ok(
    sendMessage.includes("export async function sendLineGroupMessage(text: string): Promise<boolean>"),
    "手羽屋が使っている入り口の形が変わっています",
  );
  assert.ok(sendMessage.includes("sendLineGroupMessageDetailed"));
});

test("⑥お申し込みの返事に、届かなかった理由の1行が付く", () => {
  assert.ok(applyRoute.includes("notifyNote"), "返事に理由の欄がありません");
  assert.ok(applyRoute.includes("describeLineFailure"));
});

test("⑦診断は、送り先に本当に届くかを『送らずに』確かめる", () => {
  assert.ok(notifyProbe.includes("getGroupSummary"), "送り先の確かめが入っていません");
  // 調べるだけでメッセージを送らない（残りの通数を減らさない）
  assert.equal(
    notifyProbe.includes("pushMessage"),
    false,
    "調べる所が LINE を送ろうとしています",
  );
  assert.equal(diagnose.includes("pushMessage"), false, "診断が LINE を送ろうとしています");
  assert.ok(notifyProbe.includes("groupReachable"));
  // 診断は、同じ調べ方を呼んでいる（答えが2通りに分かれないように）
  assert.ok(diagnose.includes("probeNotify"), "診断が共通の調べ方を使っていません");
});

test("⑧知らせの調子は、合言葉を出さずに読むだけの窓口から確かめられる（f2-2）", () => {
  /**
   * ★なぜ要るか：これまで知らせの調子は診断の窓口でしか見られず、そこは
   *   自動で読む道具にことわってある住所なので、検査役が開けなかった。
   *   そのため f2-2 の裏付けが 10/4 の1通のまま3週間 取り直せていなかった。
   */
  assert.ok(notifyCheck.includes("probeNotify"), "共通の調べ方を使っていません");
  assert.ok(notifyCheck.includes("describeNotify"), "人の言葉の1行がありません");
  // 送らない・書き込まない
  assert.equal(notifyCheck.includes("pushMessage"), false, "窓口が LINE を送ろうとしています");
  for (const write of [".insert(", ".update(", ".upsert(", ".delete("]) {
    assert.equal(notifyCheck.includes(write), false, `窓口が書き込もうとしています（${write}）`);
  }
  // 合言葉・送り先のIDを返さない
  assert.equal(
    notifyCheck.includes("LINE_CHANNEL_ACCESS_TOKEN"),
    false,
    "窓口が合言葉を触っています",
  );
  assert.equal(notifyCheck.includes("groupId"), false, "窓口が送り先のIDを返そうとしています");
  // 窓口の一覧（robots.txt が読む）に入っていること
  const windows = readFileSync("lib/keiri/checkWindow.ts", "utf8");
  assert.ok(
    windows.includes("/api/keiri/notifycheck"),
    "窓口の一覧に入っていません（検査役が読めません）",
  );
});
