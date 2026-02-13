# マイク集音・録音・再生のバグ防止ノート

## getUserMedia DSP設定

- 歌唱アプリでは `noiseSuppression`, `autoGainControl` を**falseにする**（歌声の倍音・ダイナミクス劣化防止）
- `echoCancellation` は **iOS のみ true** にする（スピーカーとマイクが近く伴奏が録音に混入するため）
  - 全てfalseにすると録音に伴奏が入ってしまう（iOS で確認済み）
  - Android/PC はスピーカーとマイクの距離があるため false で問題ない
- `noiseSuppression: true` にするとマイク信号が極端に小さくなるケースがある
- `channelCount: 1` を明示（モノラルで十分）

## 信号経路（現在の構成）

```
source → GainNode → DynamicsCompressorNode → AudioWorkletNode (ピッチ検出)
                                            → MediaStreamDestinationNode (録音)
```

- **録音は加工済み（Gain+Compressor後）ストリームから取る**。生streamを録音すると音量が小さすぎる

## GainNode + クリッピング防止

- `INPUT_GAIN_MOBILE = 10`（以前は20で歪みが発生）
- DynamicsCompressorNode で 0dBFS 超えを防止
- Gain値を上げすぎるとYINの誤検出を招く（波形が歪むため）

## MediaRecorder

- iOS Safari は `audio/webm` 非対応 → `audio/mp4` フォールバック必須
- Blob作成時は `recorder.mimeType`（実際に使われたタイプ）を使う。ハードコードすると iOS で再生できない

## 録音タイミングオフセット

- `performance.now()` を MediaRecorder.start() 直後に取得し、伴奏開始時との差分を保存
- オフセット計測はMediaRecorder.start()の直後のみ。getUserMediaやAudioWorklet登録を含めると大きすぎる値になる

## AudioContext sampleRate

- `new AudioContext({ sampleRate: 48000 })` は使わない。iOS は sampleRate 指定を無視する

## ピッチ検出とRMSゲート

- RMS閾値ゲート: モバイル 0.02, デスクトップ 0.01

## iOS固有の注意点

- echoCancellation は iOS のみ true（伴奏混入防止）
- audio/webm 非対応 → audio/mp4 フォールバック必須
- sampleRate 指定無視
- MediaRecorder.start() のラグが大きい傾向
