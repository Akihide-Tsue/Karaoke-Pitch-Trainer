---
description: 現在のブランチをプッシュし、詳細な説明付きのプルリクエストを作成する
argument-hint: (optional: PR タイトルの上書き)
---

**IMPORTANT**: Always respond in Japanese when executing this command.

現在のブランチでプルリクエストを作成する:

## 1. ビルド・型チェック（必須）

```bash
pnpm run typecheck && pnpm run build
```

⚠️ 失敗した場合は PR 作成を中断し、ユーザーに報告。

## 2. Git 状態確認

```bash
git status
git log main..HEAD --oneline
git diff main...HEAD --stat
```

⚠️ **未プッシュのコミット確認:**

```bash
git log origin/$(git branch --show-current)..HEAD --oneline
```

未プッシュのコミットがある場合は、PR 作成を中断し先にプッシュするよう案内。

## 3. 未プッシュコミットの確認

**IMPORTANT**: 未プッシュのコミットが無い場合のみ PR を作成する。

```bash
git log origin/$(git branch --show-current)..HEAD --oneline
```

- 出力が空: 4へ進む
- コミットがある: 中断し以下を表示

  ```
  ⚠️ 未プッシュのコミットがあります。先にプッシュしてください:

  git push origin $(git branch --show-current)
  ```

## 4. 変更内容の解析

- PR に含まれる**全**コミットを確認（最新のみではない）
- `git diff main...HEAD` で実際の差分を確認

## 5. PR 作成

```bash
gh pr create --title "タイトル" --body "本文"
```

$ARGUMENTS が指定されていれば PR タイトルとして使用。なければコミットから生成。

**PR Body 構成:**

```markdown
## Summary

変更内容と目的の概要

## Implementation Details

- コンポーネント変更
- フック・ロジック変更
- データ構造・型変更

## Related Issues

- Closes #123
```

## 6. PR URL を返す

`gh pr create` の戻り値の PR URL を表示。

## Guidelines

- ✅ PR 作成前に未プッシュコミットを確認
- ✅ 全コミットがプッシュ済みの場合のみ PR 作成
- ✅ main からの分岐以降の全コミットを解析
- ✅ 日本語で記述
- ❌ ビルド失敗時は PR を作成しない
- ❌ 未プッシュコミットがある場合は PR を作成しない
