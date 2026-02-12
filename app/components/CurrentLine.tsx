import Box from "@mui/material/Box"
import { POSITION_RATIO } from "~/components/PitchBar"
import { PITCH_POSITION_LINE } from "~/constants/colors"

/**
 * 現在位置を示す縦線。親が position: relative のコンテナ内で、
 * PitchBar の POSITION_RATIO に合わせて固定表示する。PitchBar のスクロールとは独立したレイヤー。
 */
export function CurrentLine() {
  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        isolation: "isolate",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: `${POSITION_RATIO * 100}%`,
          top: 0,
          bottom: 0,
          width: 2,
          borderLeft: `1px solid ${PITCH_POSITION_LINE}`,
          transform: "translateX(-50%)",
        }}
      />
    </Box>
  )
}
