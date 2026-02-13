/**
 * ピッチ検出を Web Worker 内で実行（メインスレッドのブロックを避ける）
 * メインから samples + sampleRate を受け取り、pitchy (MPM) で周波数 → MIDI を返す
 *
 * pitchy は McLeod Pitch Method (MPM) を使用し、
 * YIN と比べて基本周波数と倍音の区別に優れ、オクターブ誤検出が少ない。
 * また clarity（信頼度 0〜1）を返すため、信頼度ベースのフィルタリングが可能。
 */
import { PitchDetector } from "pitchy"

const frequencyToMidi = (frequency: number): number => {
  if (frequency <= 0) return 0
  return 12 * Math.log2(frequency / 440) + 69
}

/** pitch-processor.ts の BUFFER_SIZE と一致させる */
const INPUT_LENGTH = 2048

/** pitchy の PitchDetector インスタンス */
const detector = PitchDetector.forFloat32Array(INPUT_LENGTH)

/** clarity（信頼度 0〜1）がこの値未満の検出結果は棄却する。
 *  config メッセージで OS 別に設定される */
let minClarity = 0.7

/** ────────────────────────────────────────────
 *  メディアンフィルタ: スパイク的なオクターブ誤検出を除去する
 *  ──────────────────────────────────────────── */

/** 直近 N フレームの MIDI 値を保持する。
 *  ウィンドウが大きいほどスパイク除去に強いが、描画の遅延が増える */
const MEDIAN_WINDOW = 3
const midiHistory: number[] = []
/** 直前の安定した MIDI 値。オクターブ跳び判定の基準 */
let lastStableMidi = 0

const medianFilter = (midi: number): number => {
  // 直前の安定値から 10 半音以上跳んだ場合はオクターブ誤検出の疑いがあるため無視
  if (midi > 0 && lastStableMidi > 0 && Math.abs(midi - lastStableMidi) >= 10) {
    midi = 0
  }
  midiHistory.push(midi)
  if (midiHistory.length > MEDIAN_WINDOW) midiHistory.shift()
  // 有効な値（> 0）だけで中央値を取る。無音フレームは除外
  const valid = midiHistory.filter((v) => v > 0)
  if (valid.length === 0) return 0
  valid.sort((a, b) => a - b)
  const result = valid[Math.floor(valid.length / 2)]
  if (result > 0) lastStableMidi = result
  return result
}

/** ────────────────────────────────────────────
 *  クリッピング正規化: GainNode 増幅で ±1.0 を超えた信号を正規化する
 *  ──────────────────────────────────────────── */

const normalizeIfClipped = (samples: Float32Array): Float32Array => {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i])
    if (abs > peak) peak = abs
  }
  if (peak <= 1.0) return samples
  const normalized = new Float32Array(samples.length)
  const scale = 1.0 / peak
  for (let i = 0; i < normalized.length; i++) {
    normalized[i] = samples[i] * scale
  }
  return normalized
}

/** ────────────────────────────────────────────
 *  メッセージハンドラ
 *  ──────────────────────────────────────────── */

interface ConfigMessage {
  config: {
    /** clarity（信頼度）がこの値未満の検出結果は棄却する（0〜1） */
    minClarity?: number
    /** pitchy 内蔵の clarity 閾値（0〜1）。デフォルト 0.9。
     *  内部の key maxima スキャンで使用される */
    clarityThreshold?: number
    /** pitchy 内蔵の最小音量（RMS）。この値未満は無音として [0, 0] を返す */
    minVolumeAbsolute?: number
  }
}

interface SamplesMessage {
  samples: Float32Array
  sampleRate: number
}

self.onmessage = (e: MessageEvent<ConfigMessage | SamplesMessage>) => {
  try {
    // 設定メッセージ: パラメータを更新
    if ("config" in e.data) {
      const { config } = e.data
      if (config.minClarity != null) minClarity = config.minClarity
      if (config.clarityThreshold != null)
        detector.clarityThreshold = config.clarityThreshold
      if (config.minVolumeAbsolute != null)
        detector.minVolumeAbsolute = config.minVolumeAbsolute
      return
    }

    const { samples, sampleRate } = e.data

    // GainNode による増幅でクリップした信号を正規化してからピッチ検出に渡す
    const normalizedSamples = normalizeIfClipped(samples)
    const [pitch, clarity] = detector.findPitch(normalizedSamples, sampleRate)

    let midi = 0
    if (pitch > 0 && clarity >= minClarity) {
      midi = Math.round(frequencyToMidi(pitch))
    }
    // 歌声の範囲外（C2=36未満 or C6=84超）はオクターブ誤検出とみなし無視
    if (midi > 0 && (midi < 36 || midi > 84)) midi = 0
    // メディアンフィルタで単発のオクターブ跳びを除去
    midi = medianFilter(midi)
    self.postMessage({ midi })
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
