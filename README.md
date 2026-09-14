# 手羽屋 営業後日報

骨なし手羽先催事販売のスマホ向け日報入力アプリ。1問ずつ答えていくと最後にLINE貼付用テキストが生成されます。

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
