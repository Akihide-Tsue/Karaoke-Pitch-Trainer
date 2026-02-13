import Box from "@mui/material/Box"
import type { ReactElement } from "react"
import { useCallback, useMemo, useRef } from "react"
import {
  PITCH_BAR_LINE,
  PITCH_C_LINE,
  PITCH_GRID_LINE,
  PITCH_NOTE,
  PITCH_NOTE_CURRENT,
  PITCH_NOTE_MATCH,
  PITCH_NOTE_MISMATCH,
} from "~/constants/colors"
import { getTargetPitchAtTime, type MelodyNote } from "~/lib/melody"
import { PITCH_INTERVAL_MS } from "~/lib/usePitchDetection"
import type { PitchEntry } from "~/stores/practice"

/** 音程バーに表示する小節数。2にすると「現在」の前後が十分見えて歌唱がリアルタイムで見える */
const PITCH_BAR_WINDOW_BARS = 1.5
/** ウィンドウ更新の刻み（ms）。小さいほどスムーズ、大きいほど再計算を抑制 */
const POSITION_TICK_MS = 16
/** ドラッグ感度。1幅分のドラッグでパンする小節数。大きくすると少ないドラッグで大きく移動 */
const DRAG_SENSITIVITY_BARS = 2
/** 現在位置をビュー内のどこに置くか (0–1)。CurrentLine の表示位置と一致させる */
export const POSITION_RATIO = 0.5

/**
 * 五線譜風の音程バーコンポーネント。
 * 曲のメロディ（正解ノート）、歌唱ピッチ（約 PITCH_INTERVAL_MS ms 刻み）、現在位置を表示する。
 * 歌唱が正解と ±1 半音以内なら緑、それ以外はグレーで色分けする。
 *
 * @param notes - 曲のメロディノート配列
 * @param pitchData - 歌唱ピッチ（再生位置 timeMs でタグ付けされた配列）
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
  barOffsetMs = 0,
  height = 120,
  onViewDrag,
}: {
  notes: MelodyNote[]
  pitchData: PitchEntry[]
  totalDurationMs: number
  positionMs: number
  bpm?: number
  barOffsetMs?: number
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
      const msPerBar = bpm ? (60 * 1000 * 4) / bpm : 2000
      const msPerPx = (DRAG_SENSITIVITY_BARS * msPerBar) / rect.width
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
  const positionTick =
    Math.floor(positionMs / POSITION_TICK_MS) * POSITION_TICK_MS

  const svgData = useMemo(() => {
    if (!totalDurationMs || !notes.length) return null
    const windowDurationMs = PITCH_BAR_WINDOW_BARS * msPerBar
    const pos = positionTick
    const windowStartMs = Math.max(
      0,
      Math.min(
        pos - windowDurationMs * POSITION_RATIO,
        totalDurationMs - windowDurationMs,
      ),
    )
    const windowEndMs = Math.min(
      totalDurationMs,
      windowStartMs + windowDurationMs,
    )
    const actualWindowMs = windowEndMs - windowStartMs
    const PIXELS_PER_SEMITONE = 20
    const padding = 8
    const w = 1000

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

    const firstBar = Math.ceil((windowStartMs - barOffsetMs) / msPerBar)
    const lastBar = Math.floor((windowEndMs - barOffsetMs) / msPerBar)
    const barPositions: number[] = []
    for (let i = firstBar; i <= lastBar; i++) {
      barPositions.push(barOffsetMs + i * msPerBar)
    }

    // pitchData は timeMs 昇順。二分探索で表示範囲の開始位置を特定し、
    // filter の O(n) スキャンを O(log n + visible) に削減する
    let lo = 0
    let hi = pitchData.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (pitchData[mid].timeMs < windowStartMs) lo = mid + 1
      else hi = mid
    }
    const singingBars: ReactElement[] = []
    for (let i = lo; i < pitchData.length; i++) {
      const { timeMs, midi } = pitchData[i]
      if (timeMs >= windowEndMs) break
      if (midi <= 0 || midi < minPitchDisplay || midi > maxPitchDisplay)
        continue
      const x = scaleX(timeMs)
      const target = getTargetPitchAtTime(notes, timeMs)
      const match = target != null && Math.abs(midi - target) <= 1
      const fill = match ? PITCH_NOTE_MATCH : PITCH_NOTE_MISMATCH
      const nextTimeMs = pitchData[i + 1]?.timeMs ?? timeMs + PITCH_INTERVAL_MS
      const barW = Math.max(2, scaleX(nextTimeMs) - x)
      if (x + barW < 0 || x > w) continue
      singingBars.push(
        <rect
          key={`sing-${timeMs}-${i}`}
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

    return {
      lines,
      barPositions,
      visibleNotes,
      singingBars,
      totalHeight,
      padding,
      w,
      scaleX,
      scaleY,
    }
  }, [notes, pitchData, totalDurationMs, positionTick, msPerBar, barOffsetMs])

  if (!totalDurationMs || !notes.length) {
    return (
      <Box
        sx={{ height, bgcolor: "grey.100", borderRadius: 1 }}
        role="img"
        aria-label="音程バー（データなし）"
      />
    )
  }

  if (!svgData) return null

  const {
    lines,
    barPositions,
    visibleNotes,
    singingBars,
    totalHeight,
    padding,
    w,
    scaleX,
    scaleY,
  } = svgData

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
        preserveAspectRatio="xMinYMid meet"
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
        {visibleNotes.map((n, i) => {
          const isCurrent = n.startMs <= positionTick && positionTick < n.endMs
          return (
            <rect
              key={`note-${n.startMs}-${n.pitch}-${i}`}
              x={scaleX(n.startMs)}
              y={scaleY(n.pitch) - 6}
              width={Math.max(2, scaleX(n.endMs) - scaleX(n.startMs))}
              height={12}
              fill={isCurrent ? PITCH_NOTE_CURRENT : PITCH_NOTE}
              rx={4}
              ry={4}
            />
          )
        })}
        {singingBars}
      </svg>
    </Box>
  )
}
