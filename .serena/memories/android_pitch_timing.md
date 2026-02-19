# Android ピッチ表示タイミング問題と対策

## 問題

Android で PitchBar の歌唱ピッチ表示が CurrentLine（現在位置線）より ~400ms 左にずれる。
iOS では問題なし。

## デバッグ結果

- `delta` (smoothPositionMs - lastPitch.timeMs): ~400ms (Android), ~0ms (iOS)
- `outputLatency`: 23ms → 原因ではない
- `baseLatency`: 4ms → 原因ではない

## 原因分析

### setPitchData の O(n) コピー問題

`setPitchData((prev) => [...prev, ...batch])` は毎フレーム配列全体をコピーする。
- 50fps × 180秒 = ~9000 エントリ
- Android の遅い CPU/GC では配列コピー + React 再レンダリングが数フレーム分の遅延を生む
- pitchData (Jotai atom) の更新が smoothPositionMs (useState) より遅れる
- 曲が進むにつれ配列が大きくなり遅延が増大する可能性

### 試して効果がなかったアプローチ

1. **unified rAF**: smoothPositionMs と pitchBuffer flush を同一 rAF tick で実行 → delta 変化なし
2. **PR #12 の flushScheduledRef + 個別 rAF**: 同等の遅延

## 対策: ref-based pitchData + version カウンタ

- `livePitchRef` (mutable ref) にピッチデータを push (O(1))
- `pitchVersion` (useState counter) をインクリメントして PitchBar の useMemo 再計算をトリガー
- PitchBar は `livePitchRef.current` を直接参照（配列コピーなし）
- 練習終了時（useEffect cleanup）に `setPitchData(livePitchRef.current.slice())` で Jotai atom に書き戻し
- スコア計算用の `pitchDataRef` は練習中は `livePitchRef.current` を直接参照

### 注意点

- PitchBar の useMemo deps に `pitchVersion` を含める必要がある
- `void pitchVersion` で biome の unused 警告を回避
- pitchDataRef の同期は isPracticing の状態で切り替え

## タイミングパイプライン概要

```
マイク → AudioWorklet (2048 samples) → Worker (pitchy MPM) → latestMidiRef
setInterval(20ms) → getPlaybackPositionMs() + latestMidiRef → onPitch
onPitch → pitchBufferRef → rAF tick → livePitchRef.push + setPitchVersion
同じ rAF tick → setSmoothPositionMs(getPlaybackPositionMs())
```
