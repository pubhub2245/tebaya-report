/**
 * ホームの「今日1軒だけ送る」の帯（kp145）の決めごとを固定する。
 *
 * ここが崩れると、
 *   ・他人の連絡先（LINEのID・メールアドレス）が端末の画面に出る
 *   ・受け取る8軒（同じ出店先の同業）に値段が先に見える
 *   ・手羽屋のスタッフの画面に帯が出る
 * のどれかが起きる。どれも取り返しがつかないので、戻り止めを置く。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  OUTREACH_LINE_SHARE_URL,
  OUTREACH_LINK,
  OUTREACH_MESSAGE,
  OUTREACH_MESSAGE_SHARE,
  OWNER_MARK_LINK,
  OWNER_MARK_PARAM,
  ownerMarkFromQuery,
  parseSent,
  serializeSent,
  shouldMarkOwnerDeviceOnRestore,
  shouldShowNudge,
  todayKey,
} from "../lib/keiri/outreach";
// 呼び名（クレープ…）は検算からだけ読む。本番の画面に配られる側からは取り込まない（kp172）
import { OUTREACH_SHOPS, nextShop, remainingShops } from "../lib/keiri/outreachShopLabels";

const lib = fs.readFileSync(
  path.join(process.cwd(), "lib", "keiri", "outreach.ts"),
  "utf8",
);
const view = fs.readFileSync(
  path.join(process.cwd(), "app", "components", "OwnerOutreachNudge.tsx"),
  "utf8",
);
const home = fs.readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf8");
/** この検算ファイル自身（宛先がそのままの文字で紛れ込んでいないかを見張るため） */
const self = fs.readFileSync(
  path.join(process.cwd(), "tests", "keiriOutreach.test.ts"),
  "utf8",
);

/**
 * 司令室にある送り先の宛先（メールアドレス・LINEのID）を、読めない形にして持つ。
 * ★元に戻せる形なので「隠す」ためではなく、**検索に載らないようにする**ためのもの。
 *   この倉庫は誰でも読めるので、そのままの文字で置くと
 *   「誰に声をかけようとしているか」が外から検索で分かってしまう（kp185）。
 */
const FORBIDDEN_HANDLES_B64: readonly string[] = [
  "c21pbGUuY3JlcGU=",
  "a2FpdGVueWFraS44MzE=",
  "dG9yaW5jaHl1",
  "YmlzdHJvdG1vbnRwb3J0ZQ==",
  "Zm9vZHRydWNrLmdpbnlh",
  "bml0dGFjbw==",
  "b3V0LXJpcA==",
  "Z3VyYXB1cm8=",
] as const;

test("送り先は8軒で、画面に出るのはお店の種類だけ（連絡先は1つも出さない）", () => {
  assert.equal(OUTREACH_SHOPS.length, 8);
  const shown = OUTREACH_SHOPS.map((s) => `${s.label} ${s.note ?? ""}`).join(" ");
  // メールアドレスらしきもの・LINEのIDらしきもの（英字のドット区切り）が無いこと
  assert.ok(!/@/.test(shown), "画面に出す文字にメールアドレスが入っている");
  assert.ok(!/[a-zA-Z0-9]+\.[a-zA-Z0-9]+/.test(shown), "画面に出す文字に連絡先らしきIDが入っている");
  // ファイル全体でも、司令室にある実際の宛先を写し取っていないこと。
  //
  // ★ここに宛先をそのままの文字で書かないこと（2026-09-25・kp185）。
  //   この倉庫（GitHub）は誰でも読める状態で、しかも検索にも載っている。
  //   そのままの文字で書くと、**この検算ファイルそのものが「送り先の一覧」になり**、
  //   お店の名前で検索した人に見つかる。中身は同じまま、読めない形（Base64）で持つ。
  //   見張る力は1ミリも落ちない（下で元に戻してから照合している）。
  for (const encoded of FORBIDDEN_HANDLES_B64) {
    const handle = Buffer.from(encoded, "base64").toString("utf8");
    assert.ok(!lib.includes(handle), "連絡先がファイルに入っている");
    assert.ok(!view.includes(handle), "連絡先が画面のファイルに入っている");
    // この検算ファイル自身にも、そのままの文字で入っていないこと（戻り止め）
    assert.ok(
      !self.includes(handle),
      "連絡先が検算ファイルにそのままの文字で入っている",
    );
  }
});

test("送る文に値段は入れない（受け取る8軒は同じ出店先の同業のため）", () => {
  assert.ok(!/15,?000/.test(OUTREACH_MESSAGE));
  assert.ok(!/円/.test(OUTREACH_MESSAGE));
  assert.ok(!/[0-9]{3,}/.test(OUTREACH_MESSAGE.replace(OUTREACH_LINK, "")));
});

test("送る文は司令室の4行と同じで、リンクは案内ページ1本だけ", () => {
  const lines = OUTREACH_MESSAGE.split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith("◯◯さん、手羽屋の川畑です。"));
  assert.equal(lines[3], OUTREACH_LINK);
  assert.ok(OUTREACH_LINK.endsWith("/keiri/case"));
  assert.equal(OUTREACH_MESSAGE.match(/https?:\/\//g)?.length, 1);
});

test("帯が出るのは『じゅんの端末』だけ。印が無ければ絶対に出ない", () => {
  const base = { sent: [], snoozedOn: null, today: "2026-09-25" };
  assert.equal(shouldShowNudge({ ...base, ownerDevice: false }), false);
  assert.equal(shouldShowNudge({ ...base, ownerDevice: true }), true);
});

test("今日は出さない／8軒ぜんぶ送った、のときは出ない", () => {
  const all = OUTREACH_SHOPS.map((s) => s.id);
  assert.equal(
    shouldShowNudge({ ownerDevice: true, sent: [], snoozedOn: "2026-09-25", today: "2026-09-25" }),
    false,
  );
  // 日が変われば、また出る
  assert.equal(
    shouldShowNudge({ ownerDevice: true, sent: [], snoozedOn: "2026-09-24", today: "2026-09-25" }),
    true,
  );
  assert.equal(
    shouldShowNudge({ ownerDevice: true, sent: all, snoozedOn: null, today: "2026-09-25" }),
    false,
  );
  // 1軒でも残っていれば出る
  assert.equal(
    shouldShowNudge({ ownerDevice: true, sent: all.slice(1), snoozedOn: null, today: "2026-09-25" }),
    true,
  );
});

test("送った印の読み書き：知らない名前は捨て、並び順は送り先の順にそろう", () => {
  assert.deepEqual(parseSent("crepe,tori,よその店,crepe"), ["crepe", "tori"]);
  assert.deepEqual(parseSent(null), []);
  assert.equal(serializeSent(["tori", "crepe"]), "crepe,tori");
  assert.equal(remainingShops(["crepe"]).length, 7);
});

test("今日の日付は日本時間で決まる（夜中に日付が変わってすぐ帯が戻らない）", () => {
  // 世界標準時 2026-09-24 15:30 は 日本時間で 9/25 00:30
  assert.equal(todayKey(new Date("2026-09-24T15:30:00Z")), "2026-09-25");
  assert.equal(todayKey(new Date("2026-09-24T14:30:00Z")), "2026-09-24");
});

test("帯はホームのいちばん上（月間売上まとめより前）に置く", () => {
  const nudge = home.indexOf("<OwnerOutreachNudge />");
  const summary = home.indexOf("<MonthlySummary />");
  assert.ok(nudge > 0, "ホームに帯が置かれていない");
  assert.ok(nudge < summary, "帯が月間売上まとめより下にある");
});

test("印を付けるのは手羽屋の合言葉が合ったときだけ（お店の合言葉では付けない）", () => {
  const gate = fs.readFileSync(
    path.join(process.cwd(), "app", "components", "AdminGate.tsx"),
    "utf8",
  );
  assert.ok(gate.includes("markOwnerDevice()"));
  // 印を付ける場所は2か所だけ（kp146 で1か所増やした）
  //   ①合言葉を入力して合ったとき ②すでに手羽屋の管理者として入っていたとき
  const marks = [...gate.matchAll(/markOwnerDevice\(\)/g)].map((m) => m.index ?? -1);
  assert.equal(marks.length, 2, "印を付ける場所が2か所ではない");

  const tebaya = gate.indexOf("if (checkAdminPassword(pw))");
  const shop = gate.indexOf('"/api/keiri/login"');

  // ②すでに入っているときの1か所。お店の枝（/api/keiri/login）より前で、
  //   かつ shouldMarkOwnerDeviceOnRestore で守られていること
  const restore = marks[0];
  assert.ok(restore < tebaya, "すでに入っているときの印が、合言葉の枝より後にある");
  const guard = gate.indexOf("shouldMarkOwnerDeviceOnRestore({");
  assert.ok(guard > 0 && guard < restore, "すでに入っているときの印が守られていない");

  // ①合言葉が合ったときの1か所。手羽屋の枝の中（お店の枝より前）にあること
  const onLogin = marks[1];
  assert.ok(tebaya < onLogin && onLogin < shop, "印を付ける場所が手羽屋の枝の中にない");

  // お店の合言葉の枝より後には1つも無いこと
  assert.ok(
    marks.every((i) => i < shop),
    "お店の合言葉の枝で印を付けている",
  );
});

test("帯は日報のデータを読み書きしない（倉庫にも外にもつながない）", () => {
  for (const word of ["supabase", "fetch(", "daily_reports"]) {
    assert.ok(!view.includes(word), `帯が ${word} を使っている`);
    assert.ok(!lib.includes(word), `帯の中身が ${word} を使っている`);
  }
});

test("読み込み中は何も出さない（スタッフの画面に一瞬でも出さない）", () => {
  assert.ok(view.includes("if (checking) return null;"));
});

/**
 * kp146：印を付けるのが「合言葉を入力した瞬間」だけだと、
 * タブを開いたままの端末には印が永久に付かず、帯が一度も出ない。
 * すでに入っていること自体が「合言葉を入れた端末」の証拠なので、そのときも付ける。
 */
test("すでに手羽屋の管理者として入っているなら、じゅんの端末の印を付け直す", () => {
  assert.equal(
    shouldMarkOwnerDeviceOnRestore({
      tebayaAdminSession: true,
      passwordConfigured: true,
    }),
    true,
  );
});

test("入っていないときは印を付けない", () => {
  assert.equal(
    shouldMarkOwnerDeviceOnRestore({
      tebayaAdminSession: false,
      passwordConfigured: true,
    }),
    false,
  );
});

test("管理者パスワードが未設定なら、入っていても印を付けない（誰も管理者にしない）", () => {
  assert.equal(
    shouldMarkOwnerDeviceOnRestore({
      tebayaAdminSession: true,
      passwordConfigured: false,
    }),
    false,
  );
});

/** 帯は、じゅんが合言葉を入れた直後に居る画面（管理者ページ）にも出す */
test("管理者ページにも帯が置かれている", () => {
  const adminPage = fs.readFileSync(
    path.join(process.cwd(), "app", "admin", "page.tsx"),
    "utf8",
  );
  assert.ok(
    adminPage.includes("<OwnerOutreachNudge />"),
    "管理者ページに帯が置かれていない",
  );
});

/**
 * 1タップの印付けリンク（kp147）の戻り止め。
 *
 * ここが崩れると「帯が一度も出ない」に戻る（印が付く道が合言葉の1本だけになる）か、
 * 逆に「誰の端末にも勝手に印が付く」になる。
 */
test("リンクの中身から、印を付ける／外す／何もしない が正しく決まる", () => {
  assert.equal(ownerMarkFromQuery("1"), "mark");
  assert.equal(ownerMarkFromQuery("true"), "mark");
  assert.equal(ownerMarkFromQuery(" YES "), "mark");
  assert.equal(ownerMarkFromQuery("0"), "unmark");
  assert.equal(ownerMarkFromQuery("false"), "unmark");
  // 印のない普通の表示では、何もしない（＝今までどおり）
  assert.equal(ownerMarkFromQuery(null), null);
  assert.equal(ownerMarkFromQuery(undefined), null);
  assert.equal(ownerMarkFromQuery(""), null);
  assert.equal(ownerMarkFromQuery("あ"), null);
});

test("じゅんに渡すリンクは、ホームに ?owner=1 を付けたものである", () => {
  assert.equal(OWNER_MARK_PARAM, "owner");
  assert.ok(
    OWNER_MARK_LINK.endsWith("/?owner=1"),
    `リンクの形が変わっている: ${OWNER_MARK_LINK}`,
  );
  assert.ok(OWNER_MARK_LINK.startsWith("https://"), "リンクが https で始まっていない");
});

test("帯の側で、リンクを読んで印を付け・外しし、住所から印を消している", () => {
  const nudge = fs.readFileSync(
    path.join(process.cwd(), "app", "components", "OwnerOutreachNudge.tsx"),
    "utf8",
  );
  assert.ok(nudge.includes("ownerMarkFromQuery"), "リンクを読んでいない");
  assert.ok(nudge.includes("markOwnerDevice()"), "印を付けていない");
  assert.ok(nudge.includes("clearOwnerDevice()"), "印を外せない（押し間違えを戻せない）");
  assert.ok(
    nudge.includes("searchParams.delete(OWNER_MARK_PARAM)"),
    "住所の欄にリンクの印が残ったままになる",
  );
});

/** 合言葉の判定は1文字も変えていない（印はあくまで帯の出し分けだけ） */
test("印を付けても、管理者ページに入れるようにはならない", () => {
  const gate = fs.readFileSync(
    path.join(process.cwd(), "app", "components", "AdminGate.tsx"),
    "utf8",
  );
  assert.ok(
    !gate.includes("readOwnerDevice"),
    "合言葉の入り口が、端末の印を見て開くようになっている",
  );
  assert.ok(
    !gate.includes(OWNER_MARK_PARAM + "="),
    "合言葉の入り口がリンクの印を見ている",
  );
});

/* ── LINE を開いて送り先を選ぶだけにするリンク（kp151） ───────────────── */

test("LINEで送るリンクは、LINEの『送り先を選ぶ』画面を開くだけ（勝手に送らない）", () => {
  const url = new URL(OUTREACH_LINE_SHARE_URL);
  assert.equal(url.protocol, "https:");
  assert.equal(url.host, "line.me");
  assert.equal(url.pathname, "/R/share");
  // 送り先は入っていない＝誰かに自動で飛ぶことはない
  assert.equal(url.searchParams.get("to"), null);
  assert.equal(url.searchParams.get("text"), OUTREACH_MESSAGE_SHARE);
});

test("送り先を選ぶ画面に渡す文には、宛名の空欄（◯◯さん）を入れない", () => {
  // 選ぶ画面では文を直せないので、空欄のまま相手に届いてしまう
  assert.ok(!OUTREACH_MESSAGE_SHARE.includes("◯◯"));
  assert.ok(OUTREACH_MESSAGE.startsWith("◯◯さん、"));
  assert.ok(OUTREACH_MESSAGE_SHARE.startsWith("手羽屋の川畑です。"));
});

test("送り先を選ぶ画面に渡す文も、値段と連絡先を入れない（コピー用と同じ決まり）", () => {
  assert.ok(!/円/.test(OUTREACH_MESSAGE_SHARE));
  assert.ok(!/15,?000/.test(OUTREACH_MESSAGE_SHARE));
  assert.ok(!/@/.test(OUTREACH_MESSAGE_SHARE));
  assert.equal(OUTREACH_MESSAGE_SHARE.match(/https?:\/\//g)?.length, 1);
  assert.ok(OUTREACH_MESSAGE_SHARE.includes(OUTREACH_LINK));
});

test("帯にはLINEで送るリンクがあり、うまく開かないときのコピーも残っている", () => {
  assert.ok(view.includes("OUTREACH_LINE_SHARE_URL"));
  assert.ok(view.includes("LINEで送る"));
  assert.ok(view.includes("コピー"));
  // 別のタブで開く（日報アプリの画面を置きかえない）
  assert.ok(view.includes('rel="noopener noreferrer"'));
});

/**
 * kp154：8軒を一度に並べると、押す前に「どこにしようか」で手が止まる。
 * こちらで1軒だけ名指しして、じゅんの判断を「この1軒に送る／別にする」の2択にする。
 */
test("今日の1軒は、まだ送っていない中の1軒。送るたびに次の1軒に進む", () => {
  assert.equal(nextShop([])?.id, OUTREACH_SHOPS[0].id);
  assert.equal(nextShop(["crepe"])?.id, "kaitenyaki");
  assert.equal(nextShop(OUTREACH_SHOPS.map((s) => s.id)), null);
});

test("今日の1軒は、LINEで送れる1軒を先に出す（メールのみの1軒は最後）", () => {
  const mailOnly = OUTREACH_SHOPS.filter((s) => s.note).map((s) => s.id);
  assert.ok(mailOnly.length > 0, "但し書きの付いた1軒が無い");
  // LINE で送れる相手が1軒でも残っていれば、そちらを名指しする
  const lineOnlyLeft = OUTREACH_SHOPS.filter((s) => s.note || s.id === "night").map((s) => s.id);
  const sentRest = OUTREACH_SHOPS.map((s) => s.id).filter((id) => !lineOnlyLeft.includes(id));
  assert.equal(nextShop(sentRest)?.id, "night");
  // メールのみの1軒しか残っていなければ、それを出す
  const allButMail = OUTREACH_SHOPS.map((s) => s.id).filter((id) => !mailOnly.includes(id));
  assert.equal(nextShop(allButMail)?.id, mailOnly[0]);
});

test("帯には『今日の1軒』と『送りました』が出て、8軒の一覧はたたんである", () => {
  // 説明文（コメント）ではなく、画面に出る所にあること
  assert.ok(view.includes(">今日の1軒</p>"), "今日の1軒が画面に出ていない");
  assert.ok(view.includes("{today1.label}"), "今日の1軒のお店の名前が出ていない");
  assert.ok(view.includes("送りました（"), "送りましたのボタンが無い");
  assert.ok(view.includes("<details"), "8軒の一覧がたたまれていない");
  assert.ok(view.includes("別の1軒にする"), "別の1軒にする道が無い");
  // 8軒ぜんぶを押せる道は残っていること（印を直せなくならないため）
  assert.ok(view.includes("OUTREACH_SHOPS.map("), "8軒の一覧が消えている");
});

test("［LINEで送る］は今までどおり、いちばん上の大きいボタンのまま", () => {
  const line = view.indexOf("LINEで送る（相手を選ぶだけ）");
  const copy = view.indexOf("うまく開かないときは文をコピー");
  const sentBtn = view.indexOf("送りました（");
  assert.ok(line > 0 && copy > line, "コピーの道が LINE より前にある");
  assert.ok(sentBtn > line, "送りましたが LINE より前にある");
});
