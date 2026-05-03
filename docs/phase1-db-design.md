# Phase 1 DB 設計案（メール解析方式への移行）

> ⚠️ **本書は提案ドキュメント**。実際のテーブル変更・マイグレーション SQL の実行は含まない。
> 本番適用はじゅんさんレビュー後に Supabase ダッシュボードから手動で実行する想定。

## 背景

シフト自動生成を「PDF 解析」から「Gmail メール解析」へ切り替える。
シフトに 3 状態（confirmed / pending / rejected）を持たせ、メールから生成した「仮シフト」を後で PDF や返信で確定/却下できる仕組みを作る。

3 状態:
- 🟢 **confirmed** — PDF に「手羽屋」と記載された確定日（Phase 3）
- 🟡 **pending** — じゅんさん希望メール送信済み・PDF 未反映（Phase 1）
- 🔴 **rejected** — 大田原さん返信で却下された日（Phase 2）

## 既存 `shifts` テーブルの確認（2026-05 時点）

```
id (int4, PK)
date (date)
location_id (int4, FK → locations.id)
rank (text)
target (int4)
staff_name (text, nullable)
note (text, nullable)
status (text, default 'published')
planned_open_time (time, nullable)
planned_close_time (time, nullable)
published_at (timestamptz, nullable)
line_notified_at (timestamptz, nullable)
created_at (timestamptz, default now())
updated_at (timestamptz, default now())
```

`status` カラムは既存（`'published'` 想定）。今回はこれと別レイヤーの状態管理が必要。

## 提案：追加カラム

| カラム名 | 型 | NULL | 既定値 | 用途 |
|---|---|---|---|---|
| `shift_status` | text | NOT NULL | `'pending'` | 🟢/🟡/🔴 状態。CHECK 制約で `'confirmed' / 'pending' / 'rejected'` のみ |
| `source_type` | text | NOT NULL | `'manual'` | 由来。`'pdf' / 'request_email' / 'response_email' / 'manual'` |
| `source_message_id` | text | NULL | NULL | Gmail メッセージ ID（解析元の同定用、UNIQUE で冪等性確保） |
| `requested_at` | timestamptz | NULL | NULL | 希望メール送信日時 |
| `confirmed_at` | timestamptz | NULL | NULL | 確定日（PDF 反映時刻） |
| `rejected_at` | timestamptz | NULL | NULL | 却下日（返信メール解析時刻） |
| `rejection_reason` | text | NULL | NULL | 却下理由（例: `'他キッチンカー予約'`） |

### CHECK 制約案

```sql
ALTER TABLE shifts
  ADD CONSTRAINT shifts_shift_status_chk
  CHECK (shift_status IN ('confirmed', 'pending', 'rejected'));

ALTER TABLE shifts
  ADD CONSTRAINT shifts_source_type_chk
  CHECK (source_type IN ('pdf', 'request_email', 'response_email', 'manual'));
```

> **注**: PostgreSQL は ENUM 型もサポートするが、後で値を増やすときの ALTER TYPE がやや煩雑なので、`text` + CHECK 制約案を推す。CHECK 違反時のエラーメッセージも分かりやすい。

### 既存 `note` カラムとの整理

現状 `note` には `'【未確定】' / '【スタッフ要設定】'` などのマーカー文字列が埋め込まれている。
- `'【未確定】'` の意味は新カラム `shift_status = 'pending'` と概念的に重複する。
- ただし「スタッフ要設定」は別軸（人手必要フラグ）なので、`note` には残す or 別の bool カラム化を検討。

**推奨方針**:
1. **`note` は廃止せず併存**。フリーテキスト用途として残す（運用メモ等）。
2. `'【未確定】'` マーカーは Phase 1 移行と同時に廃止し、`shift_status` で表現する。
3. `'【スタッフ要設定】'` は当面 `note` 残置。将来 `staff_required` (bool) カラムに移行検討。

UI 表示では `shift_status === 'pending'` を黄色背景＋⚠️、`note` のマーカー文字列は副表示（badge等）に。

## 提案：インデックス

```sql
-- 状態別の絞り込み用
CREATE INDEX IF NOT EXISTS shifts_shift_status_idx
  ON shifts (shift_status);

-- 月内一覧表示の高速化（既存にあれば不要）
CREATE INDEX IF NOT EXISTS shifts_date_idx
  ON shifts (date);

-- 解析メールからの冪等取り込み用
CREATE UNIQUE INDEX IF NOT EXISTS shifts_source_message_uq
  ON shifts (source_message_id, location_id, date)
  WHERE source_message_id IS NOT NULL;
```

`source_message_id` の UNIQUE は `(source_message_id, location_id, date)` の複合キー。
理由: 同じメールから 1 店舗 1 日付につき 1 レコードのみ生成する制約を DB で担保し、
連打や再パースで重複 INSERT が起きないようにする（**setup_checks の重複問題と同様の予防策**）。

## マイグレーション方針（既存データ互換性）

**方針: 後方互換に最大配慮、ロールバック可能な形で進める**

### Step 1: カラム追加（後方互換あり）

```sql
ALTER TABLE shifts
  ADD COLUMN shift_status text NOT NULL DEFAULT 'pending';

ALTER TABLE shifts
  ADD COLUMN source_type text NOT NULL DEFAULT 'manual';

ALTER TABLE shifts
  ADD COLUMN source_message_id text;
ALTER TABLE shifts
  ADD COLUMN requested_at timestamptz;
ALTER TABLE shifts
  ADD COLUMN confirmed_at timestamptz;
ALTER TABLE shifts
  ADD COLUMN rejected_at timestamptz;
ALTER TABLE shifts
  ADD COLUMN rejection_reason text;
```

**既存レコードの初期値**:
- `shift_status`: `'pending'`（デフォルトで全件 pending 扱いになる）
- `source_type`: `'manual'`（既存は手動入力相当として扱う）

**問題**: 既存の「PDF パーサーで生成済み・運用中シフト」を `pending` 扱いにしてしまうと、
UI が一斉に「未確定」表示に変わってしまう。これは現場混乱を招く。

**回避策の選択肢**:

**A.** 既存全件を `'confirmed'` で初期化（運用中扱い）
```sql
ALTER TABLE shifts
  ADD COLUMN shift_status text NOT NULL DEFAULT 'confirmed';
-- 新規 INSERT 時は明示的に 'pending' を指定する設計
```

**B.** デフォルト `'pending'` で追加 → 既存全件を後追い UPDATE で `'confirmed'` に
```sql
ALTER TABLE shifts ADD COLUMN shift_status text NOT NULL DEFAULT 'pending';
UPDATE shifts SET shift_status = 'confirmed' WHERE shift_status = 'pending';
ALTER TABLE shifts ALTER COLUMN shift_status SET DEFAULT 'pending';  -- 以後の新規は pending
```

**C.** マイグレーション直後は `note` 内容に基づいて分岐
```sql
ALTER TABLE shifts ADD COLUMN shift_status text NOT NULL DEFAULT 'confirmed';
UPDATE shifts SET shift_status = 'pending'
  WHERE note LIKE '%【未確定】%';
```

→ **推奨は C**（既存運用の意味を保ったまま自然に移行できる）。

### Step 2: CHECK 制約追加

カラム追加 → 初期値 UPDATE が完了してから CHECK 制約を ADD する。
順序を間違えると既存値が制約違反でエラーになる。

### Step 3: インデックス追加

最後にインデックス。
`source_message_id` UNIQUE は条件付き（`WHERE source_message_id IS NOT NULL`）なので
既存全件への影響なし。

### ロールバック手順

万一問題発生時：

```sql
ALTER TABLE shifts DROP CONSTRAINT shifts_shift_status_chk;
ALTER TABLE shifts DROP CONSTRAINT shifts_source_type_chk;
DROP INDEX IF EXISTS shifts_shift_status_idx;
DROP INDEX IF EXISTS shifts_source_message_uq;
ALTER TABLE shifts DROP COLUMN shift_status;
ALTER TABLE shifts DROP COLUMN source_type;
ALTER TABLE shifts DROP COLUMN source_message_id;
ALTER TABLE shifts DROP COLUMN requested_at;
ALTER TABLE shifts DROP COLUMN confirmed_at;
ALTER TABLE shifts DROP COLUMN rejected_at;
ALTER TABLE shifts DROP COLUMN rejection_reason;
```

DROP COLUMN は破壊的操作。実行前にスナップショット推奨。

## Phase 移行ステップとの対応

| Phase | やること | DB の変化 |
|---|---|---|
| Phase 1 | 希望メール解析 → 仮シフト生成 | 新規 INSERT で `shift_status='pending'` `source_type='request_email'` `source_message_id=Gmailメッセージ` `requested_at=送信時刻` |
| Phase 2 | 大田原さん返信解析 | 該当レコードを UPDATE: `shift_status='rejected'` `rejected_at=now()` `rejection_reason='他キッチンカー予約'` |
| Phase 3 | PDF 解析（既存ロジック流用） | 該当レコードを UPDATE: `shift_status='confirmed'` `confirmed_at=now()` `source_type='pdf'` |

## 設計上の判断ポイント（じゅんさん確認推奨）

1. **既存レコードの初期値**: A/B/C どれにするか？ 推奨は C（noteから推定）。
2. **`note` の `'【未確定】'` マーカー**: Phase 1 完全移行時に自動削除する SQL を migration に含めるか？
3. **`source_message_id` UNIQUE 範囲**: 同じメールに同店舗・同日が 2 回出現したら？ 現案では UNIQUE で 2 件目が弾かれるが、ON CONFLICT DO NOTHING で許容する設計もあり。
4. **rejected を物理削除 vs 論理削除**: 現案は論理削除（`shift_status='rejected'` を残す）。
   仕様書の「取り消し線で残す」表示と整合的。OK か？
5. **トリガー検討**: `shift_status` 更新時に `confirmed_at`/`rejected_at` を自動セットする
   トリガーを置くか？ 現案はアプリ層で明示セット。

## 関連リソース

- [Phase 1 UI 設計案](./phase1-ui-design.md)
- [PR #5 の取り扱い](./pr5-disposition.md)
