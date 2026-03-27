import { BrowserWindow, app, nativeImage } from "electron"

import { APP_NAME } from "../shared/app-meta"
import { resolveRuntimeAssetPath } from "./assets"
import { registerIpcHandlers } from "./ipc"
import { configureLogger, getLogDirectory } from "./logger"
import { createSettingsStore, getAppSettings } from "./settings"
import { createMainWindow } from "./window"

async function bootstrap(): Promise<void> {
  app.setName(APP_NAME)
  await app.whenReady()

  if (process.platform === "darwin") {
    const dockIcon = nativeImage.createFromPath(resolveRuntimeAssetPath("app_preview.png"))
    if (!dockIcon.isEmpty() && app.dock) {
      app.dock.setIcon(dockIcon)
    }
  }

  const logger = configureLogger(app)
  const defaultDownloadDir = `${app.getPath("downloads")}/${APP_NAME}`
  const settingsStore = createSettingsStore(defaultDownloadDir)
  const logDirectory = getLogDirectory()
  let mainWindow: BrowserWindow | null = null

  const mountWindowLifecycle = (window: BrowserWindow) => {
    window.on("close", () => {
      const bounds = window.getBounds()
      settingsStore.set("windowState", {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: window.isMaximized()
      })
    })
    window.on("closed", () => {
      mainWindow = null
    })
  }

  const createTrackedWindow = () => {
    const window = createMainWindow(getAppSettings(settingsStore))
    mountWindowLifecycle(window)
    mainWindow = window
    return window
  }

  createTrackedWindow()

  registerIpcHandlers({
    getMainWindow: () => mainWindow,
    settingsStore,
    logDirectory,
    logger
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createTrackedWindow()
    }
  })

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })
}

void bootstrap()
