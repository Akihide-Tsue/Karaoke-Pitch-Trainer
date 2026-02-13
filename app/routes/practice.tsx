import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import Container from "@mui/material/Container"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { CurrentLine } from "~/components/CurrentLine"
import { LyricsPanel } from "~/components/LyricsPanel"
import { PitchBar } from "~/components/PitchBar"
import { PracticeControls } from "~/components/PracticeControls"
import { PracticeLoadingScreen } from "~/components/PracticeLoadingScreen"
import { ScoreResultDialog } from "~/components/ScoreResultDialog"
import {
  INST_AUDIO_URL,
  MIDI_OFFSET_MS,
  MIDI_URL,
  SONG_ID,
  SONG_TITLE,
  UNIT_ID,
  VOCAL_AUDIO_URL,
} from "~/constants/songs/brand-new-music"
import lyricsJson from "~/constants/songs/brand-new-music/lyrics.json"
import { getLyricLines, parseLyricsToEntries } from "~/lib/lyrics"
import { computeScore } from "~/lib/melody"
import { parseMidiToMelodyData } from "~/lib/midi"
import { getLastSavedRecording, setLastSavedRecording } from "~/lib/storage"
import { usePitchDetection } from "~/lib/usePitchDetection"
import { usePracticePlayback } from "~/lib/usePracticePlayback"
import {
  isPracticingAtom,
  melodyDataAtom,
  micDelayMsAtom,
  type PitchEntry,
  pitchDataAtom,
  playbackPositionMsAtom,
  recordingModeAtom,
  useGuideVocalAtom,
  volumeAtom,
} from "~/stores/practice"

type LyricsJsonEntry = { time: number; lyric: string }

const Practice = () => {
  const setMelodyData = useSetAtom(melodyDataAtom)
  const setPlaybackPosition = useSetAtom(playbackPositionMsAtom)
  const setPitchData = useSetAtom(pitchDataAtom)
  const setIsPracticing = useSetAtom(isPracticingAtom)
  const useGuideVocal = useAtomValue(useGuideVocalAtom)
  const setUseGuideVocal = useSetAtom(useGuideVocalAtom)
  const recordingMode = useAtomValue(recordingModeAtom)
  const setRecordingMode = useSetAtom(recordingModeAtom)
  const volume = useAtomValue(volumeAtom)
  const setVolume = useSetAtom(volumeAtom)
  const melodyData = useAtomValue(melodyDataAtom)
  const pitchData = useAtomValue(pitchDataAtom)
  const positionMs = useAtomValue(playbackPositionMsAtom)
  const isPracticing = useAtomValue(isPracticingAtom)
  const micDelayMs = useAtomValue(micDelayMsAtom)
  const navigate = useNavigate()

  // 画面遷移で戻ってきたとき前回の歌唱データをクリア
  useEffect(() => {
    setPitchData([])
    setPlaybackPosition(0)
  }, [setPitchData, setPlaybackPosition])

  // 保存済み録音の有無を確認（再生画面への導線表示用）
  const [hasRecording, setHasRecording] = useState(false)
  useEffect(() => {
    getLastSavedRecording().then((rec) => setHasRecording(rec != null))
  }, [])

  const pitchBufferRef = useRef<PitchEntry[]>([])
  /** 練習中のピッチデータを蓄積する mutable ref。
   *  Jotai atom の setPitchData([...prev, ...batch]) は O(n) コピーが毎フレーム走り、
   *  Android では配列が大きくなるにつれ GC + re-render 遅延が増大する。
   *  mutable ref への push は O(1) で済み、version カウンタで PitchBar の再描画をトリガーする。 */
  const livePitchRef = useRef<PitchEntry[]>([])
  const [pitchVersion, setPitchVersion] = useState(0)

  // playback.getPlaybackPositionMs を ref 経由で pitchDetection に渡す
  const getPlaybackPositionMsRef = useRef<() => number>(() => 0)

  // --- スコア・保存 ---
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false)
  const [lastScore, setLastScore] = useState(0)
  const lastBlobRef = useRef<Blob | null>(null)
  const pitchDataRef = useRef<PitchEntry[]>([])
  const recordingOffsetMsRef = useRef(0)
  // 練習中は livePitchRef から直接参照し、停止後は Jotai atom から同期
  useEffect(() => {
    if (!isPracticing) pitchDataRef.current = pitchData
  }, [pitchData, isPracticing])
  useEffect(() => {
    if (isPracticing) pitchDataRef.current = livePitchRef.current
  }, [isPracticing])

  const getRecordingOffsetMsRef = useRef<() => number>(() => 0)

  const handleStopped = useCallback(
    (blob: Blob | null) => {
      const score = computeScore(pitchDataRef.current, melodyData?.notes ?? [])
      setLastScore(score)
      lastBlobRef.current = blob
      recordingOffsetMsRef.current = getRecordingOffsetMsRef.current()
      setScoreDialogOpen(true)
    },
    [melodyData],
  )

  const handleSave = useCallback(async () => {
    if (!lastBlobRef.current || !melodyData) return
    const ok = await setLastSavedRecording({
      songId: SONG_ID,
      songTitle: SONG_TITLE,
      unitId: UNIT_ID,
      unitStartMs: 0,
      unitEndMs: melodyData.totalDurationMs,
      audioBlob: lastBlobRef.current,
      pitchData: pitchDataRef.current,
      score: lastScore,
      totalDurationMs: melodyData.totalDurationMs,
      recordingOffsetMs: recordingOffsetMsRef.current,
    })
    if (ok) setHasRecording(true)
  }, [melodyData, lastScore])

  const handlePlayback = useCallback(() => {
    setScoreDialogOpen(false)
    navigate("/playback")
  }, [navigate])

  const pitchDetection = usePitchDetection({
    onPitch: useCallback(
      (midi: number, timeMs: number) => {
        // バッファに溜めるだけ。flush は smoothPositionMs の rAF ループ内で行う
        pitchBufferRef.current.push({ timeMs: timeMs - micDelayMs, midi })
      },
      [micDelayMs],
    ),
    getPlaybackPositionMs: () => getPlaybackPositionMsRef.current(),
    onError: useCallback((err: Error) => {
      alert(`マイクの使用を許可してください。\n${err.message}`)
    }, []),
  })

  const playback = usePracticePlayback({
    melodyData,
    useGuideVocal,
    setUseGuideVocal,
    setPlaybackPosition,
    setPitchData,
    setIsPracticing,
    pitchDetection,
    volume,
    instUrl: INST_AUDIO_URL,
    vocalUrl: VOCAL_AUDIO_URL,
    onStopped: handleStopped,
  })

  // playback 初期化後に ref を更新
  useEffect(() => {
    getPlaybackPositionMsRef.current = playback.getPlaybackPositionMs
    getRecordingOffsetMsRef.current = playback.getRecordingOffsetMs
  }, [playback])

  // 音声バッファの自動ロード（idle なら開始）
  const { bufferLoadStatus, startLoading } = playback
  useEffect(() => {
    if (bufferLoadStatus === "idle") {
      startLoading()
    }
  }, [bufferLoadStatus, startLoading])

  // 練習ページを開いたタイミングでマイク許可を取得（開始ボタン押下時にダイアログが出ないようにする）
  const { requestPermission } = pitchDetection
  useEffect(() => {
    requestPermission()
  }, [requestPermission])

  const [loading, setLoading] = useState(!melodyData)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewPositionMs, setViewPositionMs] = useState(0)
  const [smoothPositionMs, setSmoothPositionMs] = useState(0)
  const [isStartingPlayback, setIsStartingPlayback] = useState(false)

  useEffect(() => {
    if (!isPracticing) setViewPositionMs(positionMs)
  }, [isPracticing, positionMs])

  // 再生中は requestAnimationFrame で位置を毎フレーム更新し、PitchBar の位置線をスムーズに動かす
  // pitchBuffer → livePitchRef への push は O(1)。version カウンタで PitchBar の再描画をトリガーする。
  const getPlaybackPositionMsFn = useRef(playback.getPlaybackPositionMs)
  getPlaybackPositionMsFn.current = playback.getPlaybackPositionMs
  useEffect(() => {
    if (!isPracticing) return
    livePitchRef.current = []
    setPitchVersion(0)
    let rafId: number
    const tick = () => {
      setSmoothPositionMs(getPlaybackPositionMsFn.current())
      if (pitchBufferRef.current.length > 0) {
        const batch = pitchBufferRef.current
        pitchBufferRef.current = []
        for (let i = 0; i < batch.length; i++) {
          livePitchRef.current.push(batch[i])
        }
        setPitchVersion((v) => v + 1)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPracticing])

  // 練習終了時に livePitchRef の確定値を Jotai atom に書き戻す（スコア計算・保存用）
  const prevIsPracticingRef = useRef(false)
  useEffect(() => {
    if (prevIsPracticingRef.current && !isPracticing) {
      setPitchData(livePitchRef.current.slice())
    }
    prevIsPracticingRef.current = isPracticing
  }, [isPracticing, setPitchData])

  // キーボードの音量キー（VolumeUp/VolumeDown/VolumeMute）でアプリ音量とUIスライダーを連動
  useEffect(() => {
    const STEP = 0.05
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "VolumeUp") {
        e.preventDefault()
        setVolume((v) => Math.min(1, v + STEP))
      } else if (e.code === "VolumeDown") {
        e.preventDefault()
        setVolume((v) => Math.max(0, v - STEP))
      } else if (e.code === "VolumeMute") {
        e.preventDefault()
        setVolume((v) => (v > 0 ? 0 : 1))
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [setVolume])

  const totalDurationMs = melodyData?.totalDurationMs ?? 0
  const handleLyricSeek = useCallback(
    (timeMs: number) => {
      playback.seekToMs(timeMs)
      if (!isPracticing) setViewPositionMs(timeMs)
    },
    [playback, isPracticing],
  )

  const handleSeekBackward = useCallback(() => {
    playback.seekBackward()
    if (!isPracticing) {
      setViewPositionMs(playback.getPlaybackPositionMs())
    }
  }, [playback, isPracticing])

  const handleSeekForward = useCallback(() => {
    playback.seekForward()
    if (!isPracticing) {
      setViewPositionMs(playback.getPlaybackPositionMs())
    }
  }, [playback, isPracticing])

  const handleStart = async () => {
    setIsStartingPlayback(true)
    try {
      await playback.startPlayback()
    } finally {
      setIsStartingPlayback(false)
    }
  }

  useEffect(() => {
    // melodyData が Jotai atom に残っていれば再パース不要
    if (melodyData) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const data = await parseMidiToMelodyData(MIDI_URL, SONG_ID)
        // MIDIと音声のタイミングズレを補正
        if (MIDI_OFFSET_MS) {
          for (const n of data.notes) {
            n.startMs += MIDI_OFFSET_MS
            n.endMs += MIDI_OFFSET_MS
          }
          if (data.barOffsetMs != null) {
            data.barOffsetMs += MIDI_OFFSET_MS
          }
        }
        const lyrics = parseLyricsToEntries(lyricsJson as LyricsJsonEntry[])
        if (cancelled) return
        setMelodyData({ ...data, lyrics })
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "曲の読み込みに失敗しました")
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [melodyData, setMelodyData])

  if (loading || playback.bufferLoadStatus === "idle" || playback.bufferLoadStatus === "loading") {
    return <PracticeLoadingScreen />
  }

  if (playback.bufferLoadStatus === "error" && playback.bufferLoadError) {
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography color="error">
          音声の読み込みに失敗しました: {playback.bufferLoadError}
        </Typography>
        <Box
          sx={{
            mt: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Button
            variant="contained"
            onClick={() => playback.startLoading()}
            sx={{ fontWeight: "bold" }}
          >
            再試行
          </Button>
          <Button component={Link} to="/" sx={{ fontWeight: "bold" }}>
            ホームへ
          </Button>
        </Box>
      </Container>
    )
  }

  if (loadError) {
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography color="error">{loadError}</Typography>
        <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
          <Button component={Link} to="/" sx={{ fontWeight: "bold" }}>
            ホームへ
          </Button>
        </Box>
      </Container>
    )
  }

  const lyrics = melodyData?.lyrics ?? []
  const lyricLines = getLyricLines(lyrics, positionMs)

  return (
    <Container maxWidth="md" sx={{ py: 3, position: "relative" }}>
      {/* 開始ボタン押下〜ピッチ検出完了まで最前面にローディング表示 */}
      {isStartingPlayback && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-busy
          aria-live="polite"
        >
          <CircularProgress size={48} />
        </Box>
      )}

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Typography component="h1" variant="h6">
          練習画面
          <Typography component="span" variant="caption" color="text.secondary">
            {" バージョン：" +
              new Date(__BUILD_TIME__).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
          </Typography>
        </Typography>
        {/* マイク遅延の設定 */}
        {/* <MicDelaySettings /> */}
      </Box>

      {/* 練習画面のコントロールボタン群 */}
      <PracticeControls
        onStart={handleStart}
        onStop={() => {
          playback.stopPlayback()
        }}
        onResume={playback.resumePlayback}
        onToggleGuideVocal={playback.toggleGuideVocal}
        onSeekBackward={handleSeekBackward}
        onSeekForward={handleSeekForward}
        useGuideVocal={useGuideVocal}
        seekSeconds={playback.seekSeconds}
        recordingMode={recordingMode}
        onRecordingModeChange={setRecordingMode}
        disabled={{
          hasMelodyData: !!melodyData,
          isPracticing,
          positionMs,
          totalDurationMs,
        }}
      />

      <Paper sx={{ p: 2, mb: 2, overflow: "hidden" }}>
        <Box
          sx={{
            position: "relative",
            overflow: "hidden",
            width: "100%",
            minWidth: 0,
          }}
        >
          {/* 五線譜風の音程バーコンポーネント */}
          <PitchBar
            notes={melodyData?.notes ?? []}
            pitchData={isPracticing ? livePitchRef.current : pitchData}
            pitchVersion={pitchVersion}
            totalDurationMs={totalDurationMs}
            positionMs={isPracticing ? smoothPositionMs : viewPositionMs}
            bpm={melodyData?.bpm}
            barOffsetMs={melodyData?.barOffsetMs}
            onViewDrag={!isPracticing ? setViewPositionMs : undefined}
          />
          {/* 現在位置の縦線 */}
          <CurrentLine />
        </Box>
        <Box
          sx={{
            mt: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          {(melodyData?.bpm != null || melodyData?.key != null) && (
            <Typography variant="caption" color="text.secondary">
              {[
                melodyData?.bpm != null && `BPM ${Math.floor(melodyData.bpm)}`,
                melodyData?.key != null && `調 ${melodyData.key}`,
              ]
                .filter(Boolean)
                .join(" ・ ")}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {((isPracticing ? smoothPositionMs : viewPositionMs) / 1000).toFixed(1)}s /{" "}
            {(totalDurationMs / 1000).toFixed(1)}s
          </Typography>
          {isPracticing && (
            <Typography variant="caption" color="error" sx={{ fontSize: "10px" }}>
              {(() => {
                const live = livePitchRef.current
                const lastPitch = live[live.length - 1]
                const nowMs = playback.getPlaybackPositionMs()
                const deltaLive = lastPitch ? nowMs - lastPitch.timeMs : 0
                const comp = Math.round(pitchDetection.getInputLatencyMs())
                return `dL:${Math.round(deltaLive)} comp:${comp} n:${live.length}`
              })()}
            </Typography>
          )}
        </Box>
      </Paper>

      <LyricsPanel lyricLines={lyricLines} onSeek={handleLyricSeek} />

      <Box sx={{ mt: 2, display: "flex", justifyContent: "center", gap: 2 }}>
        {hasRecording && (
          <Button component={Link} to="/playback" variant="outlined" sx={{ fontWeight: "bold" }}>
            前回の録音を再生
          </Button>
        )}
        <Button component={Link} to="/" variant="text" sx={{ fontWeight: "bold" }}>
          ← ホームへ
        </Button>
      </Box>

      <ScoreResultDialog
        open={scoreDialogOpen}
        score={lastScore}
        onSave={handleSave}
        onDiscard={() => setScoreDialogOpen(false)}
        onPlayback={handlePlayback}
      />
    </Container>
  )
}

export default Practice
