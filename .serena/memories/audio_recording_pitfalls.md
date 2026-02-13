# マイク集音・ピッチ検出・録音・再生のバグ防止ノート

## getUserMedia DSP設定

- 歌唱アプリでは `noiseSuppression`, `autoGainControl` を**falseにする**（歌声の倍音・ダイナミクス劣化防止）
- `echoCancellation` は **iOS のみ true** にする（スピーカーとマイクが近く伴奏が録音に混入するため）
  - 全てfalseにすると録音に伴奏が入ってしまう（iOS で確認済み）
  - Android/PC はスピーカーとマイクの距離があるため false で問題ない
- `noiseSuppression: true` にするとマイク信号が極端に小さくなるケースがある
- `channelCount: 1` を明示（モノラルで十分）

## 信号経路（現在の構成 - DynamicsCompressor廃止済み）

```
source → GainNode(ピッチ検出用, 高ゲイン) → AudioWorkletNode → dummyDest
source → recGain(録音用, 低〜中ゲイン) → MediaStreamDestinationNode (録音)
```

- DynamicsCompressorは廃止。倍音強調でオクターブ誤検出を招くため。
- クリッピング防止は Worker 側の `normalizeIfClipped()` で対応。
- 録音用 recGain は初期化過渡ノイズ防止のため 0 → 50ms でフェードイン。

## GainNode（iOS/Android/Desktop別）

### ピッチ検出用 INPUT_GAIN
- **INPUT_GAIN_IOS = 30**: echoCancellationが信号を減衰させるため最も高く設定
- **INPUT_GAIN_ANDROID = 25**: DSP全無効で生信号が弱いため高く
- **INPUT_GAIN_DESKTOP = 3**: 近距離マイクのため低め

### 録音用 REC_GAIN
- **REC_GAIN_IOS = 3**
- **REC_GAIN_ANDROID = 7**
- **REC_GAIN_DESKTOP = 1**: echoCancellation=false で伴奏がマイクに漏れるため増幅せず、再生時にブースト

- Worker側で `normalizeIfClipped()` を実行し、クリップした信号を正規化してからピッチ検出に渡す

### 過去に試してダメだったGain値

- `INPUT_GAIN_MOBILE = 20`（初期値）: 歪みが発生
- `INPUT_GAIN_MOBILE = 10`: Android で感度不足
- `INPUT_GAIN_MOBILE = 15`: Android でまだ感度不足 → iOS/Android分離が必要だった

## ピッチ検出（pitchy / MPM）

### 現在の設定

- ライブラリ: **pitchy** v4.1.0（McLeod Pitch Method / MPM）
- `PitchDetector.forFloat32Array(2048)` でインスタンス作成（pitch-processor の BUFFER_SIZE と一致）
- `findPitch(samples, sampleRate)` → `[pitch_Hz, clarity]` を返す
- `minClarity` = 0.8（自前フィルタ、config メッセージで変更可能）
- MIDI範囲制限: C2(36)〜C6(84)の範囲外はオクターブ誤検出とみなし無視

## 録音再生時の音量バランス

- **PLAYBACK_RECORDING_GAIN_IOS = 0.6**: echoCancellationで伴奏が抑制される分、声が相対的に大きくなるため下げる
- **PLAYBACK_RECORDING_GAIN_ANDROID = 1.0**: DSP無効で自然なバランス
- **PLAYBACK_RECORDING_GAIN_PC = 1.0**
- **PLAYBACK_ACCOMPANIMENT_GAIN_ANDROID = 0.07**: 録音時の伴奏漏れが少ないため伴奏を下げる
- **PLAYBACK_ACCOMPANIMENT_GAIN_IOS = 0.15**

## MediaRecorder

- iOS Safari は `audio/webm` 非対応 → `audio/mp4` フォールバック必須
- Blob作成時は `recorder.mimeType`（実際に使われたタイプ）を使う
- `audioBitsPerSecond: 128000` で歌声品質を確保
- 録音開始時フェードイン（recGain 0→値 を 50ms で遷移）で初期化ノイズ回避

## AudioContext sampleRate

- `new AudioContext({ sampleRate: 48000 })` は使わない。iOS は sampleRate 指定を無視する
- `{ latencyHint: "interactive" }` でネイティブサンプルレートを自動取得

## 重要な教訓

- **iOS と Android は必ず定数を分離する**。同じ `isMobile` で括ると片方で動作しない
- **Compressor はピッチ検出経路に入れない**。倍音強調でオクターブ誤検出を招く
- **GainNode 増幅後は normalizeIfClipped が必須**。クリップした波形はピッチ検出が正しく動かない
- **setPitchData([...prev, ...batch]) は Android で遅延を招く**。mutable ref + version counter を使う
- **pitchfinder の MacLeod は使えない**。SMALL_CUTOFF=0.5 がハードコードで弱い信号を全て無視する
- **pitchfinder の YIN は歌唱アプリに不向き**。倍音と基本周波数の区別が苦手でオクターブ誤検出が多い
