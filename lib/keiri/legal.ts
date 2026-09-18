/**
 * 経理パッケージの「特定商取引法に基づく表記」と「会社概要」の文言。
 *
 * ★ここが唯一の正。画面に文章を直書きしない（support.ts と同じ作り）。
 * ★原稿は じゅん が 2026-09-18 に確定したもの（司令室 notes/keiri-tokushoho）。
 *   数字が動くもの（価格）だけは caseNumbers.ts から引き、ここに書き写さない。
 * ★店の中のデータは一切読まない。手羽屋の日報・シフト・レジ・LINE には関係しない。
 */

import { KEIRI_PRICE, priceLabel } from "./caseNumbers";

/** 会社概要（だれが売っているか） */
export const KEIRI_COMPANY = {
  name: "株式会社Alpha",
  representative: "代表取締役 川畑 潤一郎",
  address: "東京都杉並区上荜1-18-3 亀屋酒販第二ビル210",
  corporateNumber: "4012801020444",
  tel: "070-5417-3591",
  email: "jun@alpha-mj.co.jp",
  business:
    "飲食店の運営、飲食店向け業務システムの開発・提供、出張シーシャサービスの提供、店舗運営のコンサルティング",
} as const;

export type LegalRow = { label: string; value: string };

/**
 * 特定商取引法に基づく表記の中身。
 * 販売価格だけは caseNumbers.ts の値から作る（値上げしたときに2か所直さなくて済むように）。
 */
export function tokushohoRows(): LegalRow[] {
  return [
    { label: "販売事業者名", value: KEIRI_COMPANY.name },
    { label: "運営統括責任者", value: "川畑 潤一郎" },
    { label: "所在地", value: KEIRI_COMPANY.address },
    { label: "電話番号", value: KEIRI_COMPANY.tel },
    { label: "メールアドレス", value: KEIRI_COMPANY.email },
    { label: "販売価格", value: priceLabel() },
    {
      label: "商品代金以外に必要な費用",
      value: "なし（インターネット接続料・通信料はお客様のご負担となります）",
    },
    { label: "支払方法", value: "クレジットカード決済（Stripe）" },
    {
      label: "支払時期",
      value: "お申し込み時に初回分を決済し、以後は毎月同日に自動で決済されます",
    },
    { label: "サービスの提供時期", value: "決済完了後、ただちにご利用いただけます" },
    {
      label: "解約について",
      value: KEIRI_PRICE.cancelAnytime
        ? "Stripe のカスタマーポータルからいつでも解約できます。解約された場合、次回の請求日以降の課金は行いません"
        : "解約の条件はお問い合わせください",
    },
    {
      label: "返品・返金について",
      value:
        "サービスの性質上、決済後の返金および日割りでの返金は行っておりません。解約後も、その月の期間中はご利用いただけます",
    },
    { label: "動作環境", value: "インターネットに接続できるパソコン・スマートフォンのブラウザ" },
  ];
}

/** 会社概要の中身 */
export function companyRows(): LegalRow[] {
  return [
    { label: "会社名", value: KEIRI_COMPANY.name },
    { label: "代表者", value: KEIRI_COMPANY.representative },
    { label: "所在地", value: KEIRI_COMPANY.address },
    { label: "法人番号", value: KEIRI_COMPANY.corporateNumber },
    { label: "電話番号", value: KEIRI_COMPANY.tel },
    { label: "メールアドレス", value: KEIRI_COMPANY.email },
    { label: "事業内容", value: KEIRI_COMPANY.business },
  ];
}
