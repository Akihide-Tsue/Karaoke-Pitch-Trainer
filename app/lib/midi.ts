import { Midi } from "@tonejs/midi";
import type { MelodyData, MelodyNote } from "~/lib/melody";

const MELODY_TRACK_NAMES = ["Vocal", "Melody", "Voice"];

/**
 * MIDI ファイルをパースし MelodyData に変換
 * plan.md 4.1: メロディトラックのノートのみ使用
 */
export async function parseMidiToMelodyData(
  url: string,
  songId: string,
): Promise<MelodyData> {
  const midi = await Midi.fromUrl(url);

  const track =
    midi.tracks.find((t) =>
      MELODY_TRACK_NAMES.some(
        (name) =>
          t.name?.toLowerCase().includes(name.toLowerCase()),
      ),
    ) ?? midi.tracks[0];

  if (!track || !track.notes.length) {
    return {
      songId,
      totalDurationMs: 0,
      trackName: track?.name,
      notes: [],
    };
  }

  const notes: MelodyNote[] = track.notes.map((n) => ({
    startMs: n.time * 1000,
    endMs: (n.time + n.duration) * 1000,
    pitch: n.midi,
  }));

  const totalDurationMs = midi.duration * 1000;

  return {
    songId,
    totalDurationMs,
    trackName: track.name,
    notes,
  };
}
