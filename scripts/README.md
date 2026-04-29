# scripts/

このディレクトリには補助スクリプトを置きます。`extract-line-reports.mjs` は読み取り専用、`insert-line-reports.mjs` は `--execute` フラグ必須の安全設計です。

## extract-line-reports.mjs

LINEのトーク履歴エクスポート（テキスト）から、過去の手羽屋日報を構造化JSONに抽出します。

### 使い方

1. LINEから「手羽屋都城_売り上け」グループのトークをテキスト形式でエクスポート
2. ファイルを `data/line-export.txt` として配置（任意のパスでもOK）
3. プロジェクトルートで実行：
   ```
   node scripts/extract-line-reports.mjs data/line-export.txt
   ```
4. 以下が生成されます：
   - `data/extracted-reports.json` … 構造化された日報データ配列
   - `data/extracted-reports-summary.md` … 月別件数・パースエラー一覧などの人間可読サマリー
5. `summary.md` を目視確認して、抽出漏れ・パースエラー・重複候補をチェック
6. 問題なければ、別途依頼するDB投入スクリプト（後日作成予定）でDBに反映

### 抽出されるフィールド

各レコードは以下の形：

```jsonc
{
  "date": "2026-04-01",                        // 業務日（ISO形式に正規化）
  "location_raw": "ながやま三股",              // 場所（生のテキスト、表記揺れあり）
  "staff_name_raw": "イデ",                    // 担当（生のテキスト、別名あり）
  "sales_amount": 36000,                       // 本日売上
  "cumulative_sales": 36000,                   // 累計売上
  "cost_food": 9000,                           // 原価概算
  "cost_labor": 8000,                          // 日当
  "cost_rent": 3600,                           // 場代
  "cost_other": null,                          // その他備品
  "expenses_total": 20600,                     // 経費合計
  "register_total": 30000,                     // レジ合計
  "register_ok": true,                         // 確認OKなら true
  "register_diff": 0,                          // 差異額（OKなら0、未取得ならnull）
  "remaining_tebasaki": 30,                    // 手羽残
  "remaining_gyoza": 0,                        // 手羽餃子残
  "remaining_potato": 2,                       // ポテト残
  "remaining_tornado": null,                   // トルネード残
  "remaining_negishio": null,                  // ねぎ塩残
  "handover": "ガソリン ポテト×2 ペーパー",   // 引き継ぎ事項（無ければnull）
  "raw_message": "（元の日報テキスト全文）",  // 検証用に保持
  "line_timestamp": "2026-04-01 22:03",        // LINE投稿時刻
  "line_sender": "idehiro（イデさん）_Fairy",  // LINE送信者名
  "parse_errors": ["売上抽出失敗"]            // パースで取りこぼした項目（無ければキー自体省略）
}
```

### 注意事項

- **このスクリプトはDBに一切書き込みません**（読み取り専用、ファイル生成のみ）
- DB投入は `staff_members` テーブル作成後に、別の投入スクリプトで行う予定
- LINEログのフォーマット揺れに対応するため、半角/全角コロン・¥/￥・括弧違い（`（）` / `()`）を吸収する正規表現で書かれています
- 抽出失敗したレコードは `parse_errors` 配列に理由が入ります。`summary.md` で件数・内訳を確認してください

### 表記揺れ対応の例

| LINEログでの表記 | 抽出結果 |
|-----------------|---------|
| `📅 日付：2026/4/1` / `2026年4月1日` | `2026-04-01` |
| `本日売上：¥36000` / `￥36,000` | `36000` |
| `場代(Rent)：￥3600` / `場代（Rent）：￥3,600` | `3600` |
| `レジ合計：￥30,000(確認OK)` | `register_total: 30000, register_ok: true` |
| `レジ合計：￥30,500(差異+500円)` | `register_total: 30500, register_ok: false, register_diff: 500` |
| `・手羽  30本` / `・手羽30` | `remaining_tebasaki: 30` |
| `・ポテト×2` / `・ポテト 2` | `remaining_potato: 2` |

---

## insert-line-reports.mjs

`extract-line-reports.mjs` で生成した `data/extracted-reports.json` を `daily_reports` テーブルへ投入します。

### 前提

- `data/extracted-reports.json` が生成済み
- `staff_members` テーブルが作成済み**推奨**（無くてもハードコードフォールバックで動作）
- `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と キー（service_role があれば優先）

### 使い方

```bash
# 1. dryRun（DB書き込みなし、投入予定だけ確認）
node scripts/insert-line-reports.mjs data/extracted-reports.json

# 2. 実投入（dryRunで問題なければ --execute を付ける）
node scripts/insert-line-reports.mjs data/extracted-reports.json --execute
```

### 出力

- **コンソール**：処理結果サマリー＋各レコードの状態（✅投入予定 / ⏭️重複 / ⚠️解決失敗 / ❌エラー）
- **`data/insert-report-{timestamp}.md`**：詳細レポート（実投入後の成功/失敗も追記）

### 安全機構

| 機構 | 動作 |
|------|------|
| `--execute` フラグ必須 | 付けないと dryRun（DB変更なし） |
| 既存レコードと重複 | `date+staff_name+location` 一致は自動スキップ |
| スタッフ名解決失敗 | WARNING＋投入スキップ（勝手に推測しない） |
| 店舗名解決失敗 | WARNING＋投入スキップ |
| バリデーション失敗 | エラー記録＋投入スキップ（date不正・売上欠落等） |

### 名寄せ動作

- まず `staff_members` テーブルから `name + aliases` を取得して解決を試みる
- テーブルが無い／該当しない場合はハードコードマッピングにフォールバック：
  - `井手` `idehiro（イデさん）_Fairy` `川畑潤一郎` `りゅうき` `あ Ryuki` `さよ` などの実名・別名を網羅
- どちらでも解決できなければ WARNING＋スキップ（誤投入を防ぐ）

### 経費フィールドの扱い

LINEログの `cost_food / cost_labor / cost_rent` は売上から計算される値なので、`expenses` jsonb には積みません（`labor` カラムだけセット）。`cost_other`（その他備品）が0より大きい場合のみ、立替経費として1件登録します。

### 投入後の確認

実投入後、Supabase Dashboard or `/admin` で以下を確認：

```sql
SELECT date, staff_name, location, sales_amount, unit_number
FROM daily_reports
WHERE created_at < now() - INTERVAL '1 day' -- LINE移行分
ORDER BY date;
```
