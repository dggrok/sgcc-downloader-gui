import { join } from "node:path"

import { BrowserWindow } from "electron"

import type { AppSettings } from "../shared/types"
import { resolveRuntimeAssetPath } from "./assets"
import type { WindowState } from "./settings"

export function createMainWindow(settings: AppSettings): BrowserWindow {
  const windowState = (settings.windowState ?? {}) as WindowState
  const mainWindow = new BrowserWindow({
    width: windowState.width ?? 1480,
    height: windowState.height ?? 920,
    minWidth: 1220,
    minHeight: 760,
    icon: resolveRuntimeAssetPath(process.platform === "darwin" ? "app_preview.png" : "app.ico"),
    x: typeof windowState.x === "number" ? windowState.x : undefined,
    y: typeof windowState.y === "number" ? windowState.y : undefined,
    backgroundColor: "#ede4d6",
    titleBarStyle: "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }

  return mainWindow
}
