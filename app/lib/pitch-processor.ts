/**
 * AudioWorkletProcessor: マイク PCM サンプルをバッファに蓄積し、
 * BUFFER_SIZE 分溜まったら port.postMessage で Web Worker（pitch.worker.ts）へ転送する。
 * MPM 等の重い計算は行わず、realtime スレッドの負荷を最小限に抑える。
 */

// AudioWorkletGlobalScope の型定義（worklet 内では DOM 型が使えないため）
declare const sampleRate: number
declare const currentTime: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
}
declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void

/** バッファサイズ。小さいほど検出頻度が上がるが、低音の精度が下がる */
const BUFFER_SIZE = 2048

class PitchProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array = new Float32Array(BUFFER_SIZE)
  private offset = 0

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    if (!input) return true

    let pos = 0
    while (pos < input.length) {
      const remaining = BUFFER_SIZE - this.offset
      const toCopy = Math.min(remaining, input.length - pos)
      this.buffer.set(input.subarray(pos, pos + toCopy), this.offset)
      this.offset += toCopy
      pos += toCopy

      if (this.offset >= BUFFER_SIZE) {
        const copy = new Float32Array(this.buffer)
        this.port.postMessage({ samples: copy, sampleRate, currentTime }, [copy.buffer])
        this.offset = 0
      }
    }
    return true
  }
}

registerProcessor("pitch-processor", PitchProcessor)
