import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import Container from "@mui/material/Container"
import Typography from "@mui/material/Typography"

type PracticeLoadingScreenProps = {
  message?: string
}

export const PracticeLoadingScreen = ({
  message = "曲を読み込み中…",
}: PracticeLoadingScreenProps) => (
  <Container
    maxWidth="md"
    sx={{
      py: 3,
      minHeight: "70vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }}
  >
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <CircularProgress />
      <Typography>{message}</Typography>
    </Box>
  </Container>
)
