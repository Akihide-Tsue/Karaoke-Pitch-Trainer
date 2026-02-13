# Project Overview: pitch-poc

## Purpose

Web Audio API ベースのカラオケピッチトレーナー。MIDIメロディと実際の歌声のピッチを比較し、リアルタイムでピッチバーを表示する。

## Tech Stack

- **Framework**: React Router v7 (Remix後継) + React 19
- **Language**: TypeScript 5.9
- **Build**: Vite 7
- **UI**: MUI v7 + Emotion
- **State**: Jotai
- **DB**: Dexie (IndexedDB wrapper)
- **Audio**: Web Audio API, AudioWorklet, pitchfinder (YIN algorithm)
- **MIDI**: @tonejs/midi
- **Linter/Formatter**: Biome
- **Hosting**: Vercel
- **Package Manager**: pnpm

## Codebase Structure

```
app/
├── routes/          # ページコンポーネント (home, practice, playback)
├── components/      # UIコンポーネント (PitchBar, LyricsPanel, etc.)
├── lib/             # ロジック・ユーティリティ
│   ├── usePitchDetection.ts   # マイク入力・ピッチ検出・録音
│   ├── usePracticePlayback.ts # 練習モード再生+録音
│   ├── usePlaybackPlayer.ts   # 録音再生
│   ├── pitch.worker.ts        # YINピッチ検出Worker
│   ├── pitch-processor.ts     # AudioWorkletProcessor
│   ├── melody.ts / midi.ts    # MIDIメロディ処理
│   ├── lyrics.ts              # 歌詞処理
│   ├── db.ts                  # Dexie DB定義
│   └── storage.ts             # ストレージユーティリティ
├── constants/       # 定数・楽曲データ
└── stores/          # Jotai atoms
```
