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

self.onmessage = (e: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  try {
    const { samples, sampleRate } = e.data
    if (!detectPitch) {
      detectPitch = Pitchfinder.YIN({
        sampleRate,
        threshold: 0.03,
        probabilityThreshold: 0.03,
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
