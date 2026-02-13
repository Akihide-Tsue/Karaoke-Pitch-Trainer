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
/** マイク入力の増幅度。DSP(AGC/NS)を無効にした生信号を増幅する。
 *  高すぎるとクリッピングで波形が歪みYINの誤検出を招くため、
 *  DynamicsCompressorNode と併用して適度な値にする */
const INPUT_GAIN_MOBILE = 10
const INPUT_GAIN_DESKTOP = 3
/** RMS 音量ゲート閾値。この値未満の音量はノイズ/伴奏漏れとみなしピッチ検出をスキップする */
const RMS_THRESHOLD_MOBILE = 0.02
const RMS_THRESHOLD_DESKTOP = 0.01

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
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const recDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
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
      // 歌唱アプリでは通話用DSP（エコーキャンセル・ノイズ抑制・自動ゲイン）を
      // すべて無効にし、GainNode + DynamicsCompressorNode で品質を制御する。
      // これらのDSPは歌声の倍音やダイナミクスを劣化させるため。
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      })
      streamRef.current = stream

      // マイク専用 AudioContext をネイティブサンプルレートで作成
      // （iOS は sampleRate 指定を無視するためハードコードしない）
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
      // スピーカーから漏れた伴奏の誤検出を防ぐため RMS 閾値を高めに設定
      worker.postMessage({
        config: {
          // YIN 自己相関の許容閾値（デフォルト 0.2）。大きいほど弱い信号でもピッチを検出する
          yinThreshold: isMobile ? 0.35 : 0.2,
          rmsThreshold: isMobile ? RMS_THRESHOLD_MOBILE : RMS_THRESHOLD_DESKTOP,
        },
      })
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

      // クリッピング防止: GainNode で増幅した信号が 0dBFS を超えないよう圧縮する
      const compressor = context.createDynamicsCompressor()
      compressor.threshold.value = -6 // -6dB で圧縮開始
      compressor.knee.value = 6
      compressor.ratio.value = 4 // 4:1
      compressor.attack.value = 0.003 // 3ms
      compressor.release.value = 0.1 // 100ms
      compressorRef.current = compressor

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

      // 信号経路: source → gain → compressor → workletNode (ピッチ検出)
      //                                       → recDest (録音)
      source.connect(gain)
      gain.connect(compressor)
      compressor.connect(workletNode)
      // workletNode は出力先が必要だが、スピーカーには出さない（マイク音声がスピーカーから出てしまうため）
      // ダミーの destination に接続して AudioWorklet の処理を維持する
      const dummyDest = context.createMediaStreamDestination()
      workletNode.connect(dummyDest)
      // 録音用: 増幅+圧縮済みの信号を録音する（生streamではなく加工後の信号）
      const recDest = context.createMediaStreamDestination()
      compressor.connect(recDest)
      recDestRef.current = recDest

      intervalIdRef.current = setInterval(() => {
        const timeMs = getPlaybackPositionMs?.() ?? 0
        onPitch(latestMidiRef.current, timeMs)
      }, PITCH_INTERVAL_MS)

      // MediaRecorder: recDest（増幅+圧縮済み）から録音。生 stream だと音量が小さすぎる
      chunksRef.current = []
      const recMimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4", // iOS Safari フォールバック
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ].find((t) => MediaRecorder.isTypeSupported(t))
      const recorder = new MediaRecorder(recDest.stream, {
        ...(recMimeType ? { mimeType: recMimeType } : {}),
        audioBitsPerSecond: 128000, // 歌声品質: 128kbps
      })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(250)
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
      const actualMimeType = recorder.mimeType || "audio/webm"
      blob = await new Promise<Blob | null>((resolve) => {
        recorder.onstop = () => {
          if (chunksRef.current.length > 0) {
            resolve(new Blob(chunksRef.current, { type: actualMimeType }))
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
      compressorRef.current?.disconnect()
      recDestRef.current = null
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
      compressorRef.current = null
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
