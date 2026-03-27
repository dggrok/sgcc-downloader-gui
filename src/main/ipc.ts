import { dialog, shell, ipcMain, type BrowserWindow, type OpenDialogOptions } from "electron"
import type Store from "electron-store"

import { SGCCCrawlerService } from "../crawler/service"
import { CancelledError } from "../crawler/errors"
import { normalizeErrorMessage, createTaskId } from "../crawler/utils"
import { IPC_CHANNELS } from "../shared/ipc"
import type {
  AppSettings,
  AttachmentRecord,
  DownloadOptions,
  SearchParams,
  TaskKind,
  TaskLogEvent,
  TaskProgress,
  TaskStateEvent
} from "../shared/types"
import { getAppSettings, updateAppSettings } from "./settings"

type Logger = {
  info: (...params: unknown[]) => void
  error: (...params: unknown[]) => void
}

function sendTaskProgress(window: BrowserWindow, payload: TaskProgress): void {
  window.webContents.send(IPC_CHANNELS.taskProgress, payload)
}

function sendTaskLog(window: BrowserWindow, payload: TaskLogEvent): void {
  window.webContents.send(IPC_CHANNELS.taskLog, payload)
}

function sendTaskState(window: BrowserWindow, payload: TaskStateEvent): void {
  window.webContents.send(IPC_CHANNELS.taskState, payload)
}

function emitLog(window: BrowserWindow, logger: Logger, taskId: string, message: string): void {
  logger.info(message)
  sendTaskLog(window, {
    taskId,
    message,
    at: new Date().toISOString()
  })
}

export function registerIpcHandlers(options: {
  getMainWindow: () => BrowserWindow | null
  settingsStore: Store<AppSettings>
  logDirectory: string
  logger: Logger
}): void {
  const { getMainWindow, settingsStore, logDirectory, logger } = options
  const service = new SGCCCrawlerService((message) => logger.info(message))
  const controllers = new Map<string, AbortController>()

  const withWindow = (callback: (window: BrowserWindow) => void) => {
    const currentWindow = getMainWindow()
    if (!currentWindow || currentWindow.isDestroyed()) {
      return
    }
    callback(currentWindow)
  }

  const beginTask = (kind: TaskKind, message: string) => {
    const taskId = createTaskId()
    const controller = new AbortController()
    controllers.set(taskId, controller)
    withWindow((window) =>
      sendTaskState(window, {
        taskId,
        kind,
        status: "started",
        message
      })
    )
    return { taskId, controller }
  }

  const finishTask = (taskId: string) => {
    controllers.delete(taskId)
  }

  ipcMain.handle(IPC_CHANNELS.orgLoadRoots, async () => service.loadOrgRoots())
  ipcMain.handle(IPC_CHANNELS.orgLoadChildren, async (_event, parentId: string) => service.loadOrgChildren(parentId))
  ipcMain.handle(IPC_CHANNELS.orgSearch, async (_event, keyword: string) => service.searchOrgs(keyword))

  ipcMain.handle(IPC_CHANNELS.crawlerPreview, async (_event, searchParams: SearchParams) => {
    const { taskId, controller } = beginTask("preview", "开始预览附件")

    try {
      const records = await service.previewAttachments(searchParams, {
        signal: controller.signal,
        onLog: (message) =>
          withWindow((window) => {
            emitLog(window, logger, taskId, message)
          }),
        onProgress: (progress) =>
          withWindow((window) =>
            sendTaskProgress(window, {
              taskId,
              ...progress
            })
          )
      })

      withWindow((window) =>
        sendTaskState(window, {
          taskId,
          kind: "preview",
          status: "completed",
          message: `预览完成，共 ${records.length} 个附件`
        })
      )

      return {
        taskId,
        records
      }
    } catch (error) {
      if (error instanceof CancelledError) {
        withWindow((window) =>
          sendTaskState(window, {
            taskId,
            kind: "preview",
            status: "cancelled",
            message: error.message
          })
        )
      } else {
        const message = normalizeErrorMessage(error)
        logger.error(message)
        withWindow((window) =>
          sendTaskState(window, {
            taskId,
            kind: "preview",
            status: "failed",
            message
          })
        )
      }
      throw error
    } finally {
      finishTask(taskId)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.crawlerDownload,
    async (_event, records: AttachmentRecord[], downloadOptions: DownloadOptions) => {
      const { taskId, controller } = beginTask("download", "开始下载附件")

      try {
        const result = await service.downloadAttachments(records, downloadOptions, {
          signal: controller.signal,
          onLog: (message) =>
            withWindow((window) => {
              emitLog(window, logger, taskId, message)
            }),
          onProgress: (progress) =>
            withWindow((window) =>
              sendTaskProgress(window, {
                taskId,
                ...progress
              })
            )
        })

        withWindow((window) =>
          sendTaskState(window, {
            taskId,
            kind: "download",
            status: "completed",
            message: `下载完成，成功 ${result.successCount} 个，失败 ${result.failureCount} 个`
          })
        )

        return {
          taskId,
          result
        }
      } catch (error) {
        if (error instanceof CancelledError) {
          withWindow((window) =>
            sendTaskState(window, {
              taskId,
              kind: "download",
              status: "cancelled",
              message: error.message
            })
          )
        } else {
          const message = normalizeErrorMessage(error)
          logger.error(message)
          withWindow((window) =>
            sendTaskState(window, {
              taskId,
              kind: "download",
              status: "failed",
              message
            })
          )
        }
        throw error
      } finally {
        finishTask(taskId)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.crawlerExportZip,
    async (_event, records: AttachmentRecord[], targetDir: string) => {
      const { taskId, controller } = beginTask("export", "开始导出压缩包")

      try {
        const result = await service.exportAttachmentsZip(records, targetDir, {
          signal: controller.signal,
          onLog: (message) =>
            withWindow((window) => {
              emitLog(window, logger, taskId, message)
            }),
          onProgress: (progress) =>
            withWindow((window) =>
              sendTaskProgress(window, {
                taskId,
                ...progress
              })
            )
        })

        withWindow((window) =>
          sendTaskState(window, {
            taskId,
            kind: "export",
            status: "completed",
            message: `压缩包导出完成：${result.zipPath}`
          })
        )

        return {
          taskId,
          result
        }
      } catch (error) {
        if (error instanceof CancelledError) {
          withWindow((window) =>
            sendTaskState(window, {
              taskId,
              kind: "export",
              status: "cancelled",
              message: error.message
            })
          )
        } else {
          const message = normalizeErrorMessage(error)
          logger.error(message)
          withWindow((window) =>
            sendTaskState(window, {
              taskId,
              kind: "export",
              status: "failed",
              message
            })
          )
        }
        throw error
      } finally {
        finishTask(taskId)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.crawlerCancel, async (_event, taskId: string) => {
    const controller = controllers.get(taskId)
    if (controller) {
      controller.abort()
    }
  })

  ipcMain.handle(IPC_CHANNELS.settingsGet, async () => getAppSettings(settingsStore))
  ipcMain.handle(IPC_CHANNELS.settingsSet, async (_event, partialSettings) => updateAppSettings(settingsStore, partialSettings))

  ipcMain.handle(IPC_CHANNELS.systemOpenPath, async (_event, targetPath: string) => {
    const result = await shell.openPath(targetPath)
    if (result) {
      throw new Error(result)
    }
  })

  ipcMain.handle(IPC_CHANNELS.systemChooseDirectory, async (_event, defaultPath?: string) => {
    const currentWindow = getMainWindow()
    const dialogOptions: OpenDialogOptions = {
      defaultPath,
      properties: ["openDirectory", "createDirectory"]
    }
    const result = currentWindow
      ? await dialog.showOpenDialog(currentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.systemOpenLogDir, async () => {
    const result = await shell.openPath(logDirectory)
    if (result) {
      throw new Error(result)
    }
  })
}
