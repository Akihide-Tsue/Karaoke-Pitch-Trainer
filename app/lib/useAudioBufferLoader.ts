/**
 * 画面上にデバッグログを表示する（alert はブロッキングで処理を止めるため使わない）
 */
function debugLog(msg: string) {
  const id = "__debug_log__"
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement("pre")
    el.id = id
    el.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;max-height:40vh;overflow:auto;background:rgba(0,0,0,0.85);color:#0f0;font-size:11px;padding:8px;z-index:99999;pointer-events:auto;"
    document.body.appendChild(el)
  }
  el.textContent += `${msg}\n`
  el.scrollTop = el.scrollHeight
}

/**
 * WAV/音声ファイルを fetch → decodeAudioData で AudioBuffer に変換する。
 * iOS Safari では Promise ベースの decodeAudioData がハングすることがあるため
 * コールバック版を使用し、タイムアウトも設ける。
 */
export async function loadAudioBuffer(
  url: string,
  context: AudioContext,
): Promise<AudioBuffer> {
  const short = url.split("/").pop() ?? url
  debugLog(`[1] fetch開始: ${short}`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`音声の取得に失敗しました: ${res.status} ${url}`)
  }
  debugLog(`[2] fetch完了, arrayBuffer読み込み中...`)
  const arrayBuffer = await res.arrayBuffer()
  debugLog(`[3] arrayBuffer size: ${arrayBuffer.byteLength} ctx.state: ${context.state}`)

  // iOS Safari で suspended な AudioContext では decodeAudioData が永久にハングする
  if (context.state === "suspended") {
    debugLog(`[4] context suspended, resume()...`)
    await context.resume()
    debugLog(`[5] resume()完了, ctx.state: ${context.state}`)
  }

  return new Promise<AudioBuffer>((resolve, reject) => {
    const timeout = setTimeout(() => {
      debugLog(`[TIMEOUT] 30秒経過: ${short}`)
      reject(new Error("音声のデコードがタイムアウトしました"))
    }, 30_000)

    debugLog(`[6] decodeAudioData呼び出し: ${short}`)
    // コールバック版を使用（iOS Safari の古いバージョンでも確実に動作する）
    context.decodeAudioData(
      arrayBuffer,
      (buffer) => {
        clearTimeout(timeout)
        debugLog(`[7] decode成功: ${short} duration: ${buffer.duration}`)
        resolve(buffer)
      },
      (err) => {
        clearTimeout(timeout)
        debugLog(`[ERROR] decodeエラー: ${short} ${err}`)
        reject(err ?? new Error("音声のデコードに失敗しました"))
      },
    )
  })
}
