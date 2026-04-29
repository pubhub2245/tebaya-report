-- staff_members 初期データ
-- ON CONFLICT で再実行可能

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
