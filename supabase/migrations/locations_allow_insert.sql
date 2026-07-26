-- 出店場所マスタを管理画面から追加できるように INSERT を許可
-- （削除は shifts 等から参照されるため許可せず、無効化(is_active)で運用）
drop policy if exists loc_insert on public.locations;
create policy loc_insert on public.locations
  for insert to public with check (true);
