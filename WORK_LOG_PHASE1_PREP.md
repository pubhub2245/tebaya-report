# Phase 1 事前準備 作業ログ

不在中の自走タスクの作業記録。  
実施日: 2026-05-03  
ブランチ: `feature/email-parser-phase1`  
コミット: `560908c`  
**push 未実施**（指示書通り、ローカルのみ）

---

## 1. 各タスクの完了状況

| Task | 状態 | 内容 |
|---|---|---|
| Task 1 | ✅ 完了 | ブランチ `feature/email-parser-phase1` 作成（master `7c2265d` から派生） |
| Task 2 | ✅ 完了 | `lib/email-parser/request-parser.ts` 実装 |
| Task 3 | ✅ 完了 | テスト 13 件・フィクスチャ 8 件、**全件パス** |
| Task 4 | ✅ 完了 | `docs/phase1-db-design.md` 作成 |
| Task 5 | ✅ 完了 | `docs/phase1-ui-design.md` 作成 |
| Task 6 | ✅ 完了 | `docs/pr5-disposition.md` 作成（PR#5 自体には未介入） |
| Final | ✅ 完了 | build / tsc 通過、ローカルコミット完了 |

---

## 2. パーサー実装の概要

### 公開API

```ts
parseRequestEmail(
  emailBody: string,
  opts?: { defaultYear?: number },
): ParsedRequest
```

### 出力型

```ts
type ParsedRequest = {
  months: Array<{
    year: number;
    month: number;
    requests: Array<{
      store: '志比田店' | '若葉店' | '山田店' | '鷹尾店' | '三股店' | '都北店';
      dates: string[]; // ISO YYYY-MM-DD（昇順）
    }>;
  }>;
  warnings: string[];
};
```

### 対応した正規化ルール

| ルール | 例 |
|---|---|
| 全角数字 → 半角 | `５／１` → `5/1` |
| 全角スラッシュ → 半角 | `／` → `/` |
| 全角空白 → 半角 | `　` → ` ` |
| 全角カンマ → 半角 | `，` → `,` |
| 区切り両対応 | `、` `,` どちらも区切り扱い |
| 店舗名エイリアス | `わかば店` → `若葉店`、`高尾店` `たかお店` → `鷹尾店`、`三又店` → `三股店`、その他カナ揺れ等 |
| 「店」省略許容 | `志比田` → `志比田店` 等の補完 |
| ヘッダー揺れ吸収 | `【○月 出店希望日】` `【○月 追加出店希望日】` 両対応、同月併記時はマージ |
| 月不整合の検出 | ヘッダー `5月` 内の `4/1` のような項目は除外＋warning |
| 無効日付の検出 | `4/31` は `daysInMonth` で判定して除外＋warning |
| 未知店舗の検出 | `宮崎店` 等は除外＋warning（例外を投げない） |
| 年推定 | `defaultYear` 指定なし＋ヘッダー月 < 現在月 → 翌年と判定 |

### 設計上の判断

- 例外を投げず、不正値は **すべて warnings に記録して除外**（運用中の現場で「メール本文の typo で全部失敗」事故を避ける）
- 同月の「希望」「追加希望」ブロックは同一バケットへマージ（追加メール対応）
- 年推定は「ヘッダー月が現在月より前なら翌年」（先送り計画メールを想定）
- 日付の重複は `Set` で吸収（同じメール本文内で `5/1, 5/1, 5/3` と重複しても一意化）

---

## 3. テスト結果

### 実行コマンド

```
npx tsx --test lib/email-parser/__tests__/request-parser.test.ts
```

### 結果

```
# tests 13
# pass 13
# fail 0
# duration_ms 460.8
```

### テストケース一覧

| # | 名称 | 仕様書のどれ |
|---|---|---|
| 1 | 正常系: 5月単月のメール | 1 |
| 2 | 正常系: 複数月（5月+6月）のメール | 2 |
| 3 | 正常系: 追加出店希望日のみのメール | 3 |
| 4 | 異常系: 表記揺れ（わかば店/高尾店/三又店）が正規化される | 4 |
| 5 | 異常系: 全角数字・全角スラッシュが半角に変換される | 5 |
| 6 | 異常系: 4/31 のような無効日付は warnings に入って除外 | 6 |
| 7 | 異常系: 未知の店舗名（宮崎店）が warnings に入って除外 | 7 |
| 8 | エッジケース: 空文字列入力で空配列が返る | 8 |
| 9 | エッジケース: 空白のみの入力でも空配列 | 8（追加） |
| 10 | エッジケース: ヘッダーのない本文で空配列＋warning | 9 |
| 11 | 年推定: defaultYear 指定 | 追加 |
| 12 | 年推定: 当月以降は現在年 | 追加 |
| 13 | 年推定: 前月のヘッダーは翌年 | 追加 |

### テスト基盤の判断

仕様書では `npx jest` または既存のテスト実行コマンド、と記載があったが、

- 既存のテスト実行コマンドはなし（`package.json` に `test` スクリプトなし）
- jest を新規追加すると 30〜50MB の依存追加になる

→ **Node 22 標準の `node:test`** を **`tsx`（既存 devDep）** で実行する方式を採用。
**追加ランタイム依存ゼロ**で全テストが動作。

---

## 4. ドキュメント一覧

| ファイル | 役割 |
|---|---|
| `docs/phase1-db-design.md` | `shifts` テーブル拡張案（`shift_status` / `source_type` / `source_message_id` 等のカラム追加、CHECK 制約・インデックス・マイグレーション戦略・ロールバック手順） |
| `docs/phase1-ui-design.md` | 3状態の Tailwind クラス案、カレンダー / リスト / モーダル / **メール解析プレビュー画面**のワイヤー、PR#5 バッジUIの流用方針 |
| `docs/pr5-disposition.md` | PR#5 のクローズ推奨理由、コミット別の Phase 1 価値、バッジUI救出 3案（A: cherry-pick, B: 再実装, C: 後回し） |

---

## 5. ブランチ・コミット情報

- **ブランチ**: `feature/email-parser-phase1`
- **派生元**: `master` (`7c2265d` Merge pull request #4 from pubhub2245/feature/setup-check-dedup)
- **コミット**: `560908c feat(email-parser): Phase 1 メール解析パーサーと設計ドキュメント`
  - 12 ファイル追加（パーサー1 / テスト1 / フィクスチャ8 / ドキュメント3）

### git status（作業終了時）

```
 M .claude/settings.local.json
 M tsconfig.tsbuildinfo
```

→ 上記2つは作業による変更ではなく、CLI / build 起因で常時変動するもの。コミット対象外。

---

## 6. ビルド・型チェック結果

| コマンド | 結果 |
|---|---|
| `npm run build` | ✅ グリーン（29ページ生成、エラーゼロ） |
| `npx tsc --noEmit` | ✅ グリーン（エラー出力なし） |
| `npx tsx --test` | ✅ 13/13 pass |

---

## 7. 判断に迷った点・ユーザー確認が必要な点

帰宅後にじゅんさんに判断していただきたい項目を以下に列挙：

### 仕様の判断

1. **既存 `shifts` レコードの初期値（DB設計案 §マイグレーション方針）**
   - A: 全件 `confirmed` で初期化
   - B: 全件 `pending` 後に UPDATE で `confirmed` に
   - **C（推奨）**: `note LIKE '%【未確定】%'` を `pending` に、それ以外を `confirmed` に
   - → どれを採用するか確認したい

2. **`note` カラム内の `'【未確定】'` マーカーの扱い**
   - Phase 1 完全移行時に DB から消すか、UI 側で無視するか
   - → 二重表示にならない設計判断が必要

3. **rejected の表示**
   - 「取り消し線で残す」がデフォルト ON で OK か（消えると履歴が見えなくなるが、画面が散らかる）

4. **重複検出の単位**
   - メール解析時の「既存 shifts と重複」判定は `(date, location_id)` で十分か、`staff_name` も含めるか

5. **PR #5 のクローズ可否**
   - 推奨はクローズ。Vercel Preview での動作確認結果が手元にあるか
   - クローズなら `pr5-disposition.md` の手順をそのまま実行

6. **PR #5 バッジUI救出方針**
   - A: cherry-pick / B: 再実装 / C: 後回し
   - 推奨は **B（再実装）**：Phase 1 文脈で `shift_status === 'pending'` 判定で書き直す

### 環境の判断

7. **未処理 stash 2件**
   - `stash@{0}: settings-local-temp`（私が作っていない）
   - `stash@{1}: wip: shift-parser-fix`（前回私が作った）
   - → 両方とも不在中は触っていない。中身確認 → drop or pop の判断をお願いしたい

8. **`feature/shift-parser-fix-v2` ローカルブランチ**
   - PR#5 クローズ後、ローカルブランチも削除するか保持するか

### 前回作業の引継

9. **`feature/shift-parser-fix-v2` の WIP 内容**
   - PR#5 にコミット済の 3 件以外に未コミットの作業はあったか（v2 ブランチに残っている可能性）
   - 重要な変更が残っていれば Phase 1 でも参考にしたい

### 仕様の確認

10. **メール解析のメイン UI（プレビュー画面）の場所**
    - `/admin/shift-import` を提案。既存メニュー構成と整合する位置か確認したい

---

## 8. push 未実施の確認

```
git log origin/feature/email-parser-phase1 2>&1
→ fatal: ambiguous argument 'origin/feature/email-parser-phase1'（リモート未存在 = push なし）
```

ローカルのみで作業完了。**じゅんさん帰宅後にレビュー → push or 修正の判断**をお願いします。

---

## 9. 次の段取り（じゅんさん帰宅後）

優先度順：

1. **本ログを確認**してから commit `560908c` のコード差分を読む
2. PR#5 の処理判断（クローズ推奨）
3. DB 設計案（§7-1 の選択肢）の決定
4. UI 設計案のレビュー → 必要なら修正指示
5. push 許可 → `git push -u origin feature/email-parser-phase1` で PR 作成
6. Phase 1 本体実装着手（メール解析プレビュー画面 + DB マイグレーション）

---

## 安全ルールの遵守確認

- ✅ master への直接コミットなし
- ✅ git push なし
- ✅ git push --force なし
- ✅ DROP TABLE / DELETE なし
- ✅ 本番 Supabase データ変更なし
- ✅ PR マージなし
- ✅ Vercel 本番デプロイなし
- ✅ 環境変数本番反映なし
- ✅ 有料サービス契約なし
- ✅ 大規模ライブラリ追加なし（jest 等は採用せず Node 標準で対応）
