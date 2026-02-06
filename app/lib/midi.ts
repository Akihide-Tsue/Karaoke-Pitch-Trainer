import type { MelodyData, MelodyNote } from "~/lib/melody"

const MELODY_TRACK_NAMES = ["Vocal", "Melody", "Voice"]

/**
 * @tonejs/midi を動的インポート（Vite/ESM 互換）
 */
async function getMidiClass(): Promise<{
  fromUrl: (url: string) => Promise<{
    tracks: Array<{
      name?: string
      notes: Array<{ time: number; duration: number; midi: number }>
    }>
    duration: number
    header?: {
      tempos?: Array<{ bpm: number }>
      keySignatures?: Array<{ key: string; scale: string }>
    }
  }>
}> {
  const mod = await import("@tonejs/midi")
  const raw =
    (mod as { default?: { Midi?: unknown; fromUrl?: unknown }; Midi?: unknown })
      .default ?? mod
  const Midi =
    (raw as { Midi?: { fromUrl?: unknown } }).Midi ??
    (raw as { fromUrl?: unknown })
  if (typeof (Midi as { fromUrl?: (u: string) => Promise<unknown> })?.fromUrl !== "function") {
    throw new Error("MIDI ライブラリの読み込みに失敗しました")
  }
  return Midi as {
    fromUrl: (url: string) => Promise<{
      tracks: Array<{
        name?: string
        notes: Array<{ time: number; duration: number; midi: number }>
      }>
      duration: number
      header?: {
        tempos?: Array<{ bpm: number }>
        keySignatures?: Array<{ key: string; scale: string }>
      }
    }>
  }
}

/**
 * MIDI ファイルをパースし MelodyData に変換
 * plan.md 4.1: メロディトラックのノートのみ使用
 */
export async function parseMidiToMelodyData(
  url: string,
  songId: string,
): Promise<MelodyData> {
  const Midi = await getMidiClass()
  const midi = await Midi.fromUrl(url)

  const track =
    midi.tracks.find((t: { name?: string }) =>
      MELODY_TRACK_NAMES.some((name) =>
        t.name?.toLowerCase().includes(name.toLowerCase()),
      ),
    ) ?? midi.tracks[0]

  if (!track || !track.notes.length) {
    return {
      songId,
      totalDurationMs: 0,
      trackName: track?.name,
      notes: [],
    }
  }

  const notes: MelodyNote[] = track.notes.map(
    (n: { time: number; duration: number; midi: number }) => ({
      startMs: n.time * 1000,
      endMs: (n.time + n.duration) * 1000,
      pitch: n.midi,
    }),
  )

  const totalDurationMs = midi.duration * 1000
  const bpm = midi.header?.tempos?.[0]?.bpm ?? undefined
  const keySig = midi.header?.keySignatures?.[0]
  const key =
    keySig != null
      ? keySig.scale === "minor"
        ? `${keySig.key}m`
        : keySig.key
      : undefined

  return {
    songId,
    totalDurationMs,
    trackName: track.name,
    notes,
    bpm,
    key,
  }
}
