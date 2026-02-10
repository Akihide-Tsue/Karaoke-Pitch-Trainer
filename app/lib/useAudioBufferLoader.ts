/**
 * WAV/音声ファイルを fetch → decodeAudioData で AudioBuffer に変換する。
 * iOS Safari では Promise ベースの decodeAudioData がハングすることがあるため
 * コールバック版を使用し、タイムアウトも設ける。
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

  // iOS Safari で suspended な AudioContext では decodeAudioData が永久にハングする
  if (context.state === "suspended") {
    await context.resume()
  }

  return new Promise<AudioBuffer>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("音声のデコードがタイムアウトしました"))
    }, 30_000)

    // コールバック版を使用（iOS Safari の古いバージョンでも確実に動作する）
    context.decodeAudioData(
      arrayBuffer,
      (buffer) => {
        clearTimeout(timeout)
        resolve(buffer)
      },
      (err) => {
        clearTimeout(timeout)
        reject(err ?? new Error("音声のデコードに失敗しました"))
      },
    )
  })
}
