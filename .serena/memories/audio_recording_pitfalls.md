# マイク集音・ピッチ検出・録音・再生のバグ防止ノート

## getUserMedia DSP設定

- 歌唱アプリでは `noiseSuppression`, `autoGainControl` を**falseにする**（歌声の倍音・ダイナミクス劣化防止）
- `echoCancellation` は **iOS のみ true** にする（スピーカーとマイクが近く伴奏が録音に混入するため）
  - 全てfalseにすると録音に伴奏が入ってしまう（iOS で確認済み）
  - Android/PC はスピーカーとマイクの距離があるため false で問題ない
- `noiseSuppression: true` にするとマイク信号が極端に小さくなるケースがある
- `channelCount: 1` を明示（モノラルで十分）

## 信号経路（現在の構成）

```
source → GainNode → AudioWorkletNode (ピッチ検出) → dummyDest
                   → DynamicsCompressorNode → MediaStreamDestinationNode (録音)
```

- **ピッチ検出はCompressor前の信号を使う**（Compressorが倍音を強調しオクターブ誤検出を招くため）
- **録音はCompressor後の信号を使う**（クリッピング防止のため）
- 生streamを録音すると音量が小さすぎる → 加工済みストリームから取る

### 過去に試してダメだった経路

- `source → gain → compressor → workletNode` でピッチ検出: Compressorの倍音強調でオクターブ上に誤検出が頻発

## GainNode（iOS/Android/Desktop別）

- **INPUT_GAIN_IOS = 18**: echoCancellationが信号を減衰させるため高めに設定
- **INPUT_GAIN_ANDROID = 20**: DSP全無効で生信号が弱いためさらに高く
- **INPUT_GAIN_DESKTOP = 3**: 近距離マイクのため低め
- DynamicsCompressorNode（threshold=-6dB, ratio=4:1）で 0dBFS超えを防止
- Worker側で `normalizeIfClipped()` を実行し、クリップした信号を正規化してからYINに渡す

### 過去に試してダメだったGain値

- `INPUT_GAIN_MOBILE = 20`（初期値）: 歪みが発生
- `INPUT_GAIN_MOBILE = 10`: Android で感度不足
- `INPUT_GAIN_MOBILE = 15`: Android でまだ感度不足 → iOS/Android分離が必要だった

## RMS音量ゲート閾値

- **RMS_THRESHOLD_IOS = 0.02**: echoCancellationが伴奏を抑制するため高めでOK
- **RMS_THRESHOLD_ANDROID = 0.008**: DSP全無効で信号が弱いため低めに設定
- **RMS_THRESHOLD_DESKTOP = 0.01**

### 過去に試してダメだった閾値

- `RMS_THRESHOLD_MOBILE = 0.03`: iOSでマイクに口が近くないと反応しない
- `RMS_THRESHOLD_MOBILE = 0.02`: Androidでほとんどピッチ検出しない → iOS/Android分離が必要だった

## ピッチ検出（YIN）のチューニング

### 現在の設定

- `yinThreshold`: iOS 0.4, Android 0.5, デスクトップ 0.2（大きいほど弱い信号でも検出）
- `probabilityThreshold`: iOS 0.3, Android 0.15, デスクトップ 0.3（検出結果を採用する最低確率）
  - Android は信号が弱く probability が低くなりがちなため緩めに設定
- MIDI範囲制限: C2(36)〜C6(84)の範囲外はオクターブ誤検出とみなし無視

### メディアンフィルタ（オクターブ跳び除去）

- ウィンドウサイズ: 3フレーム（大きいほどスパイク除去に強いが描画遅延が増える）
- 10半音以上の急激な変化はオクターブ誤検出とみなし無視
- 有効値（>0）のみで中央値を取る（無音フレームは除外）

### 過去に試してダメだった設定

- `probabilityThreshold: 0.1`: オクターブ上の倍音を誤検出しやすい
- `probabilityThreshold: 0.3`（Android）: 信号が弱く probability が低いためほとんど棄却され全くピッチ検出しない
- `yinThreshold: 0.35`（Android）: 感度不足。0.5 に上げて改善
- メディアンウィンドウ5: 描画遅延が体感できるレベル
- normalizeIfClipped なし: GainNode増幅でクリップした信号がYINで誤検出
- Compressor後でピッチ検出: 倍音が強調されオクターブ上に誤検出

## 録音再生時の音量バランス

- **PLAYBACK_RECORDING_GAIN_IOS = 0.6**: echoCancellationで伴奏が抑制される分、声が相対的に大きくなるため下げる
- **PLAYBACK_RECORDING_GAIN_ANDROID = 1.0**: DSP無効で自然なバランス
- **PLAYBACK_RECORDING_GAIN_PC = 1.0**

### 過去に試してダメだった値

- iOS 1.0: 声が伴奏より大きすぎる
- iOS 0.7: まだ少し声が大きい

## MediaRecorder

- iOS Safari は `audio/webm` 非対応 → `audio/mp4` フォールバック必須
- Blob作成時は `recorder.mimeType`（実際に使われたタイプ）を使う。ハードコードすると iOS で再生できない
- `audioBitsPerSecond: 128000` で歌声品質を確保

## 録音タイミングオフセット

- `performance.now()` を MediaRecorder.start() 直後に取得し、伴奏開始時との差分を保存
- オフセット計測はMediaRecorder.start()の直後のみ。getUserMediaやAudioWorklet登録を含めると大きすぎる値になる

## AudioContext sampleRate

- `new AudioContext({ sampleRate: 48000 })` は使わない。iOS は sampleRate 指定を無視する
- `{ latencyHint: "interactive" }` でネイティブサンプルレートを自動取得

## iOS固有の注意点まとめ

- echoCancellation: true（伴奏混入防止）
- audio/webm 非対応 → audio/mp4 フォールバック必須
- sampleRate 指定無視 → ハードコードしない
- 録音再生時の声が伴奏より大きくなる → ゲイン0.6で補正
- MediaRecorder.start() のラグが大きい傾向

## Android固有の注意点まとめ

- DSP全無効（echoCancellation含む）で問題ない
- 信号が弱いため INPUT_GAIN=20, RMS_THRESHOLD=0.008 と積極的に拾う
- iOS と同じ RMS_THRESHOLD だとほとんどピッチ検出しない

## 重要な教訓

- **iOS と Android は必ず定数を分離する**。同じ `isMobile` で括ると片方で動作しない
- **Compressor はピッチ検出経路に入れない**。倍音強調でオクターブ誤検出を招く
- **GainNode 増幅後は normalizeIfClipped が必須**。クリップした波形はYINが正しく動かない
- **メディアンフィルタのウィンドウは3が最適**。5だと遅延、1だとスパイク除去できない
