/**
 * Web Audio API + pitchfinder によるピッチ検出（Web Worker でピッチ計算）
 * MediaRecorder による録音
 * PITCH_INTERVAL_MS 間隔で MIDI ノート番号を取得し、コールバックで渡す
 *
 * ピッチ検出は pitch.worker.ts 内で実行し、メインスレッドのブロックを避ける（plan.md 6.4）。
 */
import { useCallback, useRef } from "react"

/** 小さいほど遅延減、大きいほど低音の検出精度向上。2048 は iOS で安定しやすい */
const BUFFER_SIZE = 2048
/** ピッチ検出のサンプル間隔。20ms で 50/s になりリアルタイム性が上がる（midikaraoke に近づける） */
export const PITCH_INTERVAL_MS = 20
/** マイク入力の増幅度。スマホマイクは小さいため 5 に設定 */
const INPUT_GAIN = 5

export interface UsePitchDetectionOptions {
  /** 検出したピッチを渡す。timeMs は再生位置（伴奏の currentTime）を渡すと正確に同期する */
  onPitch: (midi: number, timeMs: number) => void
  /** 再生位置（ms）を返す関数。ピッチを正確な時刻でタグ付けするために使用 */
  getPlaybackPositionMs?: () => number
  onError?: (error: Error) => void
}

export interface UsePitchDetectionResult {
  /** マイク許可を事前に取得する（ストリームは即解放）。ページ表示時に呼ぶとダイアログを先に出せる */
  requestPermission: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
}

export const usePitchDetection = (options: UsePitchDetectionOptions) => {
  const { onPitch, getPlaybackPositionMs, onError } = options
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const latestMidiRef = useRef<number>(0)
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const requestPermission = useCallback(async () => {
    try {
      // Permissions API が使える場合は状態を確認。許可済みなら何もしない（永続許可のまま）。
      try {
        if (typeof navigator.permissions?.query === "function") {
          const perm = await navigator.permissions.query({ name: "microphone" })
          if (perm.state === "granted") return
          if (perm.state === "denied") return
        }
      } catch {
        // query 非対応（Safari 等）の場合は下の getUserMedia でダイアログを出す
      }

      // prompt または API 非対応時は getUserMedia でダイアログを出す。許可されればブラウザが永続保存する。
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const t of stream.getTracks()) t.stop()
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }, [onError])

  const start = useCallback(async () => {
    latestMidiRef.current = 0
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const context = new AudioContext({ latencyHint: "interactive" })
      contextRef.current = context
      if (context.state === "suspended") {
        await context.resume()
      }

      const sampleRate = context.sampleRate

      const worker = new Worker(
        new URL("./pitch.worker.ts", import.meta.url),
        { type: "module" },
      )
      workerRef.current = worker
      worker.onmessage = (ev: MessageEvent<{ midi: number } | { error: string }>) => {
        if ("error" in ev.data) {
          onError?.(new Error(ev.data.error))
          return
        }
        latestMidiRef.current = ev.data.midi
      }
      worker.onerror = () => {
        onError?.(new Error("ピッチ検出 Worker でエラーが発生しました"))
      }

      const source = context.createMediaStreamSource(stream)
      sourceRef.current = source

      const gain = context.createGain()
      gain.gain.value = INPUT_GAIN
      gainRef.current = gain

      const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!workerRef.current) return
        const input = e.inputBuffer.getChannelData(0)
        const copy = new Float32Array(input.length)
        copy.set(input)
        workerRef.current.postMessage({ samples: copy, sampleRate }, [copy.buffer])
      }

      source.connect(gain)
      gain.connect(processor)
      processor.connect(context.destination)

      intervalIdRef.current = setInterval(() => {
        const timeMs = getPlaybackPositionMs?.() ?? 0
        onPitch(latestMidiRef.current, timeMs)
      }, PITCH_INTERVAL_MS)

      chunksRef.current = []
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg",
      })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(100)
      recorderRef.current = recorder
    } catch (err) {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
      onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }, [onPitch, getPlaybackPositionMs, onError])

  const stop = useCallback(async (): Promise<Blob | null> => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current)
      intervalIdRef.current = null
    }
    let blob: Blob | null = null
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      blob = await new Promise<Blob | null>((resolve) => {
        recorder.onstop = () => {
          if (chunksRef.current.length > 0) {
            resolve(new Blob(chunksRef.current, { type: "audio/webm" }))
          } else {
            resolve(null)
          }
        }
        recorder.stop()
      })
    }
    recorderRef.current = null
    if (processorRef.current && sourceRef.current) {
      processorRef.current.onaudioprocess = null
      sourceRef.current.disconnect()
      gainRef.current?.disconnect()
      processorRef.current.disconnect()
      processorRef.current = null
      gainRef.current = null
      sourceRef.current = null
    }
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
    }
    if (contextRef.current) {
      contextRef.current.close()
      contextRef.current = null
    }
    return blob
  }, [])

  return { requestPermission, start, stop }
}
