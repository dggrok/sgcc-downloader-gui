export type TaskKind = "preview" | "download" | "export"
export type TaskStatus = "started" | "completed" | "failed" | "cancelled"
export type TaskStage = "page" | "notice" | "download" | "zip" | "done"

export type OrgNode = {
  id: string
  name: string
  parentId?: string
  hasChildren: boolean
  raw?: Record<string, unknown>
}

export type SearchParams = {
  orgId: string
  orgName: string
  keyword: string
  startPage: number
  pageSize: number
  maxPages: number
}

export type AttachmentRecord = {
  noticeId: string
  noticeTitle: string
  fileName: string
  filePath: string
  fullUrl: string
  orgName: string
  selected: boolean
  status: string
  localPath: string
  errorMessage: string
}

export type DownloadOptions = {
  targetDir: string
  createSubdir: boolean
}

export type TaskProgress = {
  taskId: string
  stage: TaskStage
  current: number
  total: number
  message: string
}

export type DownloadResult = {
  targetDir: string
  successCount: number
  failureCount: number
}

export type ZipExportResult = {
  zipPath: string
  successCount: number
  failureCount: number
}

export type AppSettings = {
  downloadDir: string
  createSubdir: boolean
  keyword: string
  manualOrgName: string
  manualOrgId: string
  startPage: number
  pageSize: number
  maxPages: number
  windowState?: Record<string, unknown>
}

export type PreviewResponse = {
  taskId: string
  records: AttachmentRecord[]
}

export type DownloadResponse = {
  taskId: string
  result: DownloadResult
}

export type ExportZipResponse = {
  taskId: string
  result: ZipExportResult
}

export type TaskLogEvent = {
  taskId: string
  message: string
  at: string
}

export type TaskStateEvent = {
  taskId: string
  kind: TaskKind
  status: TaskStatus
  message: string
}

export type PartialSettings = Partial<AppSettings>
