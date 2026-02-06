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
