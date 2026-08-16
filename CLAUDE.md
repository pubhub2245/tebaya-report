# 手羽屋 日報アプリ - CLAUDE.md

## プロジェクト概要
- 手羽屋(移動販売/出店形式の飲食事業)の営業日報・売上管理アプリ
- 運営: 川畑潤一郎さん関連事業

## 技術スタック
- Next.js 14(App Router)/ TypeScript
- Supabase(プロジェクトID: vtuyebyjbvjmucqpkxug)
- Vercel(本番: https://tebaya-report.vercel.app)
- GitHub: pubhub2245/tebaya-report

## ユーザーについて・説明の仕方(超重要)
- 川畑潤一郎さん。プログラミング完全未経験。コードは書かず、ターミナル操作もしない(ブラウザ操作のみ担当)
- Claude Codeへの指示は、設計担当の別Claudeが組み立てて渡してくる
- 技術用語には必ずカッコ書きで日常的な例え話を添える
  (例: GitHub=設計図のロッカー / Supabase=データの倉庫 / Vercel=アプリを世界に届ける配送センター / デプロイ=修正したお店を実際にオープンする作業)
- 変更内容は「何を・なぜ・どうなるか」を小学生にも分かる言葉で説明する

## 安全ルール(絶対厳守)
以下は絶対に実行禁止。必要な場合は「何を・なぜ・どんな影響があるか」を説明してユーザーの許可を得ること。
1. 復元不可能な操作: DROP TABLE / 条件なしのDELETE FROM / git push --force / rm -rf / git reset --hard
2. 料金が発生する操作: 有料APIの新規契約・課金プランへのアップグレード・有料機能の有効化

## 参照データ
機能一覧・スタッフ・出店場所は .claude/skills/tebaya-reference/SKILL.md にある。該当する作業のときだけ読むこと。
