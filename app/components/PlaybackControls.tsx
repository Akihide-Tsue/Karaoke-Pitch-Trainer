import Box from "@mui/material/Box"
import Button from "@mui/material/Button"

export const PlaybackControls = ({
  isPlaying,
  hasPosition,
  onStart,
  onStop,
  onResume,
  onToggleGuideVocal,
  useGuideVocal,
}: {
  isPlaying: boolean
  hasPosition: boolean
  onStart: () => void
  onStop: () => void
  onResume: () => void
  onToggleGuideVocal: () => void
  useGuideVocal: boolean
}) => (
  <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
    <Button
      variant="outlined"
      onClick={onStart}
      disabled={isPlaying}
      sx={{ fontWeight: "bold" }}
    >
      開始
    </Button>
    <Button
      variant={isPlaying ? "outlined" : "contained"}
      onClick={isPlaying ? onStop : onResume}
      disabled={!isPlaying && !hasPosition}
      sx={{ fontWeight: "bold" }}
    >
      {isPlaying ? "停止" : "再開"}
    </Button>
    <Button
      variant={useGuideVocal ? "contained" : "outlined"}
      color={useGuideVocal ? "secondary" : "primary"}
      onClick={onToggleGuideVocal}
      sx={{ fontWeight: "bold" }}
    >
      ガイド {useGuideVocal ? "ON" : "OFF"}
    </Button>
  </Box>
)
