import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"

/**
 * 3行歌詞表示用の型。
 * getLyricLines の戻り値と同じ構造。
 */
export type LyricLines = {
  prev: { text: string; timeMs: number } | null
  current: { text: string; timeMs: number }
  next: { text: string; timeMs: number } | null
}

/**
 * 歌詞パネルコンポーネント。
 * 前・現在・次の3行を表示し、クリックで該当位置へシークする。
 * 中央行（現在歌っている行）は太字で強調する。
 *
 * @param lyricLines - getLyricLines で取得した3行データ
 * @param onSeek - 行クリック時に呼ばれるコールバック。引数は timeMs（ミリ秒）
 */
export const LyricsPanel = ({
  lyricLines,
  onSeek,
}: {
  lyricLines: LyricLines
  onSeek: (timeMs: number) => void
}) => (
  <Paper sx={{ p: 2 }}>
    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
      歌詞
    </Typography>
    <Box
      sx={{
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          minHeight: 32,
          cursor: lyricLines.prev ? "pointer" : "default",
        }}
        onClick={() => lyricLines.prev && onSeek(lyricLines.prev.timeMs)}
      >
        {lyricLines.prev?.text || "—"}
      </Typography>
      <Typography
        variant="body1"
        fontWeight="bold"
        sx={{ minHeight: 32, cursor: "pointer" }}
        onClick={() => onSeek(lyricLines.current.timeMs)}
      >
        {lyricLines.current.text || "—"}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          minHeight: 32,
          cursor: lyricLines.next ? "pointer" : "default",
        }}
        onClick={() => lyricLines.next && onSeek(lyricLines.next.timeMs)}
      >
        {lyricLines.next?.text || "—"}
      </Typography>
    </Box>
  </Paper>
)
