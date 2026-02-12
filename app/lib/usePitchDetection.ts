/**
 * Web Audio API (AudioWorklet) + pitchfinder によるピッチ検出
 * MediaRecorder による録音
 * PITCH_INTERVAL_MS 間隔で MIDI ノート番号を取得し、コールバックで渡す
 *
 * AudioWorklet で PCM を収集し、pitch.worker.ts (Web Worker) で YIN 計算を行う。
 * AudioWorklet スレッドは realtime priority のため重い処理を置かず、
 * サンプルの転送のみを担当する。
 */
import { useCallback, useRef } from "react"
import processorUrl from "./pitch-processor.ts?worker&url"

/** ピッチ検出のサンプル間隔。20ms で 50/s になりリアルタイム性が上がる */
export const PITCH_INTERVAL_MS = 20
/** マイク入力の増幅度。PCは伴奏を拾わないよう控えめ、スマホは信号が弱いため高め */
const INPUT_GAIN_MOBILE = 20
const INPUT_GAIN_DESKTOP = 3

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
  /** ピッチ検出を開始する。マイク専用 AudioContext を内部で作成する。
   *  戻り値は MediaRecorder.start() を呼んだ時刻 (performance.now()) */
  start: () => Promise<number>
  stop: () => Promise<Blob | null>
}

export const usePitchDetection = (options: UsePitchDetectionOptions) => {
  const { onPitch, getPlaybackPositionMs, onError } = options
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const latestMidiRef = useRef<number>(0)
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const requestPermission = useCallback(async () => {
    try {
      try {
        if (typeof navigator.permissions?.query === "function") {
          const perm = await navigator.permissions.query({ name: "microphone" })
          if (perm.state === "granted") return
          if (perm.state === "denied") return
        }
      } catch {
        // query 非対応（Safari 等）の場合は下の getUserMedia でダイアログを出す
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const t of stream.getTracks()) t.stop()
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }, [onError])

  const start = useCallback(async (): Promise<number> => {
    latestMidiRef.current = 0
    try {
      const isMobile =
        /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
      const isIOS =
        /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // iOS はスピーカーとマイクが近く伴奏が録音に混入するためエコーキャンセルを有効にする
          echoCancellation: isIOS,
          // モバイルでは noiseSuppression: false にするとマイク信号が極端に小さくなるため ON にする
          noiseSuppression: isMobile,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      // マイク専用 AudioContext をネイティブサンプルレートで作成
      // （再生用 48kHz context と共有するとリサンプリングで信号が劣化するため）
      const context = new AudioContext({ latencyHint: "interactive" })
      contextRef.current = context
      if (context.state === "suspended") {
        await context.resume()
      }

      const sampleRate = context.sampleRate

      // AudioWorklet processor を登録（2回目以降は無視される）
      await context.audioWorklet.addModule(processorUrl)

      // pitch.worker.ts（YIN 計算用 Web Worker）を起動
      const worker = new Worker(new URL("./pitch.worker.ts", import.meta.url), {
        type: "module",
      })
      workerRef.current = worker
      // モバイルでは YIN の閾値を緩和して弱い信号でもピッチを拾いやすくする
      // iOS ではエコーキャンセル後も伴奏が微小に残るため RMS 閾値を高めにして誤検出を抑制
      if (isMobile) {
        worker.postMessage({
          config: {
            yinThreshold: 0.35,
            rmsThreshold: isIOS ? 0.03 : 0.01,
          },
        })
      }
      worker.onmessage = (
        ev: MessageEvent<{ midi: number } | { error: string }>,
      ) => {
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
      gain.gain.value = isMobile ? INPUT_GAIN_MOBILE : INPUT_GAIN_DESKTOP
      gainRef.current = gain

      // AudioWorkletNode を作成し、worklet → worker へサンプルを転送
      const workletNode = new AudioWorkletNode(context, "pitch-processor")
      workletNodeRef.current = workletNode
      workletNode.port.onmessage = (
        ev: MessageEvent<{ samples: Float32Array; sampleRate: number }>,
      ) => {
        if (!workerRef.current) return
        const { samples } = ev.data
        workerRef.current.postMessage({ samples, sampleRate }, [samples.buffer])
      }

      source.connect(gain)
      gain.connect(workletNode)
      // destination に繋がないことで伴奏の出力に干渉しない
      const dest = context.createMediaStreamDestination()
      workletNode.connect(dest)

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
      return performance.now()
    } catch (err) {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
      onError?.(err instanceof Error ? err : new Error(String(err)))
      return performance.now()
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
    if (workletNodeRef.current && sourceRef.current) {
      sourceRef.current.disconnect()
      gainRef.current?.disconnect()
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
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
