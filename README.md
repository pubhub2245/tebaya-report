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
3. Supabaseで `supabase/schema.sql` を実行。
4. 開発サーバー起動:
   ```
   npm run dev
   ```

## 機能
- 7ステップのモバイル最適化フォーム（進捗バー付き）
- localStorage自動保存（途中離脱しても復元）
- Claude `claude-sonnet-4-20250514` でレシートOCR自動入力
- 粗利自動計算（Food 25% / Labor ¥10,000 / Rent 10% / 建替経費）
- LINE貼付用テキスト生成・ワンタップコピー
- Supabase保存

## 構成
- `app/page.tsx` - 7ステップフォーム本体
- `app/api/ocr/route.ts` - Claude API経由のレシートOCR
- `lib/supabase.ts` / `lib/formState.ts` / `lib/lineText.ts` / `lib/format.ts`
- `supabase/schema.sql` - テーブル定義
