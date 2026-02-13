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

/** clarity（信頼度 0〜1）がこの値未満の検出結果は棄却する */
let minClarity = 0.8

/** GainNode 増幅で ±1.0 を超えた信号を正規化する */
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

self.onmessage = (
  e: MessageEvent<
    | { config: { minClarity?: number } }
    | { samples: Float32Array; sampleRate: number; timeMs: number }
  >,
) => {
  try {
    if ("config" in e.data) {
      if (e.data.config.minClarity != null)
        minClarity = e.data.config.minClarity
      return
    }

    const { samples, sampleRate, timeMs } = e.data
    const normalizedSamples = normalizeIfClipped(samples)
    const [pitch, clarity] = detector.findPitch(normalizedSamples, sampleRate)

    let midi = 0
    if (pitch > 0 && clarity >= minClarity) {
      midi = Math.round(frequencyToMidi(pitch))
    }
    // 歌声の範囲外（C2=36未満 or C6=84超）は誤検出とみなし無視
    if (midi > 0 && (midi < 36 || midi > 84)) midi = 0
    self.postMessage({ midi, timeMs })
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
