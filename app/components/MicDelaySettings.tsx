import Box from "@mui/material/Box"
import Dialog from "@mui/material/Dialog"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import IconButton from "@mui/material/IconButton"
import Slider from "@mui/material/Slider"
import Typography from "@mui/material/Typography"
import { useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"
import { micDelayMsAtom } from "~/stores/practice"

/** スライダー範囲: 0.1s 〜 0.5s（100ms 刻み） */
const MIN_MS = 100
const MAX_MS = 500
const STEP_MS = 100

const marks = [100, 200, 300, 400, 500].map((ms) => ({
  value: ms,
  label: `${ms / 1000}s`,
}))

/** マイク遅延調整ダイアログ */
export const MicDelaySettings = () => {
  const [open, setOpen] = useState(false)
  const micDelayMs = useAtomValue(micDelayMsAtom)
  const setMicDelayMs = useSetAtom(micDelayMsAtom)
  const sliderValue = Math.min(MAX_MS, Math.max(MIN_MS, micDelayMs))

  return (
    <>
      <IconButton onClick={() => setOpen(true)} aria-label="設定を開く" size="small">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden role="img">
          <title>設定</title>
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </svg>
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>設定</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              マイク遅延
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              歌唱と音程バーの表示ズレを補正します。イヤホン利用時は手動で 0.1s
              刻みのいずれかに合わせてください。
            </Typography>
            <Slider
              value={sliderValue}
              onChange={(_, v) => setMicDelayMs(Array.isArray(v) ? v[0] : v)}
              min={MIN_MS}
              max={MAX_MS}
              step={STEP_MS}
              marks={marks}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v / 1000}s`}
              sx={{ my: 1 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              現在: {(sliderValue / 1000).toFixed(1)}s
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  )
}
