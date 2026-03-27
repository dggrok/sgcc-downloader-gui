import { createWriteStream } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { pipeline } from "node:stream/promises"

import { ZipFile } from "yazl"

import type {
  AttachmentRecord,
  DownloadOptions,
  DownloadResult,
  OrgNode,
  SearchParams,
  TaskProgress,
  ZipExportResult
} from "../shared/types"
import { CancelledError, ValidationError } from "./errors"
import { SGCCApiClient } from "./api-client"
import {
  buildTimestamp,
  buildTaskSubdir,
  cleanFilename,
  ensurePdfSuffix,
  ensureUniquePath,
  normalizeErrorMessage,
  pathExists,
  sleepBetween,
  throwIfAborted,
  validateDownloadDirectory
} from "./utils"

type Logger = (message: string) => void
type ProgressHandler = (progress: Omit<TaskProgress, "taskId">) => void

type TaskHooks = {
  signal?: AbortSignal
  onProgress?: ProgressHandler
  onLog?: Logger
}

export class SGCCCrawlerService {
  private readonly apiClient: SGCCApiClient

  constructor(
    logger?: Logger,
    private readonly delayRange: [number, number] = [0.5, 1.5],
    private readonly downloadDelayRange: [number, number] = [1, 2],
    apiClient?: SGCCApiClient
  ) {
    this.apiClient = apiClient ?? new SGCCApiClient(logger)
  }

  async loadOrgRoots(signal?: AbortSignal): Promise<OrgNode[]> {
    return this.apiClient.loadOrgRoots(signal)
  }

  async loadOrgChildren(parentId: string, signal?: AbortSignal): Promise<OrgNode[]> {
    return this.apiClient.loadOrgChildren(parentId, signal)
  }

  async searchOrgs(keyword: string, signal?: AbortSignal): Promise<OrgNode[]> {
    const trimmed = keyword.trim()
    if (!trimmed) {
      throw new ValidationError("机构搜索关键字不能为空。")
    }
    return this.apiClient.searchOrgs(trimmed, signal)
  }

  async previewAttachments(searchParams: SearchParams, hooks: TaskHooks = {}): Promise<AttachmentRecord[]> {
    if (!searchParams.orgId || !searchParams.orgName) {
      throw new ValidationError("请选择机构后再查询。")
    }

    const records: AttachmentRecord[] = []
    const seen = new Set<string>()
    hooks.onLog?.(
      `开始查询公告：机构=${searchParams.orgName}(${searchParams.orgId})，关键词=${searchParams.keyword || "空"}，页数=${searchParams.maxPages}`
    )

    for (let offset = 0; offset < searchParams.maxPages; offset += 1) {
      throwIfAborted(hooks.signal)
      const page = searchParams.startPage + offset
      hooks.onProgress?.({
        stage: "page",
        current: offset,
        total: searchParams.maxPages,
        message: `正在加载第 ${page} 页公告`
      })

      const notes = await this.apiClient.getNoteList({
        page,
        size: searchParams.pageSize,
        orgId: searchParams.orgId,
        orgName: searchParams.orgName,
        keyword: searchParams.keyword,
        signal: hooks.signal
      })

      if (notes.length === 0) {
        hooks.onLog?.(`第 ${page} 页无数据，结束查询。`)
        break
      }

      for (let index = 0; index < notes.length; index += 1) {
        throwIfAborted(hooks.signal)
        const note = notes[index]
        const noticeId = String(note["noticeId"] ?? "").trim()
        const title = String(note["title"] ?? "").trim()
        if (!noticeId) {
          continue
        }

        hooks.onProgress?.({
          stage: "notice",
          current: index + 1,
          total: notes.length,
          message: `处理公告：${title || noticeId}`
        })

        const [, validFile] = await this.apiClient.getNoticeWin(noticeId, hooks.signal)
        if (!validFile) {
          hooks.onLog?.(`公告跳过：${noticeId} 无有效附件。`)
          continue
        }

        const files = await this.apiClient.getWinFile(noticeId, hooks.signal)
        for (const fileInfo of files) {
          const fileName = String(fileInfo["FILE_NAME"] ?? "").trim()
          const filePath = String(fileInfo["FILE_PATH"] ?? "").trim()
          if (!fileName || !filePath) {
            continue
          }

          const uniqueKey = `${noticeId}:${filePath}`
          if (seen.has(uniqueKey)) {
            continue
          }

          seen.add(uniqueKey)
          records.push({
            noticeId,
            noticeTitle: title,
            fileName,
            filePath,
            fullUrl: `${this.apiClient.pdfBaseUrl}${filePath}`,
            orgName: searchParams.orgName,
            selected: true,
            status: "待下载",
            localPath: "",
            errorMessage: ""
          })
        }
      }

      await sleepBetween(this.delayRange, hooks.signal)
    }

    hooks.onLog?.(`预览完成，共找到 ${records.length} 个附件。`)
    hooks.onProgress?.({
      stage: "done",
      current: records.length,
      total: records.length,
      message: `共找到 ${records.length} 个附件`
    })
    return records
  }

  async downloadAttachments(
    records: AttachmentRecord[],
    downloadOptions: DownloadOptions,
    hooks: TaskHooks = {}
  ): Promise<DownloadResult> {
    const selected = records.filter((record) => record.selected)
    if (selected.length === 0) {
      throw new ValidationError("请先勾选要下载的附件。")
    }

    let targetDir = await validateDownloadDirectory(downloadOptions.targetDir)
    if (downloadOptions.createSubdir) {
      targetDir = await validateDownloadDirectory(join(targetDir, buildTaskSubdir(selected[0].orgName)))
    }

    let successCount = 0
    let failureCount = 0

    for (let index = 0; index < selected.length; index += 1) {
      const record = selected[index]
      try {
        throwIfAborted(hooks.signal)
        record.status = "下载中"
        record.errorMessage = ""
        hooks.onProgress?.({
          stage: "download",
          current: index,
          total: selected.length,
          message: `下载文件 ${index + 1}/${selected.length}：${record.fileName}`
        })
        hooks.onLog?.(`下载文件 ${index + 1}/${selected.length}：${record.fileName}`)

        const safeName = ensurePdfSuffix(cleanFilename(record.fileName) || "未命名文件")
        const targetPath = await ensureUniquePath(join(targetDir, safeName))
        await this.apiClient.downloadFile(record.fullUrl, targetPath, hooks.signal)
        record.localPath = targetPath
        record.status = "成功"
        successCount += 1
        await sleepBetween(this.downloadDelayRange, hooks.signal)
      } catch (error) {
        if (error instanceof CancelledError) {
          record.status = "已取消"
          throw error
        }
        record.status = "失败"
        record.errorMessage = normalizeErrorMessage(error)
        failureCount += 1
        hooks.onLog?.(`下载失败：${record.fileName}，原因：${record.errorMessage}`)
      }
    }

    hooks.onProgress?.({
      stage: "done",
      current: selected.length,
      total: selected.length,
      message: `下载完成，成功 ${successCount} 个`
    })
    hooks.onLog?.(`下载完成，成功 ${successCount} 个，失败 ${failureCount} 个，目录：${targetDir}`)

    return {
      targetDir,
      successCount,
      failureCount
    }
  }

  async exportAttachmentsZip(
    records: AttachmentRecord[],
    targetDir: string,
    hooks: TaskHooks = {}
  ): Promise<ZipExportResult> {
    const selected = records.filter((record) => record.selected)
    if (selected.length === 0) {
      throw new ValidationError("请先勾选要导出的附件。")
    }

    const outputDir = await validateDownloadDirectory(targetDir)
    const zipName = `${cleanFilename(selected[0].orgName) || "附件导出"}_${buildTimestamp()}.zip`
    const zipPath = await ensureUniquePath(join(outputDir, zipName))
    const stagingDir = await mkdtemp(join(tmpdir(), "sgcc-export-"))

    let successCount = 0
    let failureCount = 0
    const collectedFiles: Array<{ sourcePath: string; archiveName: string }> = []
    const usedArchiveNames = new Set<string>()

    try {
      for (let index = 0; index < selected.length; index += 1) {
        const record = selected[index]
        try {
          throwIfAborted(hooks.signal)
          record.status = "导出中"
          record.errorMessage = ""
          hooks.onProgress?.({
            stage: "download",
            current: index,
            total: selected.length,
            message: `准备导出 ${index + 1}/${selected.length}：${record.fileName}`
          })
          hooks.onLog?.(`准备导出 ${index + 1}/${selected.length}：${record.fileName}`)

          let sourcePath = record.localPath
          if (!sourcePath || !(await pathExists(sourcePath))) {
            const safeName = ensurePdfSuffix(cleanFilename(record.fileName) || "未命名文件")
            sourcePath = await ensureUniquePath(join(stagingDir, safeName))
            await this.apiClient.downloadFile(record.fullUrl, sourcePath, hooks.signal)
          }

          const archiveName = this.createUniqueArchiveName(record.fileName, usedArchiveNames)
          collectedFiles.push({
            sourcePath,
            archiveName
          })
          record.status = "待下载"
          successCount += 1
        } catch (error) {
          if (error instanceof CancelledError) {
            record.status = "已取消"
            throw error
          }
          record.status = "失败"
          record.errorMessage = normalizeErrorMessage(error)
          failureCount += 1
          hooks.onLog?.(`导出准备失败：${record.fileName}，原因：${record.errorMessage}`)
        }
      }

      if (collectedFiles.length === 0) {
        throw new ValidationError("没有可导出的有效附件。")
      }

      hooks.onProgress?.({
        stage: "zip",
        current: 0,
        total: collectedFiles.length,
        message: `开始生成压缩包：${basename(zipPath)}`
      })

      await this.writeZipFile(collectedFiles, zipPath, hooks)

      hooks.onProgress?.({
        stage: "done",
        current: collectedFiles.length,
        total: collectedFiles.length,
        message: `压缩包导出完成：${basename(zipPath)}`
      })
      hooks.onLog?.(`压缩包导出完成：${zipPath}`)

      return {
        zipPath,
        successCount,
        failureCount
      }
    } finally {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private createUniqueArchiveName(fileName: string, usedArchiveNames: Set<string>): string {
    const safeName = ensurePdfSuffix(cleanFilename(fileName) || "未命名文件")
    if (!usedArchiveNames.has(safeName)) {
      usedArchiveNames.add(safeName)
      return safeName
    }

    let counter = 1
    const dotIndex = safeName.lastIndexOf(".")
    const namePart = dotIndex >= 0 ? safeName.slice(0, dotIndex) : safeName
    const extPart = dotIndex >= 0 ? safeName.slice(dotIndex) : ""

    while (true) {
      const candidate = `${namePart}_${counter}${extPart}`
      if (!usedArchiveNames.has(candidate)) {
        usedArchiveNames.add(candidate)
        return candidate
      }
      counter += 1
    }
  }

  private async writeZipFile(
    files: Array<{ sourcePath: string; archiveName: string }>,
    zipPath: string,
    hooks: TaskHooks
  ): Promise<void> {
    const zipFile = new ZipFile()
    const outputStream = createWriteStream(zipPath)

    files.forEach((file) => {
      zipFile.addFile(file.sourcePath, file.archiveName)
    })

    zipFile.end()

    let processed = 0
    zipFile.outputStream.on("data", () => {
      throwIfAborted(hooks.signal)
    })
    outputStream.on("close", () => {
      processed = files.length
      hooks.onProgress?.({
        stage: "zip",
        current: processed,
        total: files.length,
        message: `已写入 ${processed}/${files.length} 个文件到压缩包`
      })
    })

    await pipeline(zipFile.outputStream, outputStream)
  }
}
