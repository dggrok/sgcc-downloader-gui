import { dirname, join } from "node:path"
import { mkdirSync } from "node:fs"

import type { App } from "electron"
import log from "electron-log/main"

import { APP_NAME } from "../shared/app-meta"

export function configureLogger(app: App) {
  const logDir = join(app.getPath("logs"), APP_NAME)
  mkdirSync(logDir, { recursive: true })

  log.initialize()
  log.transports.file.level = "info"
  log.transports.file.resolvePathFn = () => join(logDir, "app.log")

  return log
}

export function getLogDirectory(): string {
  return dirname(log.transports.file.getFile().path)
}
