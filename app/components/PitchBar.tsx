import Box from "@mui/material/Box"
import type { ReactElement } from "react"
import { useCallback, useRef } from "react"
import {
  PITCH_BAR_LINE,
  PITCH_C_LINE,
  PITCH_GRID_LINE,
  PITCH_NOTE,
  PITCH_NOTE_MATCH,
  PITCH_NOTE_MISMATCH,
  PITCH_POSITION_LINE,
} from "~/constants/colors"
import { getTargetPitchAtTime, type MelodyNote } from "~/lib/melody"
import { PITCH_INTERVAL_MS } from "~/lib/usePitchDetection"

/** 音程バーに表示する小節数（UIで調整する想定） */
const PITCH_BAR_WINDOW_BARS = 1

/**
 * 五線譜風の音程バーコンポーネント。
 * 曲のメロディ（正解ノート）、歌唱ピッチ（50ms 刻み）、現在位置を表示する。
 * 歌唱が正解と ±1 半音以内なら緑、それ以外はグレーで色分けする。
 *
 * @param notes - 曲のメロディノート配列
 * @param pitchData - 歌唱ピッチ（PITCH_INTERVAL_MS 刻みの MIDI ノート番号配列）
 * @param totalDurationMs - 曲の総再生時間（ミリ秒）
 * @param positionMs - 現在の再生位置（ミリ秒）
 * @param bpm - テンポ（小節線描画用）。省略時は 2000ms/小節
 * @param height - データなし時の高さ（px）
 * @param onViewDrag - ドラッグでビューをパンしたときに呼ばれる。再生は変わらない。
 */
export const PitchBar = ({
  notes,
  pitchData,
  totalDurationMs,
  positionMs,
  bpm,
  height = 120,
  onViewDrag,
}: {
  notes: MelodyNote[]
  pitchData: number[]
  totalDurationMs: number
  positionMs: number
  bpm?: number
  height?: number
  onViewDrag?: (timeMs: number) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startMs: number } | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onViewDrag) return
      dragRef.current = { startX: e.clientX, startMs: positionMs }
      ;(e.target as Element).setPointerCapture(e.pointerId)
    },
    [onViewDrag, positionMs],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag || !onViewDrag || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const deltaX = e.clientX - drag.startX
      const msPerPx =
        (PITCH_BAR_WINDOW_BARS * (bpm ? (60 * 1000 * 4) / bpm : 2000)) /
        rect.width
      const deltaMs = deltaX * msPerPx
      const newMs = Math.max(
        0,
        Math.min(totalDurationMs, drag.startMs - deltaMs),
      )
      onViewDrag(newMs)
    },
    [onViewDrag, totalDurationMs, bpm],
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

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
  // 赤い縦線の位置を調整するための比率
  const POSITION_RATIO = 1 / 3
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

  const linePitches = Array.from(
    { length: pitchRange },
    (_, i) => minPitchDisplay + i,
  )
  const lines = linePitches.map((pitch) => ({ y: scaleY(pitch), pitch }))

  const positionX = scaleX(positionMs)

  const firstBar = Math.ceil(windowStartMs / msPerBar)
  const lastBar = Math.floor(windowEndMs / msPerBar)
  const barPositions: number[] = []
  for (let i = firstBar; i <= lastBar; i++) {
    barPositions.push(i * msPerBar)
  }

  const firstI = Math.ceil(windowStartMs / PITCH_INTERVAL_MS)
  const lastI = Math.min(
    Math.floor(windowEndMs / PITCH_INTERVAL_MS),
    pitchData.length - 1,
  )
  const singingBars: ReactElement[] = []
  for (let i = firstI; i <= lastI; i++) {
    const midi = pitchData[i]
    if (midi <= 0 || midi < minPitchDisplay || midi > maxPitchDisplay) continue
    const timeMs = i * PITCH_INTERVAL_MS
    const x = scaleX(timeMs)
    const target = getTargetPitchAtTime(notes, timeMs)
    const match = target != null && Math.abs(midi - target) <= 1
    const fill = match ? PITCH_NOTE_MATCH : PITCH_NOTE_MISMATCH
    const barW = Math.max(2, scaleX(timeMs + PITCH_INTERVAL_MS) - x)
    if (x + barW < 0 || x > w) continue
    singingBars.push(
      <rect
        key={`sing-${i}`}
        x={x}
        y={scaleY(midi) - 4}
        width={barW}
        height={8}
        fill={fill}
        rx={4}
        ry={4}
        opacity={0.9}
      />,
    )
  }

  return (
    <Box
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      sx={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        minWidth: 0,
        cursor: onViewDrag ? "grab" : undefined,
        ":active": onViewDrag ? { cursor: "grabbing" } : undefined,
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
        <title>音程バー</title>
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
        {barPositions.map((barMs) => {
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
        })}
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
        {singingBars}
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
