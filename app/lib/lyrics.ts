import type { LyricEntry } from "~/lib/melody";

interface LyricsJsonEntry {
  time: number;
  lyric: string;
}

/**
 * lyrics.json 形式を LyricEntry[] に変換
 * plan.md 4.1: timeMs = time * 1000, text = lyric
 */
export function parseLyricsToEntries(
  data: LyricsJsonEntry[],
): LyricEntry[] {
  return data
    .filter((e) => e.lyric.trim() !== "")
    .map((e) => ({
      timeMs: e.time * 1000,
      text: e.lyric,
    }));
}
