-- ============================================================
-- 出店場所マスタに「出店料（場代）の決まり」を持たせる
-- ============================================================
-- ■ なぜ必要か
--   場代は毎回スタッフが手で「場代／◯◯円」と打っていた。
--   お店ごとに決まり（売上の10％ ／ 定額）があるのに、それがどこにも
--   書かれていないので、打ち忘れ・打ち間違い・計算ミスが起きる。
--   実データでも4月は ながやま27日中23日、PASIO 6日中5日で場代の記録が無かった。
--
-- ■ これからのルール
--   決まりは **出店場所マスタ（locations）が正**（日当・ランクと同じ考え方）。
--   日報のSTEP5で、その日の売上から場代を自動で計算して1行入れる。
--   金額はその場で直せる（お祭りなど、いつもと違うときのため）。
--
-- ■ 列の意味
--   booth_fee_type  : 'percent'（売上の◯％） / 'fixed'（定額） / 'none'（なし・未設定）
--   booth_fee_rate  : percent のときの割合。10 なら 10％
--   booth_fee_amount: fixed のときの金額（円）
--
-- ■ 入れる値（2026-09 ユーザー確認ずみ）
--   売上の10％：ながやま6店 ／ PASIO4店 ／ AZ隼人
--   定額      ：ニシムタ 5,000円 ／ イオンモール 8,250円
--   なし      ：上記以外（マンガ倉庫などは決まりが分かり次第マスタで設定する）
--   ※1円未満は発生しない（切り捨て）。

alter table public.locations
  add column if not exists booth_fee_type text not null default 'none'
    check (booth_fee_type in ('none', 'percent', 'fixed')),
  add column if not exists booth_fee_rate numeric(5,2),
  add column if not exists booth_fee_amount integer;

comment on column public.locations.booth_fee_type is
  '出店料（場代）の決め方。percent=売上の◯％ / fixed=定額 / none=なし・未設定';
comment on column public.locations.booth_fee_rate is
  'booth_fee_type=percent のときの割合（10 なら売上の10％）。1円未満は切り捨て';
comment on column public.locations.booth_fee_amount is
  'booth_fee_type=fixed のときの金額（円）';

-- 売上の10％
update public.locations
   set booth_fee_type = 'percent', booth_fee_rate = 10, booth_fee_amount = null
 where name in ('ながやま三股','ながやま若葉','ながやま山田','ながやま都北',
                'ながやま志比田','ながやま鷹尾',
                'PASIO高城','PASIO早鈴','PASIO志比田','PASIO鷹尾',
                'AZ隼人');

-- 定額
update public.locations
   set booth_fee_type = 'fixed', booth_fee_amount = 5000, booth_fee_rate = null
 where name = 'ニシムタ';

update public.locations
   set booth_fee_type = 'fixed', booth_fee_amount = 8250, booth_fee_rate = null
 where name = 'イオンモール';
