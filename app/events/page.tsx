import EventsView from "./EventsView";

export const metadata = {
  title: "イベント段取り | 手羽屋",
};

/**
 * イベント・お祭りの段取り（2026-10-18 追加）。
 * 鳥の発注本数・発注日・骨抜きの担当・フライヤー・電源・注意点を1枚にまとめ、
 * スタッフのLINEに貼る文章をボタン1つでコピーできる。決まりは lib/eventPlan.ts。
 */
export default function EventsPage() {
  return <EventsView />;
}
