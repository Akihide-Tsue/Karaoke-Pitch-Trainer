/**
 * ピッチ検出を Web Worker 内で実行（メインスレッドのブロックを避ける）
 * メインから samples + sampleRate を受け取り、MacLeod (MPM) で周波数 → MIDI を返す
 */
import * as Pitchfinder from "pitchfinder"

const frequencyToMidi = (frequency: number): number => {
  if (frequency <= 0) return 0
  return 12 * Math.log2(frequency / 440) + 69
}

let detectPitch:
  | ((buf: Float32Array) => { freq: number; probability: number })
  | null = null
/** MacLeod cutoff: 最高ピークの何%以上のピークを採用するか（0〜1）。
 *  低いほど弱い信号でもピッチを検出する */
let cutoff = 0.97
/** probability がこの値未満の検出結果は信頼度不足として棄却する */
let minProbability = 0.3
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

/** GainNode で増幅した信号が ±1.0 を超えている場合、正規化してピッチ検出の精度を保つ */
const normalizeIfClipped = (samples: Float32Array): Float32Array => {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i])
    if (abs > peak) peak = abs
  }
  if (peak <= 1.0) return samples
  // クリップしている → ピークで割って ±1.0 に正規化
  const normalized = new Float32Array(samples.length)
  const scale = 1.0 / peak
  for (let i = 0; i < normalized.length; i++) {
    normalized[i] = samples[i] * scale
  }
  return normalized
}

/** メディアンフィルタ用バッファ。直近 N フレームの MIDI 値を保持する
 *  ウィンドウが大きいほどスパイク除去に強いが、描画の遅延が増える */
const MEDIAN_WINDOW = 3
const midiHistory: number[] = []
/** 直前の安定した MIDI 値。オクターブ跳び判定の基準 */
let lastStableMidi = 0

/** 直近 N フレームの中央値を返す。スパイク的なオクターブ誤検出を除去する */
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

self.onmessage = (
  e: MessageEvent<
    | { samples: Float32Array; sampleRate: number }
    | {
        config: {
          cutoff?: number
          minProbability?: number
          rmsThreshold?: number
        }
      }
  >,
) => {
  try {
    // 設定メッセージ: パラメータを更新
    if ("config" in e.data) {
      if (e.data.config.cutoff != null) cutoff = e.data.config.cutoff
      if (e.data.config.minProbability != null)
        minProbability = e.data.config.minProbability
      if (e.data.config.rmsThreshold != null)
        rmsThreshold = e.data.config.rmsThreshold
      detectPitch = null // 次回の検出で再初期化
      return
    }
    const { samples, sampleRate } = e.data

    // 音量が小さすぎる場合はピッチ検出をスキップ（伴奏混入対策）
    if (computeRms(samples) < rmsThreshold) {
      self.postMessage({ midi: medianFilter(0) })
      return
    }

    if (!detectPitch) {
      // MacLeod (MPM): YIN より基本周波数と倍音の区別に優れ、オクターブ誤検出が少ない
      detectPitch = Pitchfinder.Macleod({
        sampleRate,
        // 最高ピークの何%以上のピークを採用するか（0〜1）。低いほど弱い信号でも検出する
        cutoff,
      }) as unknown as typeof detectPitch
    }
    // GainNode による増幅でクリップした信号を正規化してからピッチ検出に渡す
    const normalizedSamples = normalizeIfClipped(samples)
    const result = detectPitch!(normalizedSamples)
    let midi = 0
    if (result && result.freq > 0 && result.probability >= minProbability) {
      midi = Math.round(frequencyToMidi(result.freq))
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
