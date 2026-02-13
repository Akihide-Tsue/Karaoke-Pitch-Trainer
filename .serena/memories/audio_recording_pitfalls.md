# マイク集音・録音・再生のバグ防止ノート

## getUserMedia DSP設定

- 歌唱アプリでは `echoCancellation`, `noiseSuppression`, `autoGainControl` を**全てfalse**にする
- これらのDSPは通話用で、歌声の倍音・ダイナミクスを劣化させる
- `noiseSuppression: true` にするとマイク信号が極端に小さくなるケースがある
- `channelCount: 1` を明示（モノラルで十分、ステレオは無駄にデータ量が増える）

## 信号経路（現在の構成）

```
source → GainNode → DynamicsCompressorNode → AudioWorkletNode (ピッチ検出)
                                            → MediaStreamDestinationNode (録音)
```

- **録音は加工済み（Gain+Compressor後）ストリームから取る**。生streamを録音すると音量が小さすぎる
- destinationに繋がないことで伴奏の出力に干渉しない

## GainNode + クリッピング防止

- `INPUT_GAIN_MOBILE = 10`（以前は20で歪みが発生）
- DynamicsCompressorNode で 0dBFS 超えを防止:
  - threshold: -6dB, knee: 6, ratio: 4:1, attack: 3ms, release: 100ms
- Gain値を上げすぎるとYINアルゴリズムの誤検出を招く（波形が歪むため）

## MediaRecorder

- mimeType: iOS Safari は `audio/webm` をサポートしない → `audio/mp4` フォールバック必須
- 優先順: `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` → `audio/ogg;codecs=opus` → `audio/ogg`
- `audioBitsPerSecond: 128000` で歌声品質を確保
- timeslice: 250ms（100msだと細切れすぎてオーバーヘッド）
- Blob作成時は `recorder.mimeType`（実際に使われたタイプ）を使う。ハードコードすると iOS で再生できない

## 録音タイミングオフセット

- MediaRecorder.start() と伴奏再生開始の間にタイムラグがある（特にiOS）
- `performance.now()` を MediaRecorder.start() 直後に取得し、伴奏開始時との差分を `recordingOffsetMs` として保存
- 再生時にこのオフセット分だけ録音トラックの開始位置をずらす
- **注意**: オフセット計測はMediaRecorder.start()の直後のみ。getUserMediaやAudioWorklet登録を含めると大きすぎる値になる

## AudioContext sampleRate

- `new AudioContext({ sampleRate: 48000 })` は **使わない**
- iOS Safari は sampleRate 指定を無視してデバイスネイティブレートを使う
- ハードコードするとiOSとその他で不一致が起き、再生速度がおかしくなる可能性がある
- `new AudioContext()` でネイティブレートに委任する

## ピッチ検出とRMSゲート

- 伴奏がマイクに漏れてピッチバーが描画される問題への対策
- `pitch.worker.ts` でRMS閾値ゲートを実装: RMS < threshold なら midi: 0 を返す
- モバイル: rmsThreshold = 0.03, デスクトップ: 0.01

## 再生時の録音音量

- `PLAYBACK_RECORDING_GAIN_MOBILE`: 録音が加工済みストリームになったため、以前の4.0から1.0に下げた
- 加工前の生streamを録音していた時代は高いゲインが必要だった

## iOS固有の注意点

- echoCancellation のon/off制御が不安定（設定しても無視されることがある）
- スピーカーとマイクが物理的に近く、伴奏がマイクに漏れやすい
- audio/webm 非対応 → audio/mp4 フォールバック必須
- sampleRate 指定無視
- MediaRecorder.start() から実際の録音開始までのラグが大きい傾向
