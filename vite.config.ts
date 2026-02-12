import { reactRouter } from "@react-router/dev/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [reactRouter(), tsconfigPaths()],
  resolve: {
    alias: {
      // @tonejs/midi の ESM が Vite で正しく解決されないため CommonJS ビルドを指定
      "@tonejs/midi": "@tonejs/midi/build/Midi.js",
    },
  },
  optimizeDeps: {
    include: ["@tonejs/midi"],
  },
})
