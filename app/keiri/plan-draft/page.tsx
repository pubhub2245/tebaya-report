import { redirect } from "next/navigation";

/**
 * 「経理まるごと」の1枚の、昔の住所（下書きのときの住所）。
 *
 * ■ なぜ残すか
 *   10/3 10:20 の報告で、じゅんに
 *   「見ていただきたい下書きが1枚あります ▶ /keiri/plan-draft」と住所をお渡ししています。
 *   その後この1枚を公開して /keiri/plan に移したので、
 *   **前の住所を開いた人がそのまま新しい1枚に着くように**、ここで送っています。
 *   （ページを消すと、お渡しした住所が開けなくなります）
 *
 * ★中身はありません。/keiri/plan へ送るだけです。
 */

export default function KeiriPlanDraftRedirect() {
  redirect("/keiri/plan");
}
