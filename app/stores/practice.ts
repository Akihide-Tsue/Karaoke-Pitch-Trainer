import type { MelodyData } from "~/lib/melody";
import { atom } from "jotai";

/** 再生位置（曲内 ms） */
export const playbackPositionMsAtom = atom<number>(0);

/** 曲データ（MelodyData） */
export const melodyDataAtom = atom<MelodyData | null>(null);

/** ピッチデータ（50ms 刻みの MIDI 配列） */
export const pitchDataAtom = atom<number[]>([]);

/** 練習中かどうか */
export const isPracticingAtom = atom<boolean>(false);
