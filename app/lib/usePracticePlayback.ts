import { useCallback, useEffect, useRef, useState } from "react"
import type { MelodyData } from "~/lib/melody"
import { loadAudioBuffer } from "~/lib/useAudioBufferLoader"
import type { UsePitchDetectionResult } from "~/lib/usePitchDetection"
import type { PitchEntry } from "~/stores/practice"

const SEEK_SECONDS = 10

/**
 * usePracticePlayback のオプション
 */
export interface UsePracticePlaybackOptions {
  melodyData: MelodyData | null
  useGuideVocal: boolean
  setUseGuideVocal: (fn: (v: boolean) => boolean) => void
  setPlaybackPosition: (ms: number) => void
  setPitchData: React.Dispatch<React.SetStateAction<PitchEntry[]>>
  setIsPracticing: (v: boolean) => void
  pitchDetection: UsePitchDetectionResult
  /** 再生音量（0.0〜1.0） */
  volume?: number
  /** 伴奏の音声 URL */
  instUrl: string
  /** ガイドボーカルの音声 URL */
  vocalUrl: string
}

/**
 * usePracticePlayback の戻り値
 */
/** 音声バッファのロード状態 */
export type BufferLoadStatus = "idle" | "loading" | "loaded" | "error"

export interface UsePracticePlaybackResult {
  isLoaded: boolean
  /** 音声ロード状態 */
  bufferLoadStatus: BufferLoadStatus
  /** 音声バッファのロードに失敗した場合のエラーメッセージ */
  bufferLoadError: string | null
  /** 音声バッファの読み込みを開始する */
  startLoading: () => void
  getPlaybackPositionMs: () => number
  startPlayback: () => Promise<void>
  stopPlayback: () => Promise<void>
  resumePlayback: () => Promise<void>
  seekBackward: () => void
  seekForward: () => void
  seekToMs: (timeMs: number) => void
  toggleGuideVocal: () => void
  seekSeconds: number
}

/**
 * 練習画面の再生・録音・ピッチ検出を統合して管理するフック。
 * 全ての音声を 1 本の AudioContext で処理し、マイク使用時の音質劣化を防ぐ。
 * AudioBufferSourceNode で伴奏／ガイドボーカルを再生する。
 */
export const usePracticePlayback = (
  options: UsePracticePlaybackOptions,
): UsePracticePlaybackResult => {
  const {
    melodyData,
    useGuideVocal,
    setUseGuideVocal,
    setPlaybackPosition,
    setPitchData,
    setIsPracticing,
    pitchDetection,
    volume = 1.0,
    instUrl,
    vocalUrl,
  } = options

  // --- AudioContext & GainNode（useEffect で 1 回だけ作成） ---
  const contextRef = useRef<AudioContext | null>(null)
  const instGainRef = useRef<GainNode | null>(null)
  const vocalGainRef = useRef<GainNode | null>(null)

  // --- AudioBuffer のロード ---
  const instBufferRef = useRef<AudioBuffer | null>(null)
  const vocalBufferRef = useRef<AudioBuffer | null>(null)
  const [bufferLoadStatus, setBufferLoadStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle")
  const [bufferLoadError, setBufferLoadError] = useState<string | null>(null)
  const loadingCancelledRef = useRef(false)
  const isLoadingRef = useRef(false)

  const startLoading = useCallback(() => {
    if (isLoadingRef.current) return
    // 再試行時は前の context を閉じる
    if (contextRef.current) {
      contextRef.current.close()
      contextRef.current = null
      instGainRef.current = null
      vocalGainRef.current = null
    }

    const ctx = new AudioContext({ sampleRate: 48000 })
    contextRef.current = ctx
    const ig = ctx.createGain()
    ig.connect(ctx.destination)
    instGainRef.current = ig
    const vg = ctx.createGain()
    vg.connect(ctx.destination)
    vocalGainRef.current = vg

    isLoadingRef.current = true
    loadingCancelledRef.current = false
    setBufferLoadStatus("loading")
    setBufferLoadError(null)

    // resume() は再生開始時（startPlayback）に行う。
    // decodeAudioData は suspended な AudioContext でも動作する。
    Promise.all([loadAudioBuffer(instUrl, ctx), loadAudioBuffer(vocalUrl, ctx)])
      .then(([instBuf, vocalBuf]) => {
        isLoadingRef.current = false
        if (loadingCancelledRef.current) return
        instBufferRef.current = instBuf
        vocalBufferRef.current = vocalBuf
        setBufferLoadError(null)
        setBufferLoadStatus("loaded")
      })
      .catch((err) => {
        isLoadingRef.current = false
        if (!loadingCancelledRef.current) {
          setBufferLoadError(err instanceof Error ? err.message : String(err))
          setBufferLoadStatus("error")
        }
        ctx.close()
        if (contextRef.current === ctx) {
          contextRef.current = null
          instGainRef.current = null
          vocalGainRef.current = null
        }
      })
  }, [instUrl, vocalUrl])

  useEffect(() => {
    return () => {
      loadingCancelledRef.current = true
      if (contextRef.current) {
        contextRef.current.close()
        contextRef.current = null
        instGainRef.current = null
        vocalGainRef.current = null
      }
    }
  }, [])

  // --- 再生状態 ---
  const instSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const vocalSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startedAtRef = useRef(0) // context.currentTime at play start
  const offsetRef = useRef(0) // buffer offset in seconds
  const playingRef = useRef(false)
  // stopPlaybackInternal を ref 化して循環参照を回避
  const stopPlaybackInternalRef = useRef<() => Promise<void>>(async () => {})

  // --- ヘルパー: ソースノードを作成して再生 ---
  const createAndPlaySource = useCallback(
    (
      buffer: AudioBuffer,
      gainNode: GainNode,
      offset: number,
    ): AudioBufferSourceNode => {
      const ctx = contextRef.current
      if (!ctx) throw new Error("AudioContext not initialized")
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gainNode)
      source.start(0, offset)
      return source
    },
    [],
  )

  // --- 再生中のソースを停止（安全に） ---
  const stopSources = useCallback(() => {
    try {
      instSourceRef.current?.stop()
    } catch {
      // already stopped
    }
    try {
      vocalSourceRef.current?.stop()
    } catch {
      // already stopped
    }
    instSourceRef.current = null
    vocalSourceRef.current = null
  }, [])

  // --- 現在の再生位置を取得 ---
  const getPlaybackPositionMs = useCallback((): number => {
    if (!contextRef.current) return 0
    if (!playingRef.current) return offsetRef.current * 1000
    const elapsed = contextRef.current.currentTime - startedAtRef.current
    return (offsetRef.current + elapsed) * 1000
  }, [])

  // --- 再生位置の定期更新（再生中のみ） ---
  const rafIdRef = useRef<number | null>(null)

  const startPositionUpdater = useCallback(() => {
    const tick = () => {
      setPlaybackPosition(getPlaybackPositionMs())
      rafIdRef.current = requestAnimationFrame(tick)
    }
    rafIdRef.current = requestAnimationFrame(tick)
  }, [setPlaybackPosition, getPlaybackPositionMs])

  const stopPositionUpdater = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  // --- onended ハンドラ用ヘルパー ---
  const makeOnEnded = useCallback(
    (
      sourceRef: React.RefObject<AudioBufferSourceNode | null>,
      src: AudioBufferSourceNode,
    ) => {
      return () => {
        if (playingRef.current && sourceRef.current === src) {
          stopPlaybackInternalRef.current()
        }
      }
    },
    [],
  )

  // --- 停止（内部用: onended からも呼ばれる） ---
  const stopPlaybackInternal = useCallback(async () => {
    if (playingRef.current && contextRef.current) {
      const elapsed = contextRef.current.currentTime - startedAtRef.current
      offsetRef.current = offsetRef.current + elapsed
    }
    playingRef.current = false
    stopSources()
    stopPositionUpdater()
    await pitchDetection.stop()
    setIsPracticing(false)
  }, [pitchDetection, setIsPracticing, stopSources, stopPositionUpdater])

  // ref を常に最新に保つ
  stopPlaybackInternalRef.current = stopPlaybackInternal

  // --- 停止（外部用） ---
  const stopPlayback = useCallback(async () => {
    await stopPlaybackInternal()
  }, [stopPlaybackInternal])

  // --- 再生開始 ---
  const startPlayback = useCallback(async () => {
    const ctx = contextRef.current
    const instBuf = instBufferRef.current
    const vocalBuf = vocalBufferRef.current
    const ig = instGainRef.current
    const vg = vocalGainRef.current
    if (!ctx || !instBuf || !vocalBuf || !ig || !vg || !melodyData) return

    if (ctx.state === "suspended") await ctx.resume()

    offsetRef.current = 0
    setPlaybackPosition(0)
    setPitchData([])
    setIsPracticing(true)

    try {
      await pitchDetection.start()
    } catch {
      setIsPracticing(false)
      return
    }

    startedAtRef.current = ctx.currentTime
    playingRef.current = true

    stopSources()

    if (useGuideVocal) {
      const src = createAndPlaySource(vocalBuf, vg, 0)
      vocalSourceRef.current = src
      src.onended = makeOnEnded(vocalSourceRef, src)
    } else {
      const src = createAndPlaySource(instBuf, ig, 0)
      instSourceRef.current = src
      src.onended = makeOnEnded(instSourceRef, src)
    }

    startPositionUpdater()
  }, [
    melodyData,
    useGuideVocal,
    setPlaybackPosition,
    setPitchData,
    setIsPracticing,
    pitchDetection,
    stopSources,
    createAndPlaySource,
    startPositionUpdater,
    makeOnEnded,
  ])

  // --- 再開 ---
  const resumePlayback = useCallback(async () => {
    const ctx = contextRef.current
    const instBuf = instBufferRef.current
    const vocalBuf = vocalBufferRef.current
    const ig = instGainRef.current
    const vg = vocalGainRef.current
    if (!ctx || !instBuf || !vocalBuf || !ig || !vg || !melodyData) return

    if (ctx.state === "suspended") await ctx.resume()

    setIsPracticing(true)
    try {
      await pitchDetection.start()
    } catch {
      setIsPracticing(false)
      return
    }

    const offset = offsetRef.current
    startedAtRef.current = ctx.currentTime
    playingRef.current = true

    stopSources()

    if (useGuideVocal) {
      const src = createAndPlaySource(vocalBuf, vg, offset)
      vocalSourceRef.current = src
      src.onended = makeOnEnded(vocalSourceRef, src)
    } else {
      const src = createAndPlaySource(instBuf, ig, offset)
      instSourceRef.current = src
      src.onended = makeOnEnded(instSourceRef, src)
    }

    startPositionUpdater()
  }, [
    melodyData,
    useGuideVocal,
    setIsPracticing,
    pitchDetection,
    stopSources,
    createAndPlaySource,
    startPositionUpdater,
    makeOnEnded,
  ])

  // --- ガイド切替 ---
  const toggleGuideVocal = useCallback(() => {
    const ctx = contextRef.current
    const instBuf = instBufferRef.current
    const vocalBuf = vocalBufferRef.current
    const ig = instGainRef.current
    const vg = vocalGainRef.current
    if (!ctx || !instBuf || !vocalBuf || !ig || !vg) return

    const currentMs = getPlaybackPositionMs()
    const currentSec = currentMs / 1000
    const wasPlaying = playingRef.current

    stopSources()
    playingRef.current = false

    offsetRef.current = currentSec
    setPlaybackPosition(currentMs)
    setUseGuideVocal((v) => !v)

    if (wasPlaying) {
      const next = !useGuideVocal
      startedAtRef.current = ctx.currentTime
      playingRef.current = true
      if (next) {
        const src = createAndPlaySource(vocalBuf, vg, currentSec)
        vocalSourceRef.current = src
        src.onended = makeOnEnded(vocalSourceRef, src)
      } else {
        const src = createAndPlaySource(instBuf, ig, currentSec)
        instSourceRef.current = src
        src.onended = makeOnEnded(instSourceRef, src)
      }
    }
  }, [
    useGuideVocal,
    getPlaybackPositionMs,
    setPlaybackPosition,
    setUseGuideVocal,
    stopSources,
    createAndPlaySource,
    makeOnEnded,
  ])

  const totalDurationMs = melodyData?.totalDurationMs ?? 0

  // --- シーク ---
  const seekToMs = useCallback(
    (timeMs: number) => {
      const ctx = contextRef.current
      const instBuf = instBufferRef.current
      const vocalBuf = vocalBufferRef.current
      const ig = instGainRef.current
      const vg = vocalGainRef.current
      if (!ctx || !instBuf || !vocalBuf || !ig || !vg || totalDurationMs <= 0)
        return

      const sec = Math.max(0, Math.min(totalDurationMs / 1000, timeMs / 1000))
      const wasPlaying = playingRef.current

      stopSources()
      playingRef.current = false
      offsetRef.current = sec
      setPlaybackPosition(sec * 1000)

      if (wasPlaying) {
        startedAtRef.current = ctx.currentTime
        playingRef.current = true
        if (useGuideVocal) {
          const src = createAndPlaySource(vocalBuf, vg, sec)
          vocalSourceRef.current = src
          src.onended = makeOnEnded(vocalSourceRef, src)
        } else {
          const src = createAndPlaySource(instBuf, ig, sec)
          instSourceRef.current = src
          src.onended = makeOnEnded(instSourceRef, src)
        }
      }
    },
    [
      totalDurationMs,
      useGuideVocal,
      setPlaybackPosition,
      stopSources,
      createAndPlaySource,
      makeOnEnded,
    ],
  )

  const seekBackward = useCallback(() => {
    if (totalDurationMs <= 0) return
    const currentMs = getPlaybackPositionMs()
    const newMs = Math.max(0, currentMs - SEEK_SECONDS * 1000)
    seekToMs(newMs)
  }, [totalDurationMs, getPlaybackPositionMs, seekToMs])

  const seekForward = useCallback(() => {
    if (totalDurationMs <= 0) return
    const currentMs = getPlaybackPositionMs()
    const newMs = Math.min(totalDurationMs, currentMs + SEEK_SECONDS * 1000)
    seekToMs(newMs)
  }, [totalDurationMs, getPlaybackPositionMs, seekToMs])

  // --- 音量 ---
  useEffect(() => {
    const v = Math.max(0, Math.min(1, volume))
    if (instGainRef.current) instGainRef.current.gain.value = v
    if (vocalGainRef.current) vocalGainRef.current.gain.value = v
  }, [volume])

  // --- クリーンアップ（再生ソース・位置更新の停止） ---
  useEffect(() => {
    return () => {
      stopSources()
      stopPositionUpdater()
    }
  }, [stopSources, stopPositionUpdater])

  return {
    isLoaded: bufferLoadStatus === "loaded",
    bufferLoadStatus,
    bufferLoadError,
    startLoading,
    getPlaybackPositionMs,
    startPlayback,
    stopPlayback,
    resumePlayback,
    seekBackward,
    seekForward,
    seekToMs,
    toggleGuideVocal,
    seekSeconds: SEEK_SECONDS,
  }
}
