import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Container from "@mui/material/Container"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { Link } from "react-router"
import {
  CHECK_CIRCLE_FILL,
  CHECK_CIRCLE_STROKE,
} from "~/constants/colors"
import { SONG_TITLE } from "~/constants/songs/brand-new-music"
import type { Route } from "./+types/home"

export const meta = (_args: Route.MetaArgs) => {
  return [
    { title: "カラオケ風音程練習アプリ" },
    {
      name: "description",
      content: "音程を練習して採点するカラオケ風アプリ",
    },
  ]
}

const Home = () => {
  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80vh",
          py: 3,
        }}
      >
        <Typography component="h1" variant="h5" gutterBottom>
          ボイストレーニングPoC
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          曲選択・曲設定の後、「練習する」で練習画面へ
        </Typography>

        <Paper sx={{ p: 2, width: "100%", mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            曲選択
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="選択済み"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                fill={CHECK_CIRCLE_FILL}
                stroke={CHECK_CIRCLE_STROKE}
                strokeWidth={1.5}
              />
              <path
                d="M8 12l3 3 5-6"
                stroke="white"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <Typography variant="body1">{SONG_TITLE}</Typography>
          </Box>
        </Paper>

        <Button
          component={Link}
          to="/practice"
          variant="contained"
          size="large"
          fullWidth
          sx={{ fontWeight: "bold" }}
        >
          練習する
        </Button>
      </Box>
    </Container>
  )
}

export default Home
