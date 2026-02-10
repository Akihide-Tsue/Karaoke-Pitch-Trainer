/**
 * WAV/音声ファイルを fetch → decodeAudioData で AudioBuffer に変換する。
 */
export async function loadAudioBuffer(
  url: string,
  context: AudioContext,
): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`音声の取得に失敗しました: ${res.status} ${url}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return context.decodeAudioData(arrayBuffer)
}
