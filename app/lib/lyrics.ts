import type { LyricEntry } from "~/lib/melody"

/**
 * 再生位置に対応する歌詞の行インデックス（0-based）を返す。
 * positionMs 時点で歌っている歌詞の行を特定する。
 * @param lyrics - 歌詞エントリ配列
 * @param positionMs - 再生位置（ミリ秒）
 * @returns 該当行のインデックス。歌詞がない場合は -1
 */
export const getCurrentLyricIndex = (
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

/**
 * 3行表示用に、前・現在（歌っている行）・次の歌詞テキストと開始時間を返す。
 * 歌詞パネルの表示や、クリックでシークする際の timeMs 取得に使用する。
 * @param lyrics - 歌詞エントリ配列
 * @param positionMs - 再生位置（ミリ秒）
 * @returns prev / current / next の各 { text, timeMs }。該当がない場合は null
 */
export const getLyricLines = (
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

interface LyricsJsonEntry {
  time: number
  lyric: string
}

/**
 * lyrics.json 形式を LyricEntry[] に変換
 * plan.md 4.1: timeMs = time * 1000, text = lyric
 */
export const parseLyricsToEntries = (data: LyricsJsonEntry[]): LyricEntry[] => {
  return data
    .filter((e) => e.lyric.trim() !== "")
    .map((e) => ({
      timeMs: e.time * 1000,
      text: e.lyric,
    }))
}
