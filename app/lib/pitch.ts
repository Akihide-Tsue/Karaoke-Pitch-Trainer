/**
 * 周波数（Hz）を MIDI ノート番号に変換
 * 12 * log2(freq / 440) + 69
 */
export function frequencyToMidi(frequency: number): number {
  if (frequency <= 0) return 0;
  return 12 * Math.log2(frequency / 440) + 69;
}
