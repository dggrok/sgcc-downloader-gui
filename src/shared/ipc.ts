import type {
  AppSettings,
  AttachmentRecord,
  DownloadOptions,
  DownloadResponse,
  ExportZipResponse,
  OrgNode,
  PartialSettings,
  PreviewResponse,
  SearchParams,
  TaskLogEvent,
  TaskProgress,
  TaskStateEvent
} from "./types"

export const IPC_CHANNELS = {
  orgLoadRoots: "org:load-roots",
  orgLoadChildren: "org:load-children",
  orgSearch: "org:search",
  crawlerPreview: "crawler:preview",
  crawlerDownload: "crawler:download",
  crawlerExportZip: "crawler:export-zip",
  crawlerCancel: "crawler:cancel",
  settingsGet: "settings:get",
  settingsSet: "settings:set",
  systemOpenPath: "system:open-path",
  systemChooseDirectory: "system:choose-directory",
  systemOpenLogDir: "system:open-log-dir",
  taskProgress: "events:task-progress",
  taskLog: "events:task-log",
  taskState: "events:task-state"
} as const

export type DesktopApi = {
  org: {
    loadRoots: () => Promise<OrgNode[]>
    loadChildren: (parentId: string) => Promise<OrgNode[]>
    search: (keyword: string) => Promise<OrgNode[]>
  }
  crawler: {
    preview: (searchParams: SearchParams) => Promise<PreviewResponse>
    download: (records: AttachmentRecord[], downloadOptions: DownloadOptions) => Promise<DownloadResponse>
    exportZip: (records: AttachmentRecord[], targetDir: string) => Promise<ExportZipResponse>
    cancel: (taskId: string) => Promise<void>
  }
  settings: {
    get: () => Promise<AppSettings>
    set: (partialSettings: PartialSettings) => Promise<AppSettings>
  }
  system: {
    openPath: (path: string) => Promise<void>
    chooseDirectory: (defaultPath?: string) => Promise<string | null>
    openLogDir: () => Promise<void>
  }
  events: {
    onTaskProgress: (handler: (event: TaskProgress) => void) => () => void
    onTaskLog: (handler: (event: TaskLogEvent) => void) => () => void
    onTaskState: (handler: (event: TaskStateEvent) => void) => () => void
  }
}
