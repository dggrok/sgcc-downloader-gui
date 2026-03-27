import { existsSync } from "node:fs"
import { join } from "node:path"

import { app } from "electron"

export function resolveRuntimeAssetPath(fileName: string): string {
  const packagedPath = join(process.resourcesPath, "app-assets", fileName)
  if (app.isPackaged && existsSync(packagedPath)) {
    return packagedPath
  }

  return join(__dirname, "../../assets", fileName)
}
