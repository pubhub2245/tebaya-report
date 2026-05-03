# PR #5 の取り扱い案

> ⚠️ **本書は判断材料を提示する提案書**。実際のクローズはじゅんさんが判断する。
> Claude Code は不在中のクローズ処理は **しない**（NG ルール）。

## 概要

[PR #5 — fix(shift-engine): PDF読み取り精度向上＋検証画面追加＋未確定バッジ](https://github.com/pubhub2245/tebaya-report/pull/5)
（ブランチ `feature/shift-parser-fix-v2`）

## PR #5 の現状

### 含まれている変更（3 コミット）

| コミット | 内容 | Phase 1 移行後の評価 |
|---|---|---|
| `e33cd53` fix(parser): プロンプト強化＋parserSelfCheck＋手羽屋の表記揺れ吸収 | PDF 解析プロンプトを強化、`parserSelfCheck` 追加、手羽屋表記の正規化を Claude / JS の二重で実装 | ❌ **不要**。メール解析方式へ切替のため、PDF パーサー自体を Phase 1 では使わない |
| `9027bfe` feat(shift-generator): PDF読み取り結果の検証画面を追加 | `/admin/shift-generator/validate` 新設、`/api/shift-generator/parse` 新設、PDF→検証→生成の 2 段階フロー | ❌ **不要**。PDF 検証画面は Phase 3（PDF 反映）で復活する可能性はあるが Phase 1 では使わない |
| `44fdde2` feat(shifts-ui): 未確定/スタッフ要設定バッジを追加 | `/shifts` `/admin/shifts` の DateModal にバッジ＋背景色を追加。`【未確定】` を黄色＋⚠️、`【スタッフ要設定】` を橙＋👤 | ✅ **Phase 1 でも流用可能**。`note` 判定を `shift_status === 'pending'` 判定に差し替えれば、メール解析方式でもそのまま使える |

### 統計
- 8 ファイル変更
- 821 追加 / 43 削除
- 開発状態: Vercel Preview での実 PDF 動作確認待ち（マージ未済）

## 推奨アクション

### 1. PR #5 はクローズ（マージしない）

理由：
- PR #5 のメイン目的（PDF 読み取り精度向上）は、Phase 1 でメール解析方式に切り替わるため不要になる。
- マージしてしまうと PDF パーサーの強化版が本番に乗り、後で「不要」として削除する二度手間になる。
- 検証画面 `/admin/shift-generator/validate` も Phase 1 のメール解析プレビュー画面と用途が重なる（混乱の元）。

→ **クローズ推奨**。クローズは履歴に残るので、必要になったら再 open / cherry-pick も可能。

### 2. 残す価値のある変更（バッジ UI）の救出方針

#### 候補 A: 新ブランチへ cherry-pick

```bash
git checkout feature/email-parser-phase1
git cherry-pick 44fdde2
```

利点：
- コミット履歴が綺麗（"feat(shifts-ui): バッジ追加" がそのまま残る）
- PR #5 の他のコミットを巻き込まない

欠点：
- `note LIKE '%【未確定】%'` の条件分岐は Phase 1 で `shift_status === 'pending'` に差し替えが必要 → cherry-pick 後に追加コミットで修正
- ブランチ間でコンテキスト依存があると衝突する可能性

#### 候補 B: 新ブランチで再実装

`44fdde2` を参考に、Phase 1 用 UI として新規実装する。
- 利点: コミットメッセージ・コードコメントを Phase 1 文脈で書ける（「note判定→status判定」の選択理由を残せる）
- 欠点: 似たコードを書き直す手間

#### 候補 C: 一旦保留、Phase 1 完成後にバッジを足す

- メール解析の本体ロジックを先に完成させて、バッジ表示は Phase 1 の最後に追加
- 利点: スコープを小さく保てる
- 欠点: バッジなしの中間状態を経るので、運用導入のタイミングで状態が分かりにくい

→ **推奨は A or B、どちらかと言うと B**（Phase 1 文脈で書き直しが綺麗）。

## クローズ時の手順（じゅんさん側）

1. `https://github.com/pubhub2245/tebaya-report/pull/5` を開く
2. 下部 **「Close pull request」** ボタンを押す（Merge ではなく Close）
3. クローズ理由をコメントで残す:
   > メール解析方式（Phase 1）に切り替えのため、PDF パーサー強化部分は不要になりました。
   > 未確定バッジ UI のみ新ブランチに移植する想定。クローズします。
4. ブランチ `feature/shift-parser-fix-v2` は GitHub 側に残しておく（参照用）。
   ローカルブランチ削除は任意。

## ローカルの stash / ブランチ整理

### 関連ブランチ
- `feature/shift-parser-fix` — 古い世代（PR #5 の前段）。`stash@{1}: wip: shift-parser-fix` の元
- `feature/shift-parser-fix-v2` — PR #5 のブランチ。クローズ後はリモート保持・ローカル削除可
- `feature/email-parser-phase1` — **新メイン**（このブランチで Phase 1 を進める）

### 未処理 stash（不在中は触らない）
```
stash@{0}: On feature/setup-check-dedup: settings-local-temp
stash@{1}: On feature/shift-parser-fix: wip: shift-parser-fix
```
両方とも不在中は触らない（消すと取り戻せない）。
帰宅後に内容確認 → 不要であれば `git stash drop`、必要なら個別ブランチで pop。

## 設計上の判断ポイント（じゅんさん確認推奨）

1. PR #5 は本当にクローズで OK か？ Vercel Preview での動作確認結果は手元にあるか？
2. バッジ UI 救出は A/B/C どれを選ぶか？
3. `feature/shift-parser-fix-v2` ローカルブランチは削除するか保持するか？
4. PR #5 に含まれる `parserSelfCheck` ロジック、メール解析でも参考になる部分はあるか
   （月日数チェック等）→ 答え: ない（メール側は別ロジック）

## 関連リソース

- [Phase 1 DB 設計案](./phase1-db-design.md)
- [Phase 1 UI 設計案](./phase1-ui-design.md)
