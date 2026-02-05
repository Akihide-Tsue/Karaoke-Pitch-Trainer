---
description: ステージされた変更を解析し、適切なメッセージでコミットを作成する
argument-hint: (optional: コミットメッセージの上書き)
---

**IMPORTANT**: Always respond in Japanese when executing this command.

ステージされた変更をコミットする:

## 0. 現在のブランチ確認（必須）

```bash
git branch --show-current
```

⚠️ `main` または `master` の場合は、先に新規ブランチを作成:

```bash
git checkout -b feature/<branch-name>
```

変更内容に応じたブランチ名:
- `feature/<機能名>` … 新機能
- `fix/<バグ説明>` … バグ修正
- `refactor/<対象>` … リファクタリング

## 1. ビルド・型チェック（必須）

```bash
pnpm run typecheck && pnpm run build
```

⚠️ 失敗した場合は中断し、ユーザーに報告。

## 2. ステージされた変更の解析

```bash
git status && git diff --staged
```

## 3. コミットメッセージ生成

$ARGUMENTS が指定されていればそれを使用。なければ自動生成:

```
<type>: <subject>

<body>
```

### Type

- ✨ `feat`: 新機能
- 🐛 `fix`: バグ修正
- 📚 `docs`: ドキュメント
- ♻️ `refactor`: リファクタリング
- 🔧 `chore`: 設定変更
- 🎨 `ui`: UI/UX 改善

### ルール

- Subject: 50文字以内、命令形、日本語
- Body: 何を・なぜ・どう変えたか
- Footer: `Refs #123`, `Fixes #456`

## 4. コミット実行

メッセージを表示し、即座に `git commit` を実行。

## エラー処理

- **ビルド/型チェック失敗**: 中断し失敗内容を表示
- **ステージなし**: 未ステージのファイルを表示
- **作業ツリーが汚れている**: ステージされた変更のみがコミットされる旨を注記

## Guidelines

- ✅ コミット前に typecheck と build を実行
- ✅ Conventional Commits 形式を使用
- ✅ 関連 issue があれば参照
- ✅ メッセージ表示後に即座にコミット実行
- ❌ ビルド失敗時はコミットしない
