/**
 * WAV/音声ファイルを fetch → decodeAudioData で AudioBuffer に変換する。
 * iOS Safari では Promise ベースの decodeAudioData がハングすることがあるため
 * コールバック版を使用し、タイムアウトも設ける。
 */
export async function loadAudioBuffer(
  url: string,
  context: AudioContext,
): Promise<AudioBuffer> {
  alert("[1] fetch開始: " + url)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`音声の取得に失敗しました: ${res.status} ${url}`)
  }
  alert("[2] fetch完了, arrayBuffer読み込み中...")
  const arrayBuffer = await res.arrayBuffer()
  alert("[3] arrayBuffer size: " + arrayBuffer.byteLength + " context.state: " + context.state)

  // iOS Safari で suspended な AudioContext では decodeAudioData が永久にハングする
  if (context.state === "suspended") {
    alert("[4] context suspended, resume()呼び出し...")
    await context.resume()
    alert("[5] resume()完了, context.state: " + context.state)
  }

  return new Promise<AudioBuffer>((resolve, reject) => {
    const timeout = setTimeout(() => {
      alert("[TIMEOUT] 30秒経過: " + url)
      reject(new Error("音声のデコードがタイムアウトしました"))
    }, 30_000)

    alert("[6] decodeAudioData呼び出し: " + url)
    // コールバック版を使用（iOS Safari の古いバージョンでも確実に動作する）
    context.decodeAudioData(
      arrayBuffer,
      (buffer) => {
        clearTimeout(timeout)
        alert("[7] decode成功: " + url + " duration: " + buffer.duration)
        resolve(buffer)
      },
      (err) => {
        clearTimeout(timeout)
        alert("[ERROR] decodeエラー: " + url + " " + err)
        reject(err ?? new Error("音声のデコードに失敗しました"))
      },
    )
  })
}
