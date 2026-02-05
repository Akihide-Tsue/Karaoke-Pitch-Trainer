# 開発ガイドライン（AGENT.md）

本プロジェクトの主な仕様・実装手順は **docs/plan.md** に記載されています。開発時は plan.md を参照してください。

## 参照ドキュメント

- **plan.md** … 仕様、データ形式、実装手順（Phase 1〜5）、チェックリスト
- **TODO.md** … 実装タスクの進捗管理

## 技術スタック

- React + TypeScript、React Router 7、Vite、pnpm
- Jotai（状態管理）、MUI、Dexie（IndexedDB）、pitchfinder、@tonejs/midi
- Biome（Lint / フォーマット）

## ルーティング

- `/` … ホーム
- `/practice` … 練習画面
- `/playback` … 再生画面
