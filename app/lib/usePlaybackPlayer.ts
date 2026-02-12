import { useCallback, useEffect, useRef, useState } from "react"
import { loadAudioBuffer } from "~/lib/useAudioBufferLoader"

export interface UsePlaybackPlayerOptions {
  instUrl: string
  vocalUrl: string
  recordingBlob: Blob
  totalDurationMs: number
  useGuideVocal: boolean
  volume?: number
}

export interface UsePlaybackPlayerResult {
  bufferLoadStatus: "idle" | "loading" | "loaded" | "error"
  bufferLoadError: string | null
  startLoading: () => void
  isPlaying: boolean
  getPositionMs: () => number
  playFromStart: () => void
  play: () => void
  pause: () => void
  seekToMs: (ms: number) => void
  toggleGuideVocal: () => void
}

/**
 * 録音再生用フック。
 * inst/vocal + 録音 Blob を同時再生する（マイク・ピッチ検出なし）。
 */
export const usePlaybackPlayer = (
  options: UsePlaybackPlayerOptions,
): UsePlaybackPlayerResult => {
  const {
    instUrl,
    vocalUrl,
    recordingBlob,
    totalDurationMs,
    useGuideVocal,
    volume = 1.0,
  } = options

  const contextRef = useRef<AudioContext | null>(null)
  const instGainRef = useRef<GainNode | null>(null)
  const vocalGainRef = useRef<GainNode | null>(null)
  const recGainRef = useRef<GainNode | null>(null)

  const instBufferRef = useRef<AudioBuffer | null>(null)
  const vocalBufferRef = useRef<AudioBuffer | null>(null)
  const recBufferRef = useRef<AudioBuffer | null>(null)

  const [bufferLoadStatus, setBufferLoadStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle")
  const [bufferLoadError, setBufferLoadError] = useState<string | null>(null)
  const isLoadingRef = useRef(false)
  const loadingCancelledRef = useRef(false)

  const instSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const vocalSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const recSourceRef = useRef<AudioBufferSourceNode | null>(null)

  const startedAtRef = useRef(0)
  const offsetRef = useRef(0)
  const playingRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)

  // --- ロード ---
  const startLoading = useCallback(() => {
    if (isLoadingRef.current) return
    if (contextRef.current) {
      contextRef.current.close()
      contextRef.current = null
    }

    const ctx = new AudioContext({ sampleRate: 48000 })
    contextRef.current = ctx

    const ig = ctx.createGain()
    ig.connect(ctx.destination)
    instGainRef.current = ig

    const vg = ctx.createGain()
    vg.connect(ctx.destination)
    vocalGainRef.current = vg

    const rg = ctx.createGain()
    rg.connect(ctx.destination)
    recGainRef.current = rg

    isLoadingRef.current = true
    loadingCancelledRef.current = false
    setBufferLoadStatus("loading")
    setBufferLoadError(null)

    const decodeRecording = async (): Promise<AudioBuffer> => {
      const arrayBuffer = await recordingBlob.arrayBuffer()
      return ctx.decodeAudioData(arrayBuffer)
    }

    Promise.all([
      loadAudioBuffer(instUrl, ctx),
      loadAudioBuffer(vocalUrl, ctx),
      decodeRecording(),
    ])
      .then(([instBuf, vocalBuf, recBuf]) => {
        isLoadingRef.current = false
        if (loadingCancelledRef.current) return
        instBufferRef.current = instBuf
        vocalBufferRef.current = vocalBuf
        recBufferRef.current = recBuf
        setBufferLoadStatus("loaded")
      })
      .catch((err) => {
        isLoadingRef.current = false
        if (!loadingCancelledRef.current) {
          setBufferLoadError(err instanceof Error ? err.message : String(err))
          setBufferLoadStatus("error")
        }
        ctx.close()
        if (contextRef.current === ctx) contextRef.current = null
      })
  }, [instUrl, vocalUrl, recordingBlob])

  useEffect(() => {
    return () => {
      loadingCancelledRef.current = true
      if (contextRef.current) {
        contextRef.current.close()
        contextRef.current = null
      }
    }
  }, [])

  // --- ヘルパー ---
  const createAndPlay = useCallback(
    (buffer: AudioBuffer, gain: GainNode, offset: number) => {
      const ctx = contextRef.current
      if (!ctx) throw new Error("AudioContext not initialized")
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(gain)
      src.start(0, offset)
      return src
    },
    [],
  )

  const stopSources = useCallback(() => {
    for (const ref of [instSourceRef, vocalSourceRef, recSourceRef]) {
      try {
        ref.current?.stop()
      } catch {
        /* already stopped */
      }
      ref.current = null
    }
  }, [])

  const getPositionMs = useCallback((): number => {
    if (!contextRef.current) return 0
    if (!playingRef.current) return offsetRef.current * 1000
    const elapsed = contextRef.current.currentTime - startedAtRef.current
    return (offsetRef.current + elapsed) * 1000
  }, [])

  // --- 再生 ---
  const playInternal = useCallback(
    (offset: number) => {
      const ctx = contextRef.current
      const instBuf = instBufferRef.current
      const vocalBuf = vocalBufferRef.current
      const recBuf = recBufferRef.current
      const ig = instGainRef.current
      const vg = vocalGainRef.current
      const rg = recGainRef.current
      if (!ctx || !instBuf || !vocalBuf || !recBuf || !ig || !vg || !rg) return

      if (ctx.state === "suspended") ctx.resume()

      stopSources()
      startedAtRef.current = ctx.currentTime
      offsetRef.current = offset
      playingRef.current = true
      setIsPlaying(true)

      // 伴奏 or ガイドボーカル
      if (useGuideVocal) {
        const src = createAndPlay(vocalBuf, vg, offset)
        vocalSourceRef.current = src
        src.onended = () => {
          if (playingRef.current && vocalSourceRef.current === src) {
            playingRef.current = false
            setIsPlaying(false)
          }
        }
      } else {
        const src = createAndPlay(instBuf, ig, offset)
        instSourceRef.current = src
        src.onended = () => {
          if (playingRef.current && instSourceRef.current === src) {
            playingRef.current = false
            setIsPlaying(false)
          }
        }
      }

      // 録音
      const recSrc = createAndPlay(recBuf, rg, offset)
      recSourceRef.current = recSrc
    },
    [useGuideVocal, stopSources, createAndPlay],
  )

  const playFromStart = useCallback(() => {
    offsetRef.current = 0
    playInternal(0)
  }, [playInternal])

  const play = useCallback(() => {
    playInternal(offsetRef.current)
  }, [playInternal])

  const pause = useCallback(() => {
    if (playingRef.current && contextRef.current) {
      const elapsed = contextRef.current.currentTime - startedAtRef.current
      offsetRef.current = offsetRef.current + elapsed
    }
    playingRef.current = false
    setIsPlaying(false)
    stopSources()
  }, [stopSources])

  const seekToMs = useCallback(
    (ms: number) => {
      const sec = Math.max(0, Math.min(totalDurationMs / 1000, ms / 1000))
      const wasPlaying = playingRef.current
      stopSources()
      playingRef.current = false
      offsetRef.current = sec
      if (wasPlaying) {
        playInternal(sec)
      }
    },
    [totalDurationMs, stopSources, playInternal],
  )

  const toggleGuideVocal = useCallback(() => {
    // ガイド切替は呼び出し側で useGuideVocal を変更後に再レンダリングで反映される。
    // 再生中なら一旦停止→再開で切り替える。
    if (!playingRef.current) return
    const pos = getPositionMs() / 1000
    stopSources()
    playingRef.current = false
    offsetRef.current = pos
    // useGuideVocal は次の render で更新済みなので playInternal が正しい音源を使う
    // ただしこの時点ではまだ古い値なので、1 フレーム待つ
    requestAnimationFrame(() => {
      playInternal(pos)
    })
  }, [getPositionMs, stopSources, playInternal])

  // --- 音量 ---
  useEffect(() => {
    const v = Math.max(0, Math.min(1, volume))
    if (instGainRef.current) instGainRef.current.gain.value = v
    if (vocalGainRef.current) vocalGainRef.current.gain.value = v
    // 録音音量は常に1.0
  }, [volume])

  // --- クリーンアップ ---
  useEffect(() => {
    return () => {
      stopSources()
    }
  }, [stopSources])

  return {
    bufferLoadStatus,
    bufferLoadError,
    startLoading,
    isPlaying,
    getPositionMs,
    playFromStart,
    play,
    pause,
    seekToMs,
    toggleGuideVocal,
  }
}
