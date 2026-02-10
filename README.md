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

## デプロイ

- <https://pitchpoc.vercel.app/>

## メモ

- npx create-react-router@latest
- 音程取得処理とbluetoothイヤホンは遅延するので調整必要
