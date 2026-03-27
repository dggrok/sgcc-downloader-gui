import Store from "electron-store"

import type { AppSettings, PartialSettings } from "../shared/types"

export type WindowState = {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

export function createSettingsStore(defaultDownloadDir: string): Store<AppSettings> {
  return new Store<AppSettings>({
    name: "sgcc-desktop-settings",
    defaults: {
      downloadDir: defaultDownloadDir,
      createSubdir: true,
      keyword: "",
      manualOrgName: "",
      manualOrgId: "",
      startPage: 1,
      pageSize: 10,
      maxPages: 1,
      windowState: {
        width: 1480,
        height: 920
      }
    }
  })
}

export function getAppSettings(store: Store<AppSettings>): AppSettings {
  const settings = store.store
  return {
    downloadDir: settings.downloadDir,
    createSubdir: settings.createSubdir,
    keyword: settings.keyword,
    manualOrgName: settings.manualOrgName,
    manualOrgId: settings.manualOrgId,
    startPage: settings.startPage,
    pageSize: settings.pageSize,
    maxPages: settings.maxPages,
    windowState: settings.windowState
  }
}

export function updateAppSettings(store: Store<AppSettings>, partialSettings: PartialSettings): AppSettings {
  for (const [key, value] of Object.entries(partialSettings)) {
    if (value === undefined) {
      continue
    }
    store.set(key as keyof AppSettings, value as never)
  }
  return getAppSettings(store)
}
