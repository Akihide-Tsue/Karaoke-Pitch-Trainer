---
description: コード変更を詳細に解析し、改善提案を行う
argument-hint: [optional: ファイルパスまたはディレクトリ]
---

**IMPORTANT**: Always respond in Japanese when executing this command.

## 1. 変更の解析

```bash
git diff --name-only main...HEAD
git diff main...HEAD --stat
```

$ARGUMENTS が指定されていれば、そのファイル/ディレクトリに焦点を当てる。

## 2. レビューチェックリスト

- **型安全性**: `any` なし、適切な型注釈
- **エラー処理**: 空の catch なし、適切なエラーメッセージ
- **アーキテクチャ**: plan.md に準拠
  - ルート: `app/routes/`
  - コンポーネント: `app/components/` または `components/`
  - フック: `hooks/`
  - ユーティリティ: `lib/`（melody, midi, pitch, storage, db）
- **Convention**: 名前付き export、PascalCase コンポーネント、camelCase フック
- **Web Audio / マイク**: ピッチ検出・録音のエラーハンドリング
- **パフォーマンス**: 不要な再レンダリングなし、useEffect のクリーンアップ

## 3. 指摘すべき問題

- `any` 型の使用
- `console.log` の残存
- 空の catch ブロック
- 100行超の関数
- IndexedDB / MediaRecorder の未処理エラー

## 4. 出力形式

```markdown
# コードレビュー結果

## 概要

- 変更ファイル数: X
- 追加/削除: +XX / -XX

## 🔴 Critical（必須修正）

### [filename:line] 問題

- 現在: `code`
- 推奨: `fixed code`
- 理由: ...

## 🟡 Important（推奨）

...

## 🟢 Nice to Have

...

## ✅ Good Practices

...
```

## Guidelines

- 正確なファイルパスと行番号を参照
- 問題箇所と改善後のコードを提示
- 批判ではなく建設的に
