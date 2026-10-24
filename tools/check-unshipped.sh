#!/usr/bin/env bash
# ============================================================================
# 「下書きのまま本番に出ていない直し」を見つける道具（2026-10-24・B）
#
# ■ なぜ要るか（やさしい説明）
#   このプロジェクトは、直しを下書き用の別コピー（auto/… のブランチ）で作り、
#   そのあと本番（master）へ同じ中身をもう1回 置き直す形で出しています。
#   ところが 10/23 の朝に作った2つの直し（よその店に手羽屋の目標額・粗利の率を
#   出さないようにするもの＝PR #285）は、**下書きのまま1日 置き忘れられて**いました。
#   司令室の記録にも「本番に反映」と書かれていなかったので、誰も気づけませんでした。
#
#   置き忘れは、見た目には何も起きません（本番は前の版のまま動く）。
#   だから**機械に数えさせます**：下書きで新しく作ったファイルが、
#   本番側に1つも無ければ、その下書きは出ていません。
#
# ■ 使い方
#   bash tools/check-unshipped.sh
#   → 「置き忘れ 0 件」か、置き忘れている下書きの名前が出ます。
#
# ■ 大事な約束
#   ・**読むだけ**です。ブランチも本番も1つも書き換えません。
#   ・見つけた下書きを勝手に出しません（中身を読んで判断するのは人／B の仕事）。
#   ・新しいファイルが1つも無い下書き（既にあるファイルだけを直したもの）は
#     この道具では分かりません。そこは PR と司令室の記録で見ます。
#     ＝ これは「全部 見つける道具」ではなく「いちばん多い取り落としを拾う道具」です。
# ============================================================================
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

MAIN="${MAIN:-origin/master}"
# 何日ぶんの下書きを見るか（古い下書きは役目を終えているものが多い）
DAYS="${DAYS:-14}"

if ! git rev-parse --verify --quiet "$MAIN" >/dev/null; then
  echo "飛ばしました：本番の枝（$MAIN）が見つかりません"
  exit 0
fi

since=$(date -d "-$DAYS days" +%Y-%m-%d 2>/dev/null || echo "")
found=0

for b in $(git branch -r --list 'origin/auto/*' | sed 's/^ *//'); do
  last=$(git log -1 --format='%ad' --date=short "$b" 2>/dev/null) || continue
  if [ -n "$since" ] && [ "$last" \< "$since" ]; then continue; fi

  base=$(git merge-base "$MAIN" "$b" 2>/dev/null) || continue
  added=$(git diff --diff-filter=A --name-only "$base" "$b" 2>/dev/null)
  [ -z "$added" ] && continue

  missing=""
  for f in $added; do
    if ! git cat-file -e "$MAIN:$f" 2>/dev/null; then
      missing="$missing $f"
    fi
  done

  # 新しく作ったファイルが**ぜんぶ**本番に無いときだけ「出ていない」と見る
  # （一部だけ無いのは、あとで名前を変えた・分けた、などふつうに起きる）
  n_added=$(echo "$added" | wc -w)
  n_missing=$(echo "$missing" | wc -w)
  if [ "$n_missing" -gt 0 ] && [ "$n_missing" -eq "$n_added" ]; then
    echo "出ていないかもしれません：$b（最後の変更 $last）"
    for f in $missing; do echo "    本番に無いファイル：$f"; done
    found=$((found + 1))
  fi
done

echo "----------------------------------------------"
if [ "$found" -eq 0 ]; then
  echo "OK：直近 ${DAYS} 日の下書きに、置き忘れ 0 件（新しいファイルで見た結果です）"
else
  echo "NG：置き忘れの疑い ${found} 件。中身を読んで、出すか・もう要らないかを決めてください"
fi
exit 0
