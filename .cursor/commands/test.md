---
description: プロジェクトの型チェック・ビルドを実行し結果を報告する
argument-hint: (optional: typecheck|build|all)
---

**IMPORTANT**: Always respond in Japanese when executing this command.

プロジェクトの検証を実行する。PoC ではテスト（Vitest/Playwright）は含めない（plan.md）。型チェックとビルドで動作確認する。

## 1. 実行種別の決定

$ARGUMENTS に応じて（省略時は all）:

- 引数なし or `all`: 型チェック → ビルドの順で実行
- `typecheck`: 型チェックのみ
- `build`: ビルドのみ

## 2. 実行コマンド

### 型チェック

```bash
pnpm run typecheck
```

### ビルド

```bash
pnpm run build
```

### 全検証（all）

```bash
pnpm run typecheck && pnpm run build
```

## 3. 結果報告

**成功時:**

```
🧪 検証結果
━━━━━━━━━━━━━━━━━━━━━━
✅ 型チェック: Passed
✅ ビルド: Passed
⏱️ Duration: X.Xs
━━━━━━━━━━━━━━━━━━━━━━
```

**失敗時:**

```
❌ 検証失敗

🔴 失敗内容:
  型チェック:
    - [ファイル:行] エラーメッセージ
  ビルド:
    - ビルドエラー詳細

⏱️ Duration: X.Xs
```

## 4. エラー時の対応

- **型エラー**: 該当ファイル・行・メッセージを表示し、修正方針を提案
- **ビルドエラー**: 原因（依存関係・環境・コード）を特定

### よくある問題

#### 型エラー

```
Type 'X' is not assignable to type 'Y'
```

**対応**: 型定義の整合性を確認、必要に応じて型アサーションや型ガードを検討

#### モジュール解決エラー

```
Cannot find module '...'
```

**対応**: `pnpm install` の実行を案内

## 補足

- **開発サーバー**: `pnpm dev` で手動確認
- **拡張時**: Vitest / Playwright を導入した場合は、`pnpm run test` 等をこのコマンドに追加可能
