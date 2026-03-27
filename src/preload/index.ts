import { contextBridge, ipcRenderer } from "electron"

import { IPC_CHANNELS, type DesktopApi } from "../shared/ipc"
import type { AttachmentRecord, DownloadOptions, PartialSettings, SearchParams, TaskLogEvent, TaskProgress, TaskStateEvent } from "../shared/types"

function subscribe<T>(channel: string, handler: (event: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => {
    handler(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: DesktopApi = {
  org: {
    loadRoots: () => ipcRenderer.invoke(IPC_CHANNELS.orgLoadRoots),
    loadChildren: (parentId: string) => ipcRenderer.invoke(IPC_CHANNELS.orgLoadChildren, parentId),
    search: (keyword: string) => ipcRenderer.invoke(IPC_CHANNELS.orgSearch, keyword)
  },
  crawler: {
    preview: (searchParams: SearchParams) => ipcRenderer.invoke(IPC_CHANNELS.crawlerPreview, searchParams),
    download: (records: AttachmentRecord[], downloadOptions: DownloadOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.crawlerDownload, records, downloadOptions),
    exportZip: (records: AttachmentRecord[], targetDir: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.crawlerExportZip, records, targetDir),
    cancel: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.crawlerCancel, taskId)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    set: (partialSettings: PartialSettings) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, partialSettings)
  },
  system: {
    openPath: (targetPath: string) => ipcRenderer.invoke(IPC_CHANNELS.systemOpenPath, targetPath),
    chooseDirectory: (defaultPath?: string) => ipcRenderer.invoke(IPC_CHANNELS.systemChooseDirectory, defaultPath),
    openLogDir: () => ipcRenderer.invoke(IPC_CHANNELS.systemOpenLogDir)
  },
  events: {
    onTaskProgress: (handler: (event: TaskProgress) => void) => subscribe(IPC_CHANNELS.taskProgress, handler),
    onTaskLog: (handler: (event: TaskLogEvent) => void) => subscribe(IPC_CHANNELS.taskLog, handler),
    onTaskState: (handler: (event: TaskStateEvent) => void) => subscribe(IPC_CHANNELS.taskState, handler)
  }
}

contextBridge.exposeInMainWorld("sgcc", api)
