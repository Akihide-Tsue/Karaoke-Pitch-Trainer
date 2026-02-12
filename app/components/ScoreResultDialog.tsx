import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import Typography from "@mui/material/Typography"
import { useState } from "react"

interface ScoreResultDialogProps {
  open: boolean
  score: number
  onSave: () => Promise<void>
  onDiscard: () => void
  onPlayback: () => void
}

export const ScoreResultDialog = ({
  open,
  score,
  onSave,
  onDiscard,
  onPlayback,
}: ScoreResultDialogProps) => {
  const [phase, setPhase] = useState<"result" | "saved">("result")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave()
      setPhase("saved")
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setPhase("result")
    onDiscard()
  }

  const handlePlayback = () => {
    setPhase("result")
    onPlayback()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: "center" }}>練習結果</DialogTitle>
      <DialogContent>
        {phase === "result" ? (
          <>
            <Typography variant="body1" align="center" gutterBottom>
              音程一致率
            </Typography>
            <Typography
              variant="h2"
              align="center"
              fontWeight="bold"
              sx={{ my: 2 }}
            >
              {score}%
            </Typography>
          </>
        ) : (
          <Typography align="center" sx={{ my: 2 }}>
            保存しました
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "center", pb: 2 }}>
        {phase === "result" ? (
          <>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving}
              sx={{ fontWeight: "bold" }}
            >
              保存する
            </Button>
            <Button
              variant="outlined"
              onClick={handleClose}
              sx={{ fontWeight: "bold" }}
            >
              保存しない
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="contained"
              onClick={handlePlayback}
              sx={{ fontWeight: "bold" }}
            >
              今すぐ再生
            </Button>
            <Button
              variant="outlined"
              onClick={handleClose}
              sx={{ fontWeight: "bold" }}
            >
              閉じる
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
