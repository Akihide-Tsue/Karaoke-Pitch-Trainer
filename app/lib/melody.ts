/**
 * メロディ・歌詞の型定義とユーティリティ
 * plan.md 4.1 準拠
 */

export interface MelodyNote {
  startMs: number
  endMs: number
  pitch: number
  frequency?: number
  noteName?: string
}

export interface LyricEntry {
  timeMs: number
  text: string
}

export interface MelodyData {
  songId: string
  totalDurationMs: number
  trackName?: string
  notes: MelodyNote[]
  lyrics?: LyricEntry[]
  /** BPM（小節線表示用。未設定時は120） */
  bpm?: number
  /** 小節線の起点（ms）。最初のノート位置を拍に丸めた値 */
  barOffsetMs?: number
  /** 調（例: "C", "Am"）。MIDI keySignature から取得 */
  key?: string
}

/**
 * 指定時刻における正解ピッチ（MIDI）を取得
 */
export const getTargetPitchAtTime = (
  notes: MelodyNote[],
  timeMs: number,
): number | null => {
  const note = notes.find((n) => timeMs >= n.startMs && timeMs < n.endMs)
  return note ? note.pitch : null
}

/**
 * 歌唱ピッチと正解ノートの一致率を算出（0〜100）。
 * 無音（midi <= 0）やノートがない区間はスキップし、±1半音以内を一致とする。
 */
export const computeScore = (
  pitchData: { timeMs: number; midi: number }[],
  notes: MelodyNote[],
): number => {
  let matched = 0
  let total = 0
  for (const entry of pitchData) {
    if (entry.midi <= 0) continue
    const target = getTargetPitchAtTime(notes, entry.timeMs)
    if (target === null) continue
    total++
    if (Math.abs(entry.midi - target) <= 1) matched++
  }
  return total === 0 ? 0 : Math.round((matched / total) * 100)
}
