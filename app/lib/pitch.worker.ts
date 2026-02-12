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
/** YIN threshold。モバイルでは弱い信号を拾うため高めに設定する */
let yinThreshold = 0.2
/** RMS が閾値未満なら無音とみなしピッチ 0 を返す。伴奏のマイク混入によるピッチ誤検出を防ぐ */
let rmsThreshold = 0.01

/** サンプルの RMS（二乗平均平方根）を計算 */
const computeRms = (samples: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i]
  }
  return Math.sqrt(sum / samples.length)
}

self.onmessage = (
  e: MessageEvent<
    | { samples: Float32Array; sampleRate: number }
    | { config: { yinThreshold?: number; rmsThreshold?: number } }
  >,
) => {
  try {
    // 設定メッセージ: パラメータを更新
    if ("config" in e.data) {
      if (e.data.config.yinThreshold != null)
        yinThreshold = e.data.config.yinThreshold
      if (e.data.config.rmsThreshold != null)
        rmsThreshold = e.data.config.rmsThreshold
      detectPitch = null // 次回の検出で再初期化
      return
    }
    const { samples, sampleRate } = e.data

    // 音量が小さすぎる場合はピッチ検出をスキップ（伴奏混入対策）
    if (computeRms(samples) < rmsThreshold) {
      self.postMessage({ midi: 0 })
      return
    }

    if (!detectPitch) {
      detectPitch = Pitchfinder.YIN({
        sampleRate,
        // YIN 自己相関の許容閾値（0〜1）。大きいほど弱い信号でも検出する
        threshold: yinThreshold,
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
