# カラオケ風音程練習アプリ（PoC）

音程を練習して採点するカラオケ風アプリの PoC。

## 技術スタック

- React + TypeScript
- React Router 7
- Vite
- pnpm

## セットアップ

```bash
pnpm install
```

```bash
pnpm dev
```

ローカルで起動後: <http://localhost:5173>

## コミット前チェック（Husky）

`pnpm install` 時に `prepare` スクリプトで Husky が有効になり、**コミット前に**次の静的解析が自動で実行されます。Husky 用の別インストール（`husky install` など）は不要です。

- `pnpm run typecheck`（型チェック）
- `pnpm run lint`（Biome）

## デプロイ

- <https://pitchpoc.vercel.app/>

## メモ

- npx create-react-router@latest
- 音程取得処理とbluetoothイヤホンは遅延するので調整必要
