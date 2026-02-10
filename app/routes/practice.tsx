import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import Container from "@mui/material/Container"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { LyricsPanel } from "~/components/LyricsPanel"
import { MicDelaySettings } from "~/components/MicDelaySettings"
import { PitchBar } from "~/components/PitchBar"
import { PracticeControls } from "~/components/PracticeControls"
import {
  INST_AUDIO_URL,
  MIDI_URL,
  SONG_ID,
  VOCAL_AUDIO_URL,
} from "~/constants/songs/brand-new-music"
import lyricsJson from "~/constants/songs/brand-new-music/lyrics.json"
import { getLyricLines, parseLyricsToEntries } from "~/lib/lyrics"
import { parseMidiToMelodyData } from "~/lib/midi"
import { usePitchDetection } from "~/lib/usePitchDetection"
import { usePracticePlayback } from "~/lib/usePracticePlayback"
import {
  isPracticingAtom,
  melodyDataAtom,
  micDelayMsAtom,
  type PitchEntry,
  pitchDataAtom,
  playbackPositionMsAtom,
  recordingModeAtom,
  useGuideVocalAtom,
  volumeAtom,
} from "~/stores/practice"

type LyricsJsonEntry = { time: number; lyric: string }

const Practice = () => {
  const setMelodyData = useSetAtom(melodyDataAtom)
  const setPlaybackPosition = useSetAtom(playbackPositionMsAtom)
  const setPitchData = useSetAtom(pitchDataAtom)
  const setIsPracticing = useSetAtom(isPracticingAtom)
  const useGuideVocal = useAtomValue(useGuideVocalAtom)
  const setUseGuideVocal = useSetAtom(useGuideVocalAtom)
  const recordingMode = useAtomValue(recordingModeAtom)
  const setRecordingMode = useSetAtom(recordingModeAtom)
  const volume = useAtomValue(volumeAtom)
  const setVolume = useSetAtom(volumeAtom)
  const melodyData = useAtomValue(melodyDataAtom)
  const pitchData = useAtomValue(pitchDataAtom)
  const positionMs = useAtomValue(playbackPositionMsAtom)
  const isPracticing = useAtomValue(isPracticingAtom)
  const micDelayMs = useAtomValue(micDelayMsAtom)

  const pitchBufferRef = useRef<PitchEntry[]>([])
  const flushScheduledRef = useRef(false)
  // playback.getPlaybackPositionMs を ref 経由で pitchDetection に渡す
  const getPlaybackPositionMsRef = useRef<() => number>(() => 0)

  const pitchDetection = usePitchDetection({
    onPitch: useCallback(
      (midi: number, timeMs: number) => {
        pitchBufferRef.current.push({
          timeMs: timeMs - micDelayMs,
          midi,
        })
        if (!flushScheduledRef.current) {
          flushScheduledRef.current = true
          requestAnimationFrame(() => {
            const batch = pitchBufferRef.current
            pitchBufferRef.current = []
            flushScheduledRef.current = false
            setPitchData((prev) => [...prev, ...batch])
          })
        }
      },
      [setPitchData, micDelayMs],
    ),
    getPlaybackPositionMs: () => getPlaybackPositionMsRef.current(),
    onError: useCallback((err: Error) => {
      alert(`マイクの使用を許可してください。\n${err.message}`)
    }, []),
  })

  const playback = usePracticePlayback({
    melodyData,
    useGuideVocal,
    setUseGuideVocal,
    setPlaybackPosition,
    setPitchData,
    setIsPracticing,
    pitchDetection,
    volume,
    instUrl: INST_AUDIO_URL,
    vocalUrl: VOCAL_AUDIO_URL,
  })

  // playback 初期化後に ref を更新
  useEffect(() => {
    getPlaybackPositionMsRef.current = playback.getPlaybackPositionMs
  }, [playback])

  // 音声バッファの自動ロード（1 回だけ）
  const hasAutoLoadScheduledRef = useRef(false)
  useEffect(() => {
    if (hasAutoLoadScheduledRef.current) return
    hasAutoLoadScheduledRef.current = true
    const t = setTimeout(() => {
      playback.startLoading()
    }, 0)
    return () => clearTimeout(t)
  }, [playback])

  // 練習ページを開いたタイミングでマイク許可を取得（開始ボタン押下時にダイアログが出ないようにする）
  const { requestPermission } = pitchDetection
  useEffect(() => {
    requestPermission()
  }, [requestPermission])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewPositionMs, setViewPositionMs] = useState(0)
  const [smoothPositionMs, setSmoothPositionMs] = useState(0)
  const [isStartingPlayback, setIsStartingPlayback] = useState(false)

  useEffect(() => {
    if (!isPracticing) setViewPositionMs(positionMs)
  }, [isPracticing, positionMs])

  // 再生中は requestAnimationFrame で位置を毎フレーム更新し、PitchBar の位置線をスムーズに動かす
  useEffect(() => {
    if (!isPracticing) return
    let rafId: number
    const tick = () => {
      setSmoothPositionMs(playback.getPlaybackPositionMs())
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPracticing, playback])

  // キーボードの音量キー（VolumeUp/VolumeDown/VolumeMute）でアプリ音量とUIスライダーを連動
  useEffect(() => {
    const STEP = 0.05
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "VolumeUp") {
        e.preventDefault()
        setVolume((v) => Math.min(1, v + STEP))
      } else if (e.code === "VolumeDown") {
        e.preventDefault()
        setVolume((v) => Math.max(0, v - STEP))
      } else if (e.code === "VolumeMute") {
        e.preventDefault()
        setVolume((v) => (v > 0 ? 0 : 1))
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [setVolume])

  const totalDurationMs = melodyData?.totalDurationMs ?? 0
  const handleLyricSeek = useCallback(
    (timeMs: number) => {
      playback.seekToMs(timeMs)
      if (!isPracticing) setViewPositionMs(timeMs)
    },
    [playback, isPracticing],
  )

  const handleSeekBackward = useCallback(() => {
    playback.seekBackward()
    if (!isPracticing) {
      setViewPositionMs(playback.getPlaybackPositionMs())
    }
  }, [playback, isPracticing])

  const handleSeekForward = useCallback(() => {
    playback.seekForward()
    if (!isPracticing) {
      setViewPositionMs(playback.getPlaybackPositionMs())
    }
  }, [playback, isPracticing])

  const handleStart = async () => {
    setIsStartingPlayback(true)
    try {
      await playback.startPlayback()
    } finally {
      setIsStartingPlayback(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const data = await parseMidiToMelodyData(MIDI_URL, SONG_ID)
        const lyrics = parseLyricsToEntries(lyricsJson as LyricsJsonEntry[])
        if (cancelled) return
        setMelodyData({ ...data, lyrics })
      } catch (e) {
        if (!cancelled)
          setLoadError(
            e instanceof Error ? e.message : "曲の読み込みに失敗しました",
          )
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setMelodyData])

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography>曲を読み込み中…</Typography>
      </Container>
    )
  }

  if (playback.bufferLoadStatus === "idle" || playback.bufferLoadStatus === "loading") {
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography>曲を読み込み中…</Typography>
      </Container>
    )
  }

  if (playback.bufferLoadStatus === "error" && playback.bufferLoadError) {
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography color="error">
          音声の読み込みに失敗しました: {playback.bufferLoadError}
        </Typography>
        <Box sx={{ mt: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <Button
            variant="contained"
            onClick={() => playback.startLoading()}
            sx={{ fontWeight: "bold" }}
          >
            再試行
          </Button>
          <Button component={Link} to="/" sx={{ fontWeight: "bold" }}>
            ホームへ
          </Button>
        </Box>
      </Container>
    )
  }

  if (loadError) {
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography color="error">{loadError}</Typography>
        <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
          <Button component={Link} to="/" sx={{ fontWeight: "bold" }}>
            ホームへ
          </Button>
        </Box>
      </Container>
    )
  }

  const lyrics = melodyData?.lyrics ?? []
  const lyricLines = getLyricLines(lyrics, positionMs)

  return (
    <Container maxWidth="md" sx={{ py: 3, position: "relative" }}>
      {/* 開始ボタン押下〜ピッチ検出完了まで最前面にローディング表示 */}
      {isStartingPlayback && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-busy
          aria-live="polite"
        >
          <CircularProgress size={48} />
        </Box>
      )}

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Typography component="h1" variant="h6">
          練習画面
        </Typography>
        {/* マイク遅延の設定 */}
        <MicDelaySettings />
      </Box>

      {/* 練習画面のコントロールボタン群 */}
      <PracticeControls
        onStart={handleStart}
        onStop={playback.stopPlayback}
        onResume={playback.resumePlayback}
        onToggleGuideVocal={playback.toggleGuideVocal}
        onSeekBackward={handleSeekBackward}
        onSeekForward={handleSeekForward}
        useGuideVocal={useGuideVocal}
        seekSeconds={playback.seekSeconds}
        volume={volume}
        onVolumeChange={(_, value) =>
          setVolume(Array.isArray(value) ? value[0] : value)
        }
        recordingMode={recordingMode}
        onRecordingModeChange={setRecordingMode}
        disabled={{
          hasMelodyData: !!melodyData,
          isPracticing,
          positionMs,
          totalDurationMs,
        }}
      />

      <Paper sx={{ p: 2, mb: 2, overflow: "hidden" }}>
        <Box sx={{ overflow: "hidden", width: "100%", minWidth: 0 }}>
          {/* 五線譜風の音程バーコンポーネント */}
          <PitchBar
            notes={melodyData?.notes ?? []}
            pitchData={pitchData}
            totalDurationMs={totalDurationMs}
            positionMs={isPracticing ? smoothPositionMs : viewPositionMs}
            bpm={melodyData?.bpm}
            barOffsetMs={melodyData?.barOffsetMs}
            onViewDrag={!isPracticing ? setViewPositionMs : undefined}
          />
        </Box>
        <Box
          sx={{
            mt: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          {(melodyData?.bpm != null || melodyData?.key != null) && (
            <Typography variant="caption" color="text.secondary">
              {[
                melodyData?.bpm != null && `BPM ${Math.floor(melodyData.bpm)}`,
                melodyData?.key != null && `調 ${melodyData.key}`,
              ]
                .filter(Boolean)
                .join(" ・ ")}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {(
              (isPracticing ? smoothPositionMs : viewPositionMs) / 1000
            ).toFixed(1)}
            s / {(totalDurationMs / 1000).toFixed(1)}s
          </Typography>
        </Box>
      </Paper>

      <LyricsPanel lyricLines={lyricLines} onSeek={handleLyricSeek} />

      <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
        <Button
          component={Link}
          to="/"
          variant="text"
          sx={{ fontWeight: "bold" }}
        >
          ← ホームへ
        </Button>
      </Box>
    </Container>
  )
}

export default Practice
