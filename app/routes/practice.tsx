import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Container from "@mui/material/Container"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import {
  PITCH_BAR_LINE,
  PITCH_C_LINE,
  PITCH_GRID_LINE,
  PITCH_NOTE,
  PITCH_POSITION_LINE,
} from "~/constants/colors"
import {
  INST_AUDIO_URL,
  MIDI_URL,
  SONG_ID,
  VOCAL_AUDIO_URL,
} from "~/constants/songs/brand-new-music"
import lyricsJson from "~/constants/songs/brand-new-music/lyrics.json"
import { parseLyricsToEntries } from "~/lib/lyrics"
import type { LyricEntry, MelodyNote } from "~/lib/melody"
import { parseMidiToMelodyData } from "~/lib/midi"
import {
  isPracticingAtom,
  melodyDataAtom,
  playbackPositionMsAtom,
  useGuideVocalAtom,
} from "~/stores/practice"

type LyricsJsonEntry = { time: number; lyric: string }

/** 再生位置に対応する歌詞の行インデックス（0-based） */
const getCurrentLyricIndex = (
  lyrics: LyricEntry[],
  positionMs: number,
): number => {
  if (!lyrics.length) return -1
  let index = 0
  for (let i = 0; i < lyrics.length; i++) {
    if (positionMs >= lyrics[i].timeMs) index = i
    else break
  }
  return index
}

/** 3行表示用：前・現在（歌っている行）・次のテキストと開始秒数 */
const getLyricLines = (
  lyrics: LyricEntry[],
  positionMs: number,
): {
  prev: { text: string; timeMs: number } | null
  current: { text: string; timeMs: number }
  next: { text: string; timeMs: number } | null
} => {
  const i = getCurrentLyricIndex(lyrics, positionMs)
  if (i < 0 || !lyrics.length)
    return { prev: null, current: { text: "", timeMs: 0 }, next: null }
  return {
    prev:
      i > 0 ? { text: lyrics[i - 1].text, timeMs: lyrics[i - 1].timeMs } : null,
    current: { text: lyrics[i].text, timeMs: lyrics[i].timeMs },
    next:
      i < lyrics.length - 1
        ? { text: lyrics[i + 1].text, timeMs: lyrics[i + 1].timeMs }
        : null,
  }
}

/** 音程バーに表示する小節数（UIで調整する想定） */
const PITCH_BAR_WINDOW_BARS = 1

const PitchBar = ({
  notes,
  totalDurationMs,
  positionMs,
  bpm,
  height = 120,
}: {
  notes: MelodyNote[]
  totalDurationMs: number
  positionMs: number
  bpm?: number
  height?: number
}) => {
  const msPerBar = bpm ? (60 * 1000 * 4) / bpm : 2000

  if (!totalDurationMs || !notes.length) {
    return (
      <Box
        sx={{ height, bgcolor: "grey.100", borderRadius: 1 }}
        role="img"
        aria-label="音程バー（データなし）"
      />
    )
  }

  const windowDurationMs = PITCH_BAR_WINDOW_BARS * msPerBar
  const POSITION_RATIO = 1 / 4
  const windowStartMs = Math.max(
    0,
    Math.min(
      positionMs - windowDurationMs * POSITION_RATIO,
      totalDurationMs - windowDurationMs,
    ),
  )
  const windowEndMs = Math.min(
    totalDurationMs,
    windowStartMs + windowDurationMs,
  )
  const actualWindowMs = windowEndMs - windowStartMs

  const visibleNotes = notes.filter(
    (n) => n.endMs > windowStartMs && n.startMs < windowEndMs,
  )
  // 譜面イメージ：1半音＝固定ピクセル。五線は適度な太さで、音程バーはあるべき場所に
  const minPitch = Math.min(...notes.map((n) => n.pitch))
  const maxPitch = Math.max(...notes.map((n) => n.pitch))
  const MAX_OCTAVES = 4
  const OCTAVE_MARGIN_ABOVE = 2
  const maxDisplaySemitones = MAX_OCTAVES * 12
  const melodySpan = maxPitch - minPitch + 1
  const centerPitch = (minPitch + maxPitch) / 2
  let minPitchDisplay: number
  let maxPitchDisplay: number
  if (melodySpan > maxDisplaySemitones) {
    minPitchDisplay = Math.round(centerPitch) - maxDisplaySemitones / 2
    maxPitchDisplay = minPitchDisplay + maxDisplaySemitones - 1
  } else {
    const pad = Math.floor((maxDisplaySemitones - melodySpan) / 2)
    minPitchDisplay = minPitch - pad
    maxPitchDisplay = maxPitch + (maxDisplaySemitones - melodySpan - pad)
  }
  maxPitchDisplay += OCTAVE_MARGIN_ABOVE * 12
  maxPitchDisplay -= 12
  minPitchDisplay += 24
  const pitchRange = maxPitchDisplay - minPitchDisplay + 1
  const PIXELS_PER_SEMITONE = 20
  const padding = 8
  const w = 1000
  const drawHeight = pitchRange * PIXELS_PER_SEMITONE
  const totalHeight = drawHeight + 2 * padding
  const scaleX = (ms: number) =>
    actualWindowMs > 0 ? ((ms - windowStartMs) / actualWindowMs) * w : 0
  const scaleY = (pitch: number) =>
    totalHeight - padding - (pitch - minPitchDisplay) * PIXELS_PER_SEMITONE

  // 1半音1本。音程バーは必ず線と重なる（scaleY と同一スケール）
  const linePitches = Array.from(
    { length: pitchRange },
    (_, i) => minPitchDisplay + i,
  )
  const lines = linePitches.map((pitch) => ({ y: scaleY(pitch), pitch }))

  const positionX = scaleX(positionMs)

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <svg
        width={w}
        height={totalHeight}
        style={{
          display: "block",
          maxWidth: "100%",
          height: "auto",
          overflow: "hidden",
        }}
        viewBox={`0 0 ${w} ${totalHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>音程バー（五線譜風）</title>
        {/* 五線譜風の横線 */}
        {lines.map((l, i) => (
          <line
            key={`line-${l.pitch}-${i}`}
            x1={0}
            x2={w}
            y1={l.y}
            y2={l.y}
            stroke={l.pitch % 12 === 0 ? PITCH_C_LINE : PITCH_GRID_LINE}
            strokeWidth={l.pitch % 12 === 0 ? 1.5 : 1}
          />
        ))}
        {/* 小節ごとの縦線（薄い色） */}
        {(() => {
          const firstBar = Math.ceil(windowStartMs / msPerBar)
          const lastBar = Math.floor(windowEndMs / msPerBar)
          const bars: number[] = []
          for (let i = firstBar; i <= lastBar; i++) {
            bars.push(i * msPerBar)
          }
          return bars.map((barMs) => {
            const x = scaleX(barMs)
            if (x < 0 || x > w) return null
            return (
              <line
                key={`bar-${barMs}`}
                x1={x}
                x2={x}
                y1={padding}
                y2={totalHeight - padding}
                stroke={PITCH_BAR_LINE}
                strokeWidth={1}
                opacity={1}
              />
            )
          })
        })()}
        {/* 曲のノート（バー） */}
        {visibleNotes.map((n, i) => (
          <rect
            key={`note-${n.startMs}-${n.pitch}-${i}`}
            x={scaleX(n.startMs)}
            y={scaleY(n.pitch) - 6}
            width={Math.max(2, scaleX(n.endMs) - scaleX(n.startMs))}
            height={12}
            fill={PITCH_NOTE}
            rx={4}
            ry={4}
          />
        ))}
        {/* 現在位置の縦線 */}
        <line
          x1={positionX}
          x2={positionX}
          y1={0}
          y2={totalHeight}
          stroke={PITCH_POSITION_LINE}
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      </svg>
    </Box>
  )
}

const Practice = () => {
  const setMelodyData = useSetAtom(melodyDataAtom)
  const setPlaybackPosition = useSetAtom(playbackPositionMsAtom)
  const setIsPracticing = useSetAtom(isPracticingAtom)
  const useGuideVocal = useAtomValue(useGuideVocalAtom)
  const setUseGuideVocal = useSetAtom(useGuideVocalAtom)
  const melodyData = useAtomValue(melodyDataAtom)
  const positionMs = useAtomValue(playbackPositionMsAtom)
  const isPracticing = useAtomValue(isPracticingAtom)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const instRef = useRef<HTMLAudioElement>(null)
  const vocalRef = useRef<HTMLAudioElement>(null)
  const positionRafRef = useRef<number | null>(null)

  // 曲データ・歌詞の読み込み（2-4: Jotai で保持）
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

  const startPlayback = useCallback(() => {
    const inst = instRef.current
    const vocal = vocalRef.current
    if (!inst || !vocal || !melodyData) return
    inst.currentTime = 0
    vocal.currentTime = 0
    setPlaybackPosition(0)
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

  const stopPlayback = useCallback(() => {
    instRef.current?.pause()
    vocalRef.current?.pause()
    if (positionRafRef.current != null) {
      cancelAnimationFrame(positionRafRef.current)
      positionRafRef.current = null
    }
    setIsPracticing(false)
  }, [setIsPracticing])

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
  const seekSeconds = 10

  const seekBackward = useCallback(() => {
    const inst = instRef.current
    const vocal = vocalRef.current
    if (!inst || !vocal || totalDurationMs <= 0) return
    const currentSec = positionMs / 1000
    const newSec = Math.max(0, currentSec - seekSeconds)
    inst.currentTime = newSec
    vocal.currentTime = newSec
    setPlaybackPosition(newSec * 1000)
  }, [positionMs, totalDurationMs, setPlaybackPosition])

  const seekForward = useCallback(() => {
    const inst = instRef.current
    const vocal = vocalRef.current
    if (!inst || !vocal || totalDurationMs <= 0) return
    const currentSec = positionMs / 1000
    const newSec = Math.min(totalDurationMs / 1000, currentSec + seekSeconds)
    inst.currentTime = newSec
    vocal.currentTime = newSec
    setPlaybackPosition(newSec * 1000)
  }, [positionMs, totalDurationMs, setPlaybackPosition])

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

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography component="h1" variant="h6" gutterBottom>
        練習画面
      </Typography>

      <audio ref={instRef} src={INST_AUDIO_URL} aria-label="伴奏（オケ）">
        <track kind="captions" />
      </audio>
      <audio ref={vocalRef} src={VOCAL_AUDIO_URL} aria-label="ガイド(歌あり)">
        <track kind="captions" />
      </audio>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Button
          variant="contained"
          onClick={startPlayback}
          disabled={!melodyData || isPracticing}
          sx={{ fontWeight: "bold" }}
        >
          開始
        </Button>
        <Button
          variant="outlined"
          onClick={stopPlayback}
          disabled={!isPracticing}
          sx={{ fontWeight: "bold" }}
        >
          停止
        </Button>
        <Button
          variant="contained"
          onClick={resumePlayback}
          disabled={!melodyData || isPracticing || positionMs <= 0}
          sx={{ fontWeight: "bold" }}
        >
          再開
        </Button>
        <Button
          variant={useGuideVocal ? "contained" : "outlined"}
          color={useGuideVocal ? "secondary" : "primary"}
          onClick={toggleGuideVocal}
          sx={{ fontWeight: "bold" }}
        >
          ガイド {useGuideVocal ? "ON" : "OFF"}
        </Button>
        <Button
          variant="outlined"
          onClick={seekBackward}
          disabled={!melodyData || totalDurationMs <= 0}
          sx={{ fontWeight: "bold" }}
        >
          {seekSeconds}秒戻す
        </Button>
        <Button
          variant="outlined"
          onClick={seekForward}
          disabled={!melodyData || totalDurationMs <= 0}
          sx={{ fontWeight: "bold" }}
        >
          {seekSeconds}秒送る
        </Button>
      </Box>

      {/* 音程バー（五線譜風）・時間軸・現在位置縦線 */}
      <Paper sx={{ p: 2, mb: 2, overflow: "hidden" }}>
        <Box sx={{ overflow: "hidden", width: "100%", minWidth: 0 }}>
          <PitchBar
            notes={melodyData?.notes ?? []}
            totalDurationMs={melodyData?.totalDurationMs ?? 0}
            positionMs={positionMs}
            bpm={melodyData?.bpm}
          />
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1, display: "block", textAlign: "right" }}
        >
          {(positionMs / 1000).toFixed(1)}s /{" "}
          {(totalDurationMs / 1000).toFixed(1)}s
        </Typography>
      </Paper>

      {/* 歌詞（再生位置に同期・3行表示・中央が歌っている行で太字） */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          歌詞
        </Typography>
        <Box
          sx={{
            minHeight: 96,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              minHeight: 32,
              cursor: lyricLines.prev ? "pointer" : "default",
            }}
            onClick={() => lyricLines.prev && seekToMs(lyricLines.prev.timeMs)}
          >
            {lyricLines.prev?.text || "—"}
          </Typography>
          <Typography
            variant="body1"
            fontWeight="bold"
            sx={{ minHeight: 32, cursor: "pointer" }}
            onClick={() => seekToMs(lyricLines.current.timeMs)}
          >
            {lyricLines.current.text || "—"}
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              minHeight: 32,
              cursor: lyricLines.next ? "pointer" : "default",
            }}
            onClick={() => lyricLines.next && seekToMs(lyricLines.next.timeMs)}
          >
            {lyricLines.next?.text || "—"}
          </Typography>
        </Box>
      </Paper>

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
