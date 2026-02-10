import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Slider from "@mui/material/Slider"
import Typography from "@mui/material/Typography"

/**
 * 練習画面のコントロールボタン群。
 * 開始・停止・再開・ガイド ON/OFF・秒送り・戻し・音量を提供する。
 *
 * @param onStart - 開始ボタンクリック時
 * @param onStop - 停止ボタンクリック時
 * @param onResume - 再開ボタンクリック時
 * @param onToggleGuideVocal - ガイドボタンクリック時
 * @param onSeekBackward - 秒戻すボタンクリック時
 * @param onSeekForward - 秒送るボタンクリック時
 * @param useGuideVocal - ガイドボーカル ON かどうか
 * @param seekSeconds - 秒送り・戻しの単位（表示用）
 * @param volume - 再生音量（0〜1）
 * @param onVolumeChange - 音量変更時
 * @param recordingMode - 録音モード ON かどうか
 * @param onRecordingModeChange - 録音モード変更時
 * @param disabled - 各ボタンの無効化条件
 */
export const PracticeControls = ({
  onStart,
  onStop,
  onResume,
  onToggleGuideVocal,
  onSeekBackward,
  onSeekForward,
  useGuideVocal,
  seekSeconds,
  volume,
  onVolumeChange,
  recordingMode,
  onRecordingModeChange,
  disabled,
}: {
  onStart: () => void
  onStop: () => void
  onResume: () => void
  onToggleGuideVocal: () => void
  onSeekBackward: () => void
  onSeekForward: () => void
  useGuideVocal: boolean
  seekSeconds: number
  volume: number
  onVolumeChange: (_: Event, value: number | number[]) => void
  recordingMode: boolean
  onRecordingModeChange: (checked: boolean) => void
  disabled: {
    hasMelodyData: boolean
    isPracticing: boolean
    positionMs: number
    totalDurationMs: number
  }
}) => (
  <Box sx={{ mb: 2 }}>
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
      <Button
        variant="contained"
        onClick={onStart}
        disabled={!disabled.hasMelodyData || disabled.isPracticing}
        sx={{ fontWeight: "bold" }}
      >
        開始
      </Button>
      <Button
        variant="outlined"
        onClick={onStop}
        disabled={!disabled.isPracticing}
        sx={{ fontWeight: "bold" }}
      >
        停止
      </Button>
      <Button
        variant="contained"
        onClick={onResume}
        disabled={
          !disabled.hasMelodyData ||
          disabled.isPracticing ||
          disabled.positionMs <= 0
        }
        sx={{ fontWeight: "bold" }}
      >
        再開
      </Button>
      <Button
        variant={useGuideVocal ? "contained" : "outlined"}
        color={useGuideVocal ? "secondary" : "primary"}
        onClick={onToggleGuideVocal}
        sx={{ fontWeight: "bold" }}
      >
        ガイド {useGuideVocal ? "ON" : "OFF"}
      </Button>
      <Button
        variant="outlined"
        onClick={onSeekBackward}
        disabled={!disabled.hasMelodyData || disabled.totalDurationMs <= 0}
        sx={{
          fontWeight: "bold",
          // 一時的に非表示
          display: "none",
        }}
      >
        {seekSeconds}秒戻す
      </Button>
      <Button
        variant="outlined"
        onClick={onSeekForward}
        disabled={!disabled.hasMelodyData || disabled.totalDurationMs <= 0}
        sx={{
          fontWeight: "bold",
          // 一時的に非表示
          display: "none",
        }}
      >
        {seekSeconds}秒送る
      </Button>
    </Box>
    <Box
      sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          minWidth: 200,
          flex: "1 1 200px",
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ minWidth: 40 }}
        >
          音量
        </Typography>
        <Slider
          sx={{ width: 120 }}
          value={volume}
          onChange={onVolumeChange}
          min={0}
          max={1}
          step={0.05}
          size="small"
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
        />
      </Box>
      <FormControlLabel
        // 一時的に非表示
        sx={{ display: "none" }}
        control={
          <Checkbox
            checked={recordingMode}
            onChange={(_, checked) => onRecordingModeChange(checked)}
          />
        }
        label="録音モード"
      />
    </Box>
  </Box>
)
