import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { MelodyData } from "~/lib/melody"

const MIC_DELAY_STORAGE_KEY = "pitch-poc-mic-delay-ms"

/** 再生位置（曲内 ms） */
export const playbackPositionMsAtom = atom<number>(0)

/** 曲データ（MelodyData） */
export const melodyDataAtom = atom<MelodyData | null>(null)

/** 歌唱ピッチ（再生位置 timeMs と MIDI の対。正確な同期のため） */
export type PitchEntry = { timeMs: number; midi: number }

/** ピッチデータ（実際の再生時刻でタグ付け） */
export const pitchDataAtom = atom<PitchEntry[]>([])

/** 練習中かどうか */
export const isPracticingAtom = atom<boolean>(false)

/** ガイドボーカル ON（歌あり） / OFF（オケのみ） */
export const useGuideVocalAtom = atom<boolean>(false)

/** 再生音量（0.0〜1.0）※ iOS は端末の最小音量がゼロにならないことがあるため、初期値は控えめに */
export const volumeAtom = atom<number>(0.5)

/** 録音モード（ON でマイク入力・ピッチ検出を有効にする想定） */
export const recordingModeAtom = atom<boolean>(false)

/** マイク遅延（ms）。歌唱と音程バーの表示ズレを補正。端末ごとにキャリブレーション可能 */
export const micDelayMsAtom = atomWithStorage<number>(
  MIC_DELAY_STORAGE_KEY,
  300,
  {
    getItem: (key, initial) => {
      try {
        const v = localStorage.getItem(key)
        return v != null ? Number.parseInt(v, 10) : initial
      } catch {
        return initial
      }
    },
    setItem: (key, value) => {
      localStorage.setItem(key, String(value))
    },
    removeItem: (key) => localStorage.removeItem(key),
  },
)
