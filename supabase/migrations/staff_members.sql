-- staff_members table
-- スタッフマスタ（番隊・日給・在籍状況・名寄せ別名）

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

-- RLS（既存テーブルに合わせて全許可ポリシー）
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_members_all_public" ON staff_members;
CREATE POLICY "staff_members_all_public" ON staff_members
  FOR ALL USING (true) WITH CHECK (true);
