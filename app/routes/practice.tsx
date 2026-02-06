import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Container from "@mui/material/Container"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { LyricsPanel } from "~/components/LyricsPanel"
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
  pitchDataAtom,
  playbackPositionMsAtom,
  useGuideVocalAtom,
} from "~/stores/practice"

type LyricsJsonEntry = { time: number; lyric: string }

const Practice = () => {
  const setMelodyData = useSetAtom(melodyDataAtom)
  const setPlaybackPosition = useSetAtom(playbackPositionMsAtom)
  const setPitchData = useSetAtom(pitchDataAtom)
  const setIsPracticing = useSetAtom(isPracticingAtom)
  const useGuideVocal = useAtomValue(useGuideVocalAtom)
  const setUseGuideVocal = useSetAtom(useGuideVocalAtom)
  const melodyData = useAtomValue(melodyDataAtom)
  const pitchData = useAtomValue(pitchDataAtom)
  const positionMs = useAtomValue(playbackPositionMsAtom)
  const isPracticing = useAtomValue(isPracticingAtom)

  const pitchDetection = usePitchDetection({
    onPitch: useCallback(
      (midi) => setPitchData((prev) => [...prev, midi]),
      [setPitchData],
    ),
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
  })

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewPositionMs, setViewPositionMs] = useState(0)

  useEffect(() => {
    if (!isPracticing) setViewPositionMs(positionMs)
  }, [isPracticing, positionMs])

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
  const totalDurationMs = melodyData?.totalDurationMs ?? 0

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography component="h1" variant="h6" gutterBottom>
        練習画面
      </Typography>

      <audio
        ref={playback.instRef}
        src={INST_AUDIO_URL}
        aria-label="伴奏（オケ）"
      >
        <track kind="captions" />
      </audio>
      <audio
        ref={playback.vocalRef}
        src={VOCAL_AUDIO_URL}
        aria-label="ガイド(歌あり)"
      >
        <track kind="captions" />
      </audio>

      {/* 練習画面のコントロールボタン群 */}
      <PracticeControls
        onStart={playback.startPlayback}
        onStop={playback.stopPlayback}
        onResume={playback.resumePlayback}
        onToggleGuideVocal={playback.toggleGuideVocal}
        onSeekBackward={playback.seekBackward}
        onSeekForward={playback.seekForward}
        useGuideVocal={useGuideVocal}
        seekSeconds={playback.seekSeconds}
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
            positionMs={isPracticing ? positionMs : viewPositionMs}
            bpm={melodyData?.bpm}
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
            {((isPracticing ? positionMs : viewPositionMs) / 1000).toFixed(1)}s
            / {(totalDurationMs / 1000).toFixed(1)}s
          </Typography>
        </Box>
      </Paper>

      <LyricsPanel lyricLines={lyricLines} onSeek={playback.seekToMs} />

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
