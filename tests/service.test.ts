import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { afterEach, describe, expect, it } from "vitest"

import type { AttachmentRecord, OrgNode, SearchParams } from "../src/shared/types"
import { SGCCCrawlerService } from "../src/crawler/service"

class FakeApiClient {
  readonly pdfBaseUrl = "https://example.com/showPDF?filePath="

  async loadOrgRoots(): Promise<OrgNode[]> {
    return []
  }

  async loadOrgChildren(): Promise<OrgNode[]> {
    return []
  }

  async searchOrgs(): Promise<OrgNode[]> {
    return []
  }

  async getNoteList(params: { page: number }): Promise<Array<Record<string, string>>> {
    if (params.page > 1) {
      return []
    }

    return [
      { noticeId: "N001", title: "第一次公告" },
      { noticeId: "N002", title: "第二次公告" }
    ]
  }

  async getNoticeWin(noticeId: string): Promise<[Record<string, unknown>, boolean]> {
    return [{}, noticeId === "N001"]
  }

  async getWinFile(): Promise<Array<Record<string, string>>> {
    return [
      { FILE_NAME: "中标结果公告", FILE_PATH: "/docs/a.pdf" },
      { FILE_NAME: "中标结果公告", FILE_PATH: "/docs/a.pdf" }
    ]
  }

  async downloadFile(_pdfUrl: string, destination: string): Promise<void> {
    await writeFile(destination, "pdf", "utf8")
  }
}

const tempDirectories: string[] = []

function createService() {
  return new SGCCCrawlerService(undefined, [0, 0], [0, 0], new FakeApiClient() as never)
}

afterEach(async () => {
  while (tempDirectories.length > 0) {
    const current = tempDirectories.pop()
    if (current) {
      await rm(current, { recursive: true, force: true })
    }
  }
})

describe("SGCCCrawlerService", () => {
  it("deduplicates preview attachments and skips invalid notices", async () => {
    const service = createService()
    const params: SearchParams = {
      orgId: "1001",
      orgName: "国网湖北省电力有限公司",
      keyword: "物资",
      startPage: 1,
      pageSize: 10,
      maxPages: 1
    }

    const records = await service.previewAttachments(params)

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      noticeId: "N001",
      fileName: "中标结果公告",
      status: "待下载"
    })
  })

  it("creates unique filenames while downloading", async () => {
    const service = createService()
    const tempDir = await mkdtemp(join(tmpdir(), "sgcc-desktop-test-"))
    tempDirectories.push(tempDir)

    const records: AttachmentRecord[] = [
      {
        noticeId: "N001",
        noticeTitle: "第一次公告",
        fileName: "中标结果公告",
        filePath: "/docs/a.pdf",
        fullUrl: "https://example.com/a.pdf",
        orgName: "国网湖北省电力有限公司",
        selected: true,
        status: "待下载",
        localPath: "",
        errorMessage: ""
      },
      {
        noticeId: "N002",
        noticeTitle: "第二次公告",
        fileName: "中标结果公告",
        filePath: "/docs/b.pdf",
        fullUrl: "https://example.com/b.pdf",
        orgName: "国网湖北省电力有限公司",
        selected: true,
        status: "待下载",
        localPath: "",
        errorMessage: ""
      }
    ]

    const result = await service.downloadAttachments(records, {
      targetDir: tempDir,
      createSubdir: false
    })

    expect(result.successCount).toBe(2)
    expect(result.failureCount).toBe(0)
    expect(records[0].localPath).not.toBe(records[1].localPath)
    expect(await readFile(records[0].localPath, "utf8")).toBe("pdf")
    expect(await readFile(records[1].localPath, "utf8")).toBe("pdf")
  })

  it("exports selected attachments as a zip file", async () => {
    const service = createService()
    const tempDir = await mkdtemp(join(tmpdir(), "sgcc-desktop-export-"))
    tempDirectories.push(tempDir)

    const records: AttachmentRecord[] = [
      {
        noticeId: "N001",
        noticeTitle: "第一次公告",
        fileName: "中标结果公告",
        filePath: "/docs/a.pdf",
        fullUrl: "https://example.com/a.pdf",
        orgName: "国网湖北省电力有限公司",
        selected: true,
        status: "待下载",
        localPath: "",
        errorMessage: ""
      },
      {
        noticeId: "N002",
        noticeTitle: "第二次公告",
        fileName: "供货清单",
        filePath: "/docs/b.pdf",
        fullUrl: "https://example.com/b.pdf",
        orgName: "国网湖北省电力有限公司",
        selected: true,
        status: "待下载",
        localPath: "",
        errorMessage: ""
      }
    ]

    const result = await service.exportAttachmentsZip(records, tempDir)
    const zipBuffer = await readFile(result.zipPath)

    expect(result.successCount).toBe(2)
    expect(result.failureCount).toBe(0)
    expect(result.zipPath).toMatch(/国网湖北省电力有限公司_\d{8}_\d{6}\.zip$/)
    expect(zipBuffer.subarray(0, 2).toString("utf8")).toBe("PK")
  })
})
