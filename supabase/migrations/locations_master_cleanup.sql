-- 出店場所マスタ（locations）を実態に合わせて整える。
--
-- ■ なぜ必要か
--   日報の出店場所が151件で34通りの書き方になっていた。
--   原因は、選択肢が「コードに直書きした一覧」と「このマスタ」の**両方**から
--   作られていたこと（例：コードは「ながやま 三股店」、マスタは「ながやま三股」）。
--   同じ場所が2通り並ぶので、選ぶ人によって名前が変わっていた。
--   コード側の一覧は削除し、**このマスタだけ**を選択肢にする。
--
-- ■ ここでやること（追加と改名のみ。行は消さない）
--   1) 実際に出店しているのにマスタに無い場所を追加する
--   2) 「パシオ たかお店」→「PASIO鷹尾」に統一（PASIO系の書き方をそろえる）
--   3) 「その他（自由入力）」を選択肢から外す（画面側が自前で用意しているため二重になる）
--
-- ■ 過去の日報は書き換えない
--   昔の日報に入っている名前はそのまま。集計するときに lib/locationName.ts で
--   名前を揃える（名寄せ）ので、ランキングは正しくまとまる。
--
-- ★ 高城（たかじょう）と鷹尾（たかお）は**別の場所**。混ぜないこと。

-- 1) 実在するのにマスタに無かった場所を追加
insert into locations (name, rank, target, is_active)
select v.name, v.rank, v.target, true
from (values
  ('ニシムタ',        'C', 40000),
  ('AZ隼人',          'C', 40000),
  ('ヒロセマルシェ',  'C', 40000)
) as v(name, rank, target)
where not exists (select 1 from locations l where l.name = v.name);

-- 2) PASIO系の書き方をそろえる（「パシオ たかお店」→「PASIO鷹尾」）
update locations set name = 'PASIO鷹尾'
where name = 'パシオ たかお店'
  and not exists (select 1 from locations l2 where l2.name = 'PASIO鷹尾');

-- 3) 「その他（自由入力）」は場所ではなく画面の機能なので、選択肢から外す
--    （行は消さない。過去の記録との対応を残すため）
update locations set is_active = false where name = 'その他（自由入力）';
