/**
 * サンプル曲 brand-new-music の設定
 * TODO.md: songId = brand-new-music, unitId = unit-1
 */

export const SONG_ID = "brand-new-music" as const
export const UNIT_ID = "unit-1" as const

/** 公開パス（public/ 基準） */
export const MIDI_URL = "/BNM_MIDI.mid"
export const INST_AUDIO_URL = "/Brand_New_Music_inst.m4a"
export const VOCAL_AUDIO_URL = "/Brand_New_Music.m4a"

export const SONG_TITLE = "Brand New Music"

/**
 * MIDI ノートと音声のタイミングのズレ補正（ms）。正の値で MIDI を後ろにずらす
 * このサンプル音源の問題かもしれない
 */
export const MIDI_OFFSET_MS = 100
