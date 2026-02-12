import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Container from "@mui/material/Container"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { CurrentLine } from "~/components/CurrentLine"
import { LyricsPanel } from "~/components/LyricsPanel"
import { PitchBar } from "~/components/PitchBar"
import { PlaybackControls } from "~/components/PlaybackControls"
import { PracticeLoadingScreen } from "~/components/PracticeLoadingScreen"
import {
  INST_AUDIO_URL,
  MIDI_OFFSET_MS,
  MIDI_URL,
  SONG_ID,
  VOCAL_AUDIO_URL,
} from "~/constants/songs/brand-new-music"
import lyricsJson from "~/constants/songs/brand-new-music/lyrics.json"
import { getLyricLines, parseLyricsToEntries } from "~/lib/lyrics"
import type { MelodyData } from "~/lib/melody"
import { parseMidiToMelodyData } from "~/lib/midi"
import { getLastSavedRecording } from "~/lib/storage"
import { usePlaybackPlayer } from "~/lib/usePlaybackPlayer"
import type { PitchEntry } from "~/stores/practice"

type LyricsJsonEntry = { time: number; lyric: string }

const Playback = () => {
  const [melodyData, setMelodyData] = useState<MelodyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recording, setRecording] = useState<{
    audioBlob: Blob
    pitchData: PitchEntry[]
    score: number
    totalDurationMs: number
    recordingOffsetMs: number
  } | null>(null)
  const [useGuideVocal, setUseGuideVocal] = useState(false)
  const [positionMs, setPositionMs] = useState(0)

  // データ読み込み
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [data, rec] = await Promise.all([
          parseMidiToMelodyData(MIDI_URL, SONG_ID),
          getLastSavedRecording(),
        ])
        if (cancelled) return
        if (!rec) {
          setRecording(null)
          setLoading(false)
          return
        }
        if (MIDI_OFFSET_MS) {
          for (const n of data.notes) {
            n.startMs += MIDI_OFFSET_MS
            n.endMs += MIDI_OFFSET_MS
          }
          if (data.barOffsetMs != null) {
            data.barOffsetMs += MIDI_OFFSET_MS
          }
        }
        const lyrics = parseLyricsToEntries(lyricsJson as LyricsJsonEntry[])
        setMelodyData({ ...data, lyrics })
        setRecording({
          audioBlob: rec.audioBlob,
          pitchData: rec.pitchData,
          score: rec.score,
          totalDurationMs: rec.totalDurationMs,
          recordingOffsetMs: rec.recordingOffsetMs ?? 0,
        })
      } catch (e) {
        if (!cancelled)
          setLoadError(
            e instanceof Error ? e.message : "読み込みに失敗しました",
          )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const player = usePlaybackPlayer({
    instUrl: INST_AUDIO_URL,
    vocalUrl: VOCAL_AUDIO_URL,
    recordingBlob: recording?.audioBlob ?? new Blob(),
    totalDurationMs: recording?.totalDurationMs ?? 0,
    useGuideVocal,
    recordingOffsetMs: recording?.recordingOffsetMs ?? 0,
  })

  // データ読み込み完了後に音声バッファロード開始
  const hasStartedLoading = useRef(false)
  useEffect(() => {
    if (!recording || hasStartedLoading.current) return
    hasStartedLoading.current = true
    player.startLoading()
  }, [recording, player])

  // 再生中の位置更新
  useEffect(() => {
    if (!player.isPlaying) return
    let rafId: number
    const tick = () => {
      setPositionMs(player.getPositionMs())
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [player])

  const handleToggleGuideVocal = useCallback(() => {
    setUseGuideVocal((v) => !v)
    player.toggleGuideVocal()
  }, [player])

  const handleLyricSeek = useCallback(
    (timeMs: number) => {
      player.seekToMs(timeMs)
      if (!player.isPlaying) setPositionMs(timeMs)
    },
    [player],
  )

  if (loading) {
    return <PracticeLoadingScreen message="読み込み中…" />
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

  if (!recording) {
    return (
      <Container maxWidth="md" sx={{ py: 3, textAlign: "center" }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          まだ録音がありません
        </Typography>
        <Button
          component={Link}
          to="/practice"
          variant="contained"
          sx={{ fontWeight: "bold" }}
        >
          練習する
        </Button>
      </Container>
    )
  }

  if (
    player.bufferLoadStatus === "idle" ||
    player.bufferLoadStatus === "loading"
  ) {
    return <PracticeLoadingScreen message="音声を読み込み中…" />
  }

  if (player.bufferLoadStatus === "error") {
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography color="error">
          音声の読み込みに失敗しました: {player.bufferLoadError}
        </Typography>
        <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
          <Button component={Link} to="/" sx={{ fontWeight: "bold" }}>
            ホームへ
          </Button>
        </Box>
      </Container>
    )
  }

  const totalDurationMs = recording.totalDurationMs
  const lyrics = melodyData?.lyrics ?? []
  const lyricLines = getLyricLines(lyrics, positionMs)

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Typography component="h1" variant="h6">
          再生画面
        </Typography>
        <Typography variant="h5" fontWeight="bold">
          {recording.score}%
        </Typography>
      </Box>

      <PlaybackControls
        isPlaying={player.isPlaying}
        hasPosition={positionMs > 0}
        onStart={player.playFromStart}
        onStop={player.pause}
        onResume={player.play}
        onToggleGuideVocal={handleToggleGuideVocal}
        useGuideVocal={useGuideVocal}
      />

      <Paper sx={{ p: 2, mb: 2, overflow: "hidden" }}>
        <Box
          sx={{
            position: "relative",
            overflow: "hidden",
            width: "100%",
            minWidth: 0,
          }}
        >
          <PitchBar
            notes={melodyData?.notes ?? []}
            pitchData={recording.pitchData}
            totalDurationMs={totalDurationMs}
            positionMs={positionMs}
            bpm={melodyData?.bpm}
            barOffsetMs={melodyData?.barOffsetMs}
            onViewDrag={!player.isPlaying ? setPositionMs : undefined}
          />
          <CurrentLine />
        </Box>
        <Box
          sx={{
            mt: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {(positionMs / 1000).toFixed(1)}s /{" "}
            {(totalDurationMs / 1000).toFixed(1)}s
          </Typography>
        </Box>
      </Paper>

      <LyricsPanel lyricLines={lyricLines} onSeek={handleLyricSeek} />

      <Box sx={{ mt: 2, display: "flex", justifyContent: "center", gap: 2 }}>
        <Button
          component={Link}
          to="/practice"
          variant="contained"
          sx={{ fontWeight: "bold" }}
        >
          練習画面に戻る
        </Button>
      </Box>
    </Container>
  )
}

export default Playback
