/**
 * Web Audio API + pitchfinder によるピッチ検出
 * MediaRecorder による録音
 * 25ms 間隔で MIDI ノート番号を取得し、コールバックで渡す
 *
 * メモ: ScriptProcessorNode は非推奨だが多くの環境で動作。PoC ではこのままでよい。
 * 将来レイテンシ・安定性を上げる場合は AudioWorklet への移行を検討する。
 */
import * as Pitchfinder from "pitchfinder"
import { useCallback, useRef } from "react"
import { frequencyToMidi } from "~/lib/pitch"

const SAMPLE_RATE = 44100
/** 小さいほど遅延減、大きいほど低音の検出精度向上。1024 ≒ 23ms */
const BUFFER_SIZE = 1024
export const PITCH_INTERVAL_MS = 25
/** マイク入力の増幅度。小さい声でも検出しやすくする */
const INPUT_GAIN = 3

export interface UsePitchDetectionOptions {
  onPitch: (midi: number) => void
  onError?: (error: Error) => void
}

export interface UsePitchDetectionResult {
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
}

export const usePitchDetection = (options: UsePitchDetectionOptions) => {
  const { onPitch, onError } = options
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const latestMidiRef = useRef<number>(0)
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const context = new AudioContext({
        sampleRate: SAMPLE_RATE,
        latencyHint: "interactive",
      })
      contextRef.current = context

      const source = context.createMediaStreamSource(stream)
      sourceRef.current = source

      const gain = context.createGain()
      gain.gain.value = INPUT_GAIN
      gainRef.current = gain

      const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1)
      processorRef.current = processor

      const detectPitch = Pitchfinder.YIN({
        sampleRate: SAMPLE_RATE,
        threshold: 0.05,
        probabilityThreshold: 0.05,
      })

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        const freq = detectPitch(input)
        const midi = freq ? Math.round(frequencyToMidi(freq)) : 0
        latestMidiRef.current = midi
      }

      source.connect(gain)
      gain.connect(processor)
      processor.connect(context.destination)

      intervalIdRef.current = setInterval(() => {
        onPitch(latestMidiRef.current)
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
      onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }, [onPitch, onError])

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
      sourceRef.current.disconnect()
      gainRef.current?.disconnect()
      processorRef.current.disconnect()
      processorRef.current.onaudioprocess = null
      processorRef.current = null
      gainRef.current = null
      sourceRef.current = null
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

  return { start, stop }
}
