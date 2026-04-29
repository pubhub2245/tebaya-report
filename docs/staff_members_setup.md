# staff_members テーブル セットアップ手順

スタッフマスタを Supabase に追加する手順です。プログラミング不要、ブラウザでコピペするだけで完了します。

## 所要時間
約 3 分

## 手順

### 1. Supabase Dashboard を開く

ブラウザで以下のURLを開いてください：

```
https://supabase.com/dashboard/project/vtuyebyjbvjmucqpkxug/sql/new
```

（プロジェクトID: `vtuyebyjbvjmucqpkxug` の SQL Editor 新規タブ）

### 2. テーブル定義を実行（1回目）

下のブロックを丸ごとコピーして SQL Editor に貼り付け、右下の **Run** ボタンを押してください。

```sql
CREATE TABLE IF NOT EXISTS staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  aliases TEXT[] DEFAULT '{}',
  unit_number SMALLINT,
  daily_wage INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at DATE,
  retired_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_members_name ON staff_members(name);
CREATE INDEX IF NOT EXISTS idx_staff_members_aliases ON staff_members USING gin(aliases);
CREATE INDEX IF NOT EXISTS idx_staff_members_unit ON staff_members(unit_number);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_members_all_public" ON staff_members;
CREATE POLICY "staff_members_all_public" ON staff_members
  FOR ALL USING (true) WITH CHECK (true);
```

`Success. No rows returned` が表示されればOK。

### 3. 初期データを投入（2回目）

SQL Editor をクリアして、下のブロックを貼り付けて **Run**：

```sql
INSERT INTO staff_members (name, aliases, unit_number, daily_wage, is_active, retired_at, notes)
VALUES
  ('じゅん', ARRAY['川畑潤一郎']::text[], 1, 10000, true, NULL,
    '株式会社Alpha代表・1番隊'),
  ('イデ', ARRAY['井手','idehiro（イデさん）_Fairy']::text[], 1, 9000, true, NULL,
    '本名は井手。1番隊'),
  ('かずき', ARRAY[]::text[], 2, 10000, true, NULL,
    '2番隊'),
  ('なぎさ', ARRAY[]::text[], 2, NULL, true, NULL,
    '2番隊・月給制（¥200,000、200h想定で¥1,000/h）'),
  ('岡田', ARRAY[]::text[], 1, NULL, false, NULL,
    '退社済み（退社日不明）。在籍中は1番隊'),
  ('瀬戸口', ARRAY['りゅうき','あ　Ryuki','あ Ryuki']::text[], 1, NULL, false, '2026-04-10',
    '本名は瀬戸口、ニックネームりゅうき。2026/4/10頃退社。在籍中は1番隊'),
  ('想生', ARRAY['さよ']::text[], 1, NULL, false, '2025-12-13',
    '手羽屋初期メンバー（2025/12）。2025/12/13グループから削除'),
  ('ゆうと', ARRAY['緒方悠斗','緒方祐人']::text[], NULL, NULL, true, NULL,
    '手羽屋代表。日報担当外のため番隊なし')
ON CONFLICT (name) DO UPDATE SET
  aliases = EXCLUDED.aliases,
  unit_number = EXCLUDED.unit_number,
  daily_wage = EXCLUDED.daily_wage,
  is_active = EXCLUDED.is_active,
  retired_at = EXCLUDED.retired_at,
  notes = EXCLUDED.notes,
  updated_at = now();
```

`Success. No rows returned` が出れば成功。

### 4. 確認

SQL Editor をクリアして、下を貼って **Run**：

```sql
SELECT name, unit_number, daily_wage, is_active, retired_at, notes
FROM staff_members
ORDER BY is_active DESC, unit_number NULLS LAST, name;
```

下記8件が表示されればセットアップ完了です：

| name | unit | wage | active | retired |
|------|------|------|--------|---------|
| じゅん | 1 | 10000 | true | - |
| イデ | 1 | 9000 | true | - |
| ゆうと | - | - | true | - |
| かずき | 2 | 10000 | true | - |
| なぎさ | 2 | - | true | - |
| 岡田 | 1 | - | false | - |
| 瀬戸口 | 1 | - | false | 2026-04-10 |
| 想生 | 1 | - | false | 2025-12-13 |

## 名寄せの動作テスト（任意）

下のSQLを実行すると、別名（aliases）から正規名へ引けることを確認できます：

```sql
-- 「井手」→ 「イデ」を引く
SELECT name, unit_number FROM staff_members WHERE ' 井手' = ANY(aliases);

-- 「りゅうき」→ 「瀬戸口」
SELECT name, unit_number FROM staff_members WHERE 'りゅうき' = ANY(aliases);
```

## 困ったとき

- `Success. No rows returned` 以外（赤エラー）が出た場合：エラー文をそのままコピーして相談してください
- 一度実行済みでも、SEED SQLは ON CONFLICT で安全に再実行できます（既存データを最新値で更新）

## 関連ファイル
- `supabase/migrations/staff_members.sql` — テーブル定義（このドキュメントの2と同じ内容）
- `supabase/migrations/staff_members_seed.sql` — 初期データ（このドキュメントの3と同じ内容）
- `lib/staffMatcher.ts` — 名寄せヘルパー関数（コード側で使用）
