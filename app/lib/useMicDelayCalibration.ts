/**
 * マイク遅延のキャリブレーション。
 * スピーカーからビープを再生し、マイクで検出するまでの往復遅延を計測する。
 * midikaraoke.app の Mic Delay Calibration を参考にした実装。
 */
import { useCallback, useState } from "react"

const BEEP_FREQ = 440
const BEEP_DURATION_S = 0.2
const ANALYSER_FFT_SIZE = 2048
const DETECT_THRESHOLD = 0.05
const POLL_INTERVAL_MS = 5
const TIMEOUT_MS = 3000

export const useMicDelayCalibration = (
  onResult: (delayMs: number) => void,
  onError: (err: Error) => void,
) => {
  const [isCalibrating, setIsCalibrating] = useState(false)

  const calibrate = useCallback(async () => {
    setIsCalibrating(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      if (ctx.state === "suspended") await ctx.resume()

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = BEEP_FREQ
      osc.connect(gain)
      gain.gain.value = 1
      gain.connect(ctx.destination)

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = ANALYSER_FFT_SIZE
      analyser.smoothingTimeConstant = 0
      source.connect(analyser)

      const data = new Float32Array(analyser.fftSize)

      const t0 = performance.now()
      osc.start(0)
      osc.stop(BEEP_DURATION_S)

      const delayMs = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup()
          reject(
            new Error(
              "計測タイムアウト。音量を上げてマイクをスピーカーに近づけ、もう一度お試しください。",
            ),
          )
        }, TIMEOUT_MS)

        const cleanup = () => {
          clearTimeout(timeout)
          clearInterval(interval)
          osc.disconnect()
          gain.disconnect()
          source.disconnect()
          analyser.disconnect()
          for (const t of stream.getTracks()) t.stop()
          ctx.close()
        }

        const interval = setInterval(() => {
          analyser.getFloatTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            sum += Math.abs(data[i])
          }
          const avg = sum / data.length
          if (avg > DETECT_THRESHOLD) {
            cleanup()
            resolve(Math.round(performance.now() - t0))
          }
        }, POLL_INTERVAL_MS)
      })

      onResult(delayMs)
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsCalibrating(false)
    }
  }, [onResult, onError])

  return { calibrate, isCalibrating }
}
