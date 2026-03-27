import { resolve } from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig } from "electron-vite"

export default defineConfig({
  main: {
    build: {
      outDir: "out/main"
    }
  },
  preload: {
    build: {
      outDir: "out/preload"
    }
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared")
      }
    },
    build: {
      outDir: "out/renderer"
    }
  }
})
