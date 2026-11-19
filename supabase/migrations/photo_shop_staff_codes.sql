-- ============================================================
-- 写真だけの日報のお店：スタッフ用の合言葉を、画面から変えられるようにする（2026-11-19）
--
-- ■ やさしい説明
--   スタッフ用の合言葉は、はじめはコードに書いた仮の値（1111）です。
--   店主の合言葉を知っている人が画面から新しい合言葉を決めると、ここに
--   「戻せない形（sha256）」で1行入り、それ以降は仮の値では入れなくなります。
--
-- ■ 鍵
--   この棚は外（anon）からは読めも書けもしません（決まりを1本も置かない）。
--   触れるのは下の3つの窓口だけで、窓口は合ったかどうか・お店の番号しか返しません。
--   サーバー側の合鍵（service role）が壊れていても動くように、窓口は security definer。
--
-- ★ 追加だけ。既存の棚・窓口には触れていない。
-- ============================================================

create table if not exists public.keiri_photo_shop_staff_codes (
  tenant_id uuid primary key references public.keiri_tenants(id),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.keiri_photo_shop_staff_codes enable row level security;
revoke all on table public.keiri_photo_shop_staff_codes from anon, authenticated;

comment on table public.keiri_photo_shop_staff_codes is
  '写真だけの日報のお店のスタッフ用合言葉（戻せない形）。窓口からだけ触る（2026-11-19）';

-- ① スタッフの合言葉で入る：合ったお店の番号だけ返す（2軒以上ならどこにも入れない）
create or replace function public.photo_shop_staff_login(p_hash text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with hit as (
    select c.tenant_id
      from public.keiri_photo_shop_staff_codes c
      join public.keiri_tenants t on t.id = c.tenant_id and t.status = 'active'
     where p_hash ~ '^[0-9a-f]{64}$'
       and c.code_hash = p_hash
     limit 2
  )
  select tenant_id from hit where (select count(*) from hit) = 1;
$$;

-- ② そのお店の合言葉が、もう画面から決められているか（決められていれば仮の値は使わない）
create or replace function public.photo_shop_staff_code_is_set(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.keiri_photo_shop_staff_codes where tenant_id = p_tenant);
$$;

-- ③ 合言葉を変える：店主の合言葉（戻せない形）が合ったときだけ書く
create or replace function public.photo_shop_set_staff_code(p_tenant uuid, p_owner_hash text, p_new_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_owner_hash !~ '^[0-9a-f]{64}$' or p_new_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  if not exists (
    select 1 from public.keiri_tenants t
     where t.id = p_tenant and t.status = 'active' and t.admin_password_hash = p_owner_hash
  ) then
    return false;
  end if;
  -- 店主の合言葉と同じにはさせない（スタッフに店主の画面を開かせないため）
  if p_new_hash = p_owner_hash then
    return false;
  end if;
  insert into public.keiri_photo_shop_staff_codes (tenant_id, code_hash, updated_at)
  values (p_tenant, p_new_hash, now())
  on conflict (tenant_id) do update set code_hash = excluded.code_hash, updated_at = now();
  return true;
end;
$$;

revoke all on function public.photo_shop_staff_login(text) from public;
revoke all on function public.photo_shop_staff_code_is_set(uuid) from public;
revoke all on function public.photo_shop_set_staff_code(uuid, text, text) from public;
grant execute on function public.photo_shop_staff_login(text) to anon, authenticated;
grant execute on function public.photo_shop_staff_code_is_set(uuid) to anon, authenticated;
grant execute on function public.photo_shop_set_staff_code(uuid, text, text) to anon, authenticated;
