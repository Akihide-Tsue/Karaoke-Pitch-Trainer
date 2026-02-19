/**
 * Web Audio API (AudioWorklet) + pitchy によるピッチ検出と録音
 *
 * AudioWorklet で PCM を収集し、pitch.worker.ts (Web Worker) で MPM 計算を行う。
 * AudioWorklet スレッドは realtime priority のため重い処理を置かず、
 * サンプルの転送のみを担当する。
 */
import { useCallback, useRef } from "react"
import processorUrl from "./pitch-processor.ts?worker&url"

/** ピッチ検出のサンプル間隔（ms）。20ms で 50fps */
export const PITCH_INTERVAL_MS = 20

/** マイク入力の増幅度（ピッチ検出用） */
const INPUT_GAIN_IOS = 30
const INPUT_GAIN_ANDROID = 25
const INPUT_GAIN_DESKTOP = 3

/** 録音パスの増幅度。ピッチ検出用ほど大きくせず、声を聴き取れる程度にブーストする。
 *  デスクトップは echoCancellation=false で伴奏がマイクに漏れるため、
 *  録音パスでは増幅せず再生時にブーストする（漏れ伴奏の増幅を避ける） */
const REC_GAIN_IOS = 3
const REC_GAIN_ANDROID = 7
const REC_GAIN_DESKTOP = 1

export interface UsePitchDetectionOptions {
  onPitch: (midi: number, timeMs: number) => void
  getPlaybackPositionMs?: () => number
  onError?: (error: Error) => void
}

export interface UsePitchDetectionResult {
  requestPermission: () => Promise<void>
  start: () => Promise<number>
  stop: () => Promise<Blob | null>
}

/** start() で確保したリソースをまとめて保持する */
interface Session {
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  gain: GainNode
  recGain: GainNode
  workletNode: AudioWorkletNode
  worker: Worker
  recorder: MediaRecorder
  intervalId: ReturnType<typeof setInterval>
}

export const usePitchDetection = (options: UsePitchDetectionOptions) => {
  const { onPitch, getPlaybackPositionMs, onError } = options
  const sessionRef = useRef<Session | null>(null)
  const latestMidiRef = useRef(0)
  const chunksRef = useRef<Blob[]>([])

  const requestPermission = useCallback(async () => {
    try {
      try {
        if (typeof navigator.permissions?.query === "function") {
          const perm = await navigator.permissions.query({ name: "microphone" })
          if (perm.state === "granted" || perm.state === "denied") return
        }
      } catch {
        // query 非対応（Safari 等）→ getUserMedia でダイアログを出す
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

      // iOS はスピーカーとマイクが近く伴奏が混入するため echoCancellation のみ有効
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: isIOS,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      })

      // ネイティブサンプルレートで作成（iOS は sampleRate 指定を無視するため）
      const context = new AudioContext({ latencyHint: "interactive" })
      if (context.state === "suspended") await context.resume()

      await context.audioWorklet.addModule(processorUrl)

      // Web Worker 起動
      const worker = new Worker(new URL("./pitch.worker.ts", import.meta.url), {
        type: "module",
      })
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

      // ピッチ検出用: GainNode で増幅（録音には影響しない）
      const gain = context.createGain()
      gain.gain.value = isIOS ? INPUT_GAIN_IOS : isMobile ? INPUT_GAIN_ANDROID : INPUT_GAIN_DESKTOP

      const sampleRate = context.sampleRate
      const workletNode = new AudioWorkletNode(context, "pitch-processor")
      workletNode.port.onmessage = (ev: MessageEvent<{ samples: Float32Array }>) => {
        if (!sessionRef.current) return
        const { samples } = ev.data
        sessionRef.current.worker.postMessage({ samples, sampleRate }, [samples.buffer])
      }

      // 録音用: 適度にブーストして録音（再生時のゲインは 1.0）
      // 初期化過渡ノイズを避けるため 0 から短時間でフェードインする（録音再生の頭のザラッとした音を消す）
      const recGainValue = isIOS ? REC_GAIN_IOS : isMobile ? REC_GAIN_ANDROID : REC_GAIN_DESKTOP
      const recGain = context.createGain()
      recGain.gain.value = 0
      recGain.gain.linearRampToValueAtTime(recGainValue, context.currentTime + 0.05)

      // 信号経路:
      //   source → gain(20x) → workletNode → dummyDest (ピッチ検出、スピーカーには出さない)
      //   source → recGain(3-5x) → recDest (録音: 適度に増幅)
      source.connect(gain)
      gain.connect(workletNode)
      workletNode.connect(context.createMediaStreamDestination())

      const recDest = context.createMediaStreamDestination()
      source.connect(recGain)
      recGain.connect(recDest)

      // timeMs はそのまま渡す。レイテンシ補正は practice.tsx の自動キャリブレーションで行う。
      const intervalId = setInterval(() => {
        const timeMs = getPlaybackPositionMs?.() ?? 0
        onPitch(latestMidiRef.current, timeMs)
      }, PITCH_INTERVAL_MS)

      // MediaRecorder
      chunksRef.current = []
      const recMimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ].find((t) => MediaRecorder.isTypeSupported(t))
      const recorder = new MediaRecorder(recDest.stream, {
        ...(recMimeType ? { mimeType: recMimeType } : {}),
        audioBitsPerSecond: 128000,
      })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(250)

      sessionRef.current = {
        stream,
        context,
        source,
        gain,
        recGain,
        workletNode,
        worker,
        recorder,
        intervalId,
      }
      return performance.now()
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)))
      return performance.now()
    }
  }, [onPitch, getPlaybackPositionMs, onError])

  const stop = useCallback(async (): Promise<Blob | null> => {
    const session = sessionRef.current
    if (!session) return null
    sessionRef.current = null

    clearInterval(session.intervalId)

    // 録音を停止して Blob を取得
    let blob: Blob | null = null
    if (session.recorder.state !== "inactive") {
      const mimeType = session.recorder.mimeType || "audio/webm"
      blob = await new Promise<Blob | null>((resolve) => {
        session.recorder.onstop = () => {
          resolve(
            chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeType }) : null,
          )
        }
        session.recorder.stop()
      })
    }

    // リソース解放
    session.source.disconnect()
    session.gain.disconnect()
    session.recGain.disconnect()
    session.workletNode.disconnect()
    session.worker.terminate()
    for (const t of session.stream.getTracks()) t.stop()
    session.context.close()

    return blob
  }, [])

  return { requestPermission, start, stop }
}
