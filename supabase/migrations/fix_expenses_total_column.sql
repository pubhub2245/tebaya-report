-- ============================================================
-- daily_reports.expenses_total を自動計算されるようにする
-- ============================================================
-- 経緯：この列は前から存在するが値が入っておらず（全150件が0）、
-- コードからも誰も読んでいなかった（「バグのため使わない」というコメントだけが残っていた）。
--
-- なぜ直すか：集計画面（現金残高・管理者ページ・売上報告）は合計金額しか要らないのに、
-- 経費の明細ごと（＝レシート写真の巨大な文字列ごと）取得していて、
-- たった12件の写真つき日報のせいで毎回18MBをダウンロードしていた。
-- 合計を列として持てば、集計画面は写真を取らずに済む。
--
-- 列は消さずに、トリガー（自動で計算する仕掛け）で維持する。

create or replace function public.sync_expenses_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.expenses_total := coalesce((
    select sum(coalesce((x->>'amount')::numeric, 0))::integer
    from jsonb_array_elements(
      case when jsonb_typeof(new.expenses) = 'array' then new.expenses else '[]'::jsonb end
    ) as x
  ), 0);
  return new;
end $$;

comment on function public.sync_expenses_total is
  'daily_reports.expenses（明細）から expenses_total（合計）を自動計算する。集計画面が写真を含む明細を取得せずに済むようにするため。';

drop trigger if exists trg_sync_expenses_total on public.daily_reports;
create trigger trg_sync_expenses_total
  before insert or update of expenses on public.daily_reports
  for each row execute function public.sync_expenses_total();

-- 既存の日報の値を埋める（expenses 列は読むだけで書き換えない）
update public.daily_reports r
set expenses_total = coalesce((
  select sum(coalesce((x->>'amount')::numeric, 0))::integer
  from jsonb_array_elements(
    case when jsonb_typeof(r.expenses) = 'array' then r.expenses else '[]'::jsonb end
  ) as x
), 0)
where expenses_total is distinct from coalesce((
  select sum(coalesce((x->>'amount')::numeric, 0))::integer
  from jsonb_array_elements(
    case when jsonb_typeof(r.expenses) = 'array' then r.expenses else '[]'::jsonb end
  ) as x
), 0);

comment on column public.daily_reports.expenses_total is
  'expenses の amount 合計（円）。トリガーで自動計算。集計画面はこの列を使い、明細は取得しない。';
