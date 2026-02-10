import { index, type RouteConfig, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("practice", "routes/practice.tsx"),
  route("playback", "routes/playback.tsx"),
] satisfies RouteConfig
