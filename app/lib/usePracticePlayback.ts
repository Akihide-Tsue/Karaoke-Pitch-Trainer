import type { MelodyData } from "~/lib/melody"
import type { UsePitchDetectionResult } from "~/lib/usePitchDetection"
import { useCallback, useEffect, useRef } from "react"

const SEEK_SECONDS = 10

/**
 * usePracticePlayback のオプション
 */
export interface UsePracticePlaybackOptions {
  melodyData: MelodyData | null
  useGuideVocal: boolean
  setUseGuideVocal: (fn: (v: boolean) => boolean) => void
  setPlaybackPosition: (ms: number) => void
  setPitchData: React.Dispatch<React.SetStateAction<number[]>>
  setIsPracticing: (v: boolean) => void
  pitchDetection: UsePitchDetectionResult
}

/**
 * usePracticePlayback の戻り値
 */
export interface UsePracticePlaybackResult {
  instRef: React.RefObject<HTMLAudioElement | null>
  vocalRef: React.RefObject<HTMLAudioElement | null>
  startPlayback: () => Promise<void>
  stopPlayback: () => Promise<void>
  resumePlayback: () => void
  seekBackward: () => void
  seekForward: () => void
  seekToMs: (timeMs: number) => void
  toggleGuideVocal: () => void
  seekSeconds: number
}

/**
 * 練習画面の再生・録音・ピッチ検出を統合して管理するフック。
 * 伴奏／ガイドボーカルの再生、開始・停止・再開、シーク、ガイド切替を提供する。
 * requestAnimationFrame で再生位置を更新し、ended 時に自動で停止する。
 *
 * @param options - 曲データ・状態セッター・ピッチ検出インスタンスなど
 * @returns instRef, vocalRef と再生コントロール用の関数群
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
  } = options

  const instRef = useRef<HTMLAudioElement | null>(null)
  const vocalRef = useRef<HTMLAudioElement | null>(null)
  const positionRafRef = useRef<number | null>(null)

  const startPlayback = useCallback(async () => {
    const inst = instRef.current
    const vocal = vocalRef.current
    if (!inst || !vocal || !melodyData) return
    inst.currentTime = 0
    vocal.currentTime = 0
    setPlaybackPosition(0)
    setPitchData([])
    setIsPracticing(true)
    await pitchDetection.start()
    if (useGuideVocal) {
      vocal.play().catch(() => {})
    } else {
      inst.play().catch(() => {})
    }
    const tick = () => {
      const v = vocalRef.current
      const i = instRef.current
      const active = v && !v.paused ? v : i
      if (active && !active.paused) {
        setPlaybackPosition(active.currentTime * 1000)
      }
      positionRafRef.current = requestAnimationFrame(tick)
    }
    positionRafRef.current = requestAnimationFrame(tick)
  }, [
    melodyData,
    useGuideVocal,
    setPlaybackPosition,
    setPitchData,
    setIsPracticing,
    pitchDetection,
  ])

  const stopPlayback = useCallback(async () => {
    instRef.current?.pause()
    vocalRef.current?.pause()
    await pitchDetection.stop()
    if (positionRafRef.current != null) {
      cancelAnimationFrame(positionRafRef.current)
      positionRafRef.current = null
    }
    setIsPracticing(false)
  }, [pitchDetection, setIsPracticing])

  const resumePlayback = useCallback(() => {
    const inst = instRef.current
    const vocal = vocalRef.current
    if (!inst || !vocal || !melodyData) return
    setIsPracticing(true)
    if (useGuideVocal) {
      vocal.play().catch(() => {})
    } else {
      inst.play().catch(() => {})
    }
    const tick = () => {
      const v = vocalRef.current
      const i = instRef.current
      const active = v && !v.paused ? v : i
      if (active && !active.paused) {
        setPlaybackPosition(active.currentTime * 1000)
      }
      positionRafRef.current = requestAnimationFrame(tick)
    }
    positionRafRef.current = requestAnimationFrame(tick)
  }, [melodyData, useGuideVocal, setPlaybackPosition, setIsPracticing])

  const toggleGuideVocal = useCallback(() => {
    const inst = instRef.current
    const vocal = vocalRef.current
    if (!inst || !vocal) return
    const wasPlaying = !vocal.paused || !inst.paused
    const currentTime = vocal.paused ? inst.currentTime : vocal.currentTime
    vocal.pause()
    inst.pause()
    vocal.currentTime = currentTime
    inst.currentTime = currentTime
    setPlaybackPosition(currentTime * 1000)
    setUseGuideVocal((v) => !v)
    if (wasPlaying) {
      const next = !useGuideVocal
      if (next) vocal.play().catch(() => {})
      else inst.play().catch(() => {})
    }
  }, [useGuideVocal, setPlaybackPosition, setUseGuideVocal])

  const totalDurationMs = melodyData?.totalDurationMs ?? 0

  const seekBackward = useCallback(() => {
    const inst = instRef.current
    const vocal = vocalRef.current
    if (!inst || !vocal || totalDurationMs <= 0) return
    const currentSec = inst.currentTime
    const newSec = Math.max(0, currentSec - SEEK_SECONDS)
    inst.currentTime = newSec
    vocal.currentTime = newSec
    setPlaybackPosition(newSec * 1000)
  }, [totalDurationMs, setPlaybackPosition])

  const seekForward = useCallback(() => {
    const inst = instRef.current
    const vocal = vocalRef.current
    if (!inst || !vocal || totalDurationMs <= 0) return
    const currentSec = inst.currentTime
    const newSec = Math.min(totalDurationMs / 1000, currentSec + SEEK_SECONDS)
    inst.currentTime = newSec
    vocal.currentTime = newSec
    setPlaybackPosition(newSec * 1000)
  }, [totalDurationMs, setPlaybackPosition])

  const seekToMs = useCallback(
    (timeMs: number) => {
      const inst = instRef.current
      const vocal = vocalRef.current
      if (!inst || !vocal || totalDurationMs <= 0) return
      const sec = Math.max(0, Math.min(totalDurationMs / 1000, timeMs / 1000))
      inst.currentTime = sec
      vocal.currentTime = sec
      setPlaybackPosition(sec * 1000)
    },
    [totalDurationMs, setPlaybackPosition],
  )

  useEffect(() => {
    const inst = instRef.current
    const vocal = vocalRef.current
    if (!inst || !vocal) return
    const onEnded = () => {
      stopPlayback()
    }
    inst.addEventListener("ended", onEnded)
    vocal.addEventListener("ended", onEnded)
    return () => {
      inst.removeEventListener("ended", onEnded)
      vocal.removeEventListener("ended", onEnded)
    }
  }, [stopPlayback])

  useEffect(() => {
    return () => {
      if (positionRafRef.current != null) {
        cancelAnimationFrame(positionRafRef.current)
        positionRafRef.current = null
      }
    }
  }, [])

  return {
    instRef,
    vocalRef,
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
