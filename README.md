# 手羽屋 営業後日報

骨なし手羽先催事販売のスマホ向け日報入力アプリ。1問ずつ答えていくと最後にLINE貼付用テキストが生成されます。

## 経理パッケージ（このアプリを、よそのお店向けにしたもの）

屋台「手羽屋」が毎日つけているこの日報アプリを、よそのお店でも使える形にしたものです。

- **お店がやること**：これまでどおり日報を書き、レシートは写真を撮るだけ。帳簿・通帳の用意は要りません。
- **こちらがやること**：レシートの読み取りと科目の振り分け、月末の締め。翌月の月はじめに「1枚の要約」と「会計ソフトに取り込めるCSV」（弥生会計／freee／マネーフォワード）をお出しします。
- **見える数字**：日報を1枚書いたその日から、月の利益と今の現金が出ます。月をまたぐのを待つ必要はありません。
- **料金**：月額15,000円（税込）／1店舗。初期費用なし・いつでも解約。
- **実際に使っているお店**：屋台「手羽屋」（宮崎・骨なし手羽先の催事販売）。作って見せているのではなく、自分の店の帳簿をこれで締めています。

ご案内ページ（お申し込みもこの画面から）→ https://tebaya-report.vercel.app/keiri/case?from=gh

## セットアップ

1. 依存をインストール:
   ```
   npm install
   ```
2. `.env.local` を作成（`.env.local.example` を参照）:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ANTHROPIC_API_KEY=...
   ```
   LINE を使う場合は次も設定する（2つのチャンネルは別物。取り違えないこと）:
   ```
   # スタッフ向けBot「手羽屋業務連絡」（日報・設営後チェックの通知先）
   LINE_CHANNEL_ACCESS_TOKEN=...
   LINE_CHANNEL_SECRET=...
   LINE_GROUP_ID=...
   # お客さん向け公式LINE（@276msmys）の受け口（注文・問い合わせの受信）
   LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN=...
   LINE_CUSTOMER_CHANNEL_SECRET=...
   ```
3. Supabaseで `supabase/schema.sql` を実行。
4. 開発サーバー起動:
   ```
   npm run dev
   ```

## 機能
- 7ステップのモバイル最適化フォーム（進捗バー付き）
- sessionStorage自動保存（タブを閉じるとクリア、送信完了後もクリア）
- Claude `claude-sonnet-4-6` でレシートOCR自動入力
- 粗利自動計算（Food 25% / Labor ¥10,000 / Rent 10% / 立替経費）
- LINE貼付用テキスト生成・ワンタップコピー
- Supabase保存

## 構成
- `app/page.tsx` - 7ステップフォーム本体
- `app/api/ocr/route.ts` - Claude API経由のレシートOCR
- `lib/supabase.ts` / `lib/formState.ts` / `lib/lineText.ts` / `lib/format.ts`
- `supabase/schema.sql` - テーブル定義
- `app/api/line/customer/webhook/route.ts` - お客さん向け公式LINEの受け口（`lib/line/customerWebhook.ts` が本体）
- `app/api/line/customer/diagnose/route.ts` - 顧客チャンネルの設定診断
