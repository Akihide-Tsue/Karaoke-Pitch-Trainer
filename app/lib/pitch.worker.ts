/**
 * ピッチ検出を Web Worker 内で実行（メインスレッドのブロックを避ける）
 * メインから samples + sampleRate を受け取り、YIN で周波数 → MIDI を返す
 */
import * as Pitchfinder from "pitchfinder"

const frequencyToMidi = (frequency: number): number => {
  if (frequency <= 0) return 0
  return 12 * Math.log2(frequency / 440) + 69
}

let detectPitch: ((samples: Float32Array) => number | null) | null = null

self.onmessage = (
  e: MessageEvent<{ samples: Float32Array; sampleRate: number }>,
) => {
  try {
    const { samples, sampleRate } = e.data
    if (!detectPitch) {
      detectPitch = Pitchfinder.YIN({
        sampleRate,
        // YIN 自己相関の許容閾値（0〜1）。大きいほど弱い信号でも検出する。既定 0.1
        threshold: 0.15,
        // 検出結果を採用する最低確率（0〜1）。低いほど不確実な検出も返す
        probabilityThreshold: 0.1,
      })
    }
    const freq = detectPitch(samples)
    const midi = freq ? Math.round(frequencyToMidi(freq)) : 0
    self.postMessage({ midi })
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
