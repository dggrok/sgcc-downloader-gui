import { createWriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import axios, { AxiosError, type AxiosResponse, type Method } from "axios"
import { wrapper } from "axios-cookiejar-support"
import { CookieJar } from "tough-cookie"

import type { OrgNode } from "../shared/types"
import { CancelledError, RequestError } from "./errors"
import { generateRandomCookie, normalizeErrorMessage, removeIfExists, throwIfAborted } from "./utils"

const IS_MAC = process.platform === "darwin"
const DESKTOP_USER_AGENT = IS_MAC
  ? [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "AppleWebKit/537.36 (KHTML, like Gecko)",
      "Chrome/146.0.0.0 Safari/537.36"
    ].join(" ")
  : [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "AppleWebKit/537.36 (KHTML, like Gecko)",
      "Chrome/138.0.0.0 Safari/537.36"
    ].join(" ")

const SEC_CH_UA = IS_MAC
  ? "\"Chromium\";v=\"146\", \"Not-A.Brand\";v=\"24\", \"Google Chrome\";v=\"146\""
  : "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\""

const SEC_CH_PLATFORM = IS_MAC ? "\"macOS\"" : "\"Windows\""
const PORTAL_REFERER = IS_MAC
  ? "https://ecp.sgcc.com.cn/ecp2.0//portal/"
  : "https://ecp.sgcc.com.cn/ecp2.0/portal/"

type Logger = (message: string) => void
type JsonMap = Record<string, unknown>
type PayloadCandidate = {
  mode: "json" | "data"
  value: unknown
}

type RequestOptions = {
  method: Method
  url: string
  jsonData?: unknown
  rawData?: unknown
  stream?: boolean
  timeout?: number
  expectJson?: boolean
  headers?: Record<string, string>
  signal?: AbortSignal
}

export function parseOrgNodes(data: unknown, parentId?: string): OrgNode[] {
  return extractList(data).flatMap((item) => {
    const orgId = String(
      item["orgId"] ?? item["id"] ?? item["value"] ?? item["orgCode"] ?? item["ID"] ?? ""
    ).trim()
    const name = String(
      item["orgName"] ?? item["name"] ?? item["label"] ?? item["title"] ?? item["NAME"] ?? ""
    ).trim()
    const derivedParentId = String(item["parentId"] ?? item["PID"] ?? "").trim()

    if (!orgId || !name) {
      return []
    }

    let hasChildren = Boolean(
      item["hasChildren"] ?? item["isParent"] ?? item["childFlag"] ?? item["children"]
    )
    if (Object.prototype.hasOwnProperty.call(item, "leaf")) {
      hasChildren = !Boolean(item["leaf"])
    }

    return [
      {
        id: orgId,
        name,
        parentId: parentId ?? (derivedParentId || undefined),
        hasChildren,
        raw: item
      }
    ]
  })
}

function extractList(data: unknown): JsonMap[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is JsonMap => Boolean(item) && typeof item === "object")
  }

  if (!data || typeof data !== "object") {
    return []
  }

  const record = data as JsonMap
  for (const key of ["resultValue", "data", "rows", "list", "treeList", "orgList", "children", "items"]) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value.filter((item): item is JsonMap => Boolean(item) && typeof item === "object")
    }
    if (value && typeof value === "object") {
      const nested = extractList(value)
      if (nested.length > 0) {
        return nested
      }
    }
  }

  return []
}

export class SGCCApiClient {
  private readonly jar = new CookieJar()
  private readonly client = wrapper(
    axios.create({
      jar: this.jar,
      withCredentials: true,
      validateStatus: () => true
    })
  )

  private readonly logger?: Logger

  readonly baseUrl = "https://ecp.sgcc.com.cn/ecp2.0/ecpwcmcore//index"
  readonly pdfBaseUrl = "https://ecp.sgcc.com.cn/ecp2.0/ecpwcmcore/index/showPDF?filePath="
  readonly headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    Connection: "keep-alive",
    "Content-Type": "application/json",
    Origin: "https://ecp.sgcc.com.cn",
    Referer: PORTAL_REFERER,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": DESKTOP_USER_AGENT,
    "sec-ch-ua": SEC_CH_UA,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": SEC_CH_PLATFORM
  }

  constructor(logger?: Logger, private readonly retryLimit = 3) {
    this.logger = logger
  }

  private log(message: string): void {
    this.logger?.(message)
  }

  private async updateCookie(cookie: string): Promise<void> {
    const cookieValue = cookie.includes("=") ? cookie.split("=")[1] : cookie
    await this.jar.setCookie(`JSESSIONID=${cookieValue}`, "https://ecp.sgcc.com.cn")
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof CancelledError || (axios.isAxiosError(error) && error.code === "ERR_CANCELED")
  }

  private async requestWithRetry<T = unknown>({
    method,
    url,
    jsonData,
    rawData,
    stream = false,
    timeout = 15_000,
    expectJson = true,
    headers,
    signal
  }: RequestOptions): Promise<T> {
    let lastError: Error | undefined
    const mergedHeaders = headers ?? this.headers

    await this.updateCookie(generateRandomCookie())

    for (let attempt = 1; attempt <= this.retryLimit; attempt += 1) {
      try {
        throwIfAborted(signal)

        const response = await this.client.request<string | Readable>({
          method,
          url,
          data: jsonData ?? rawData,
          headers: mergedHeaders,
          timeout,
          signal,
          responseType: stream ? "stream" : "text",
          transformResponse: [(value) => value]
        })

        if (response.status === 403) {
          await this.updateCookie(generateRandomCookie())
          throw new RequestError("403 Forbidden，已刷新 Cookie。")
        }

        if (response.status < 200 || response.status >= 300) {
          throw new RequestError(`请求失败，状态码 ${response.status}`)
        }

        if (stream) {
          return response as T
        }

        if (!expectJson) {
          return response.data as T
        }

        try {
          return JSON.parse(String(response.data ?? "")) as T
        } catch (error) {
          throw new RequestError("接口返回了无法解析的 JSON 数据。")
        }
      } catch (error) {
        if (this.isAbortError(error)) {
          throw new CancelledError()
        }

        lastError = error instanceof Error ? error : new Error(normalizeErrorMessage(error))
        this.log(`请求失败，第 ${attempt}/${this.retryLimit} 次重试：${lastError.message}`)
        await this.updateCookie(generateRandomCookie())
      }
    }

    throw lastError ?? new RequestError("请求失败。")
  }

  private async postCandidates(endpoint: string, candidates: PayloadCandidate[], signal?: AbortSignal): Promise<unknown> {
    let lastError: Error | undefined
    const url = `${this.baseUrl}/${endpoint}`

    for (const candidate of candidates) {
      try {
        return await this.requestWithRetry({
          method: "POST",
          url,
          jsonData: candidate.mode === "json" ? candidate.value : undefined,
          rawData: candidate.mode === "data" ? candidate.value : undefined,
          signal
        })
      } catch (error) {
        if (error instanceof CancelledError) {
          throw error
        }
        lastError = error instanceof Error ? error : new Error(normalizeErrorMessage(error))
      }
    }

    throw lastError ?? new RequestError(`${endpoint} 请求失败。`)
  }

  private normalizeOrgIdValue(value: string): string | number {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
      const numericValue = Number(trimmed)
      if (Number.isSafeInteger(numericValue)) {
        return numericValue
      }
    }
    return trimmed
  }

  async loadOrgRoots(signal?: AbortSignal): Promise<OrgNode[]> {
    const data = await this.postCandidates(
      "orgTreeNew",
      [
        { mode: "json", value: {} },
        { mode: "json", value: { orgId: "" } },
        { mode: "data", value: "\"\"" },
        { mode: "data", value: "" }
      ],
      signal
    )
    return parseOrgNodes(data)
  }

  async loadOrgChildren(parentId: string, signal?: AbortSignal): Promise<OrgNode[]> {
    const normalizedParentId = this.normalizeOrgIdValue(parentId)

    const data = await this.postCandidates(
      "orgTreeNew",
      [
        { mode: "json", value: { orgId: normalizedParentId } },
        { mode: "json", value: { id: normalizedParentId } },
        { mode: "data", value: `"${parentId}"` }
      ],
      signal
    )
    return parseOrgNodes(data, parentId)
  }

  async searchOrgs(keyword: string, signal?: AbortSignal): Promise<OrgNode[]> {
    const data = await this.postCandidates(
      "orgTreeSearch",
      [
        { mode: "json", value: { orgName: keyword } },
        { mode: "json", value: { keyword } },
        { mode: "json", value: { key: keyword } },
        { mode: "data", value: `"${keyword}"` }
      ],
      signal
    )
    return parseOrgNodes(data)
  }

  async getNoteList(params: {
    page: number
    size: number
    orgId: string
    orgName: string
    keyword: string
    signal?: AbortSignal
  }): Promise<JsonMap[]> {
    const payload = {
      index: params.page,
      size: params.size,
      firstPageMenuId: "2018060501171111",
      orgId: params.orgId,
      key: params.keyword,
      year: "",
      orgName: params.orgName
    }

    const result = await this.requestWithRetry<JsonMap>({
      method: "POST",
      url: `${this.baseUrl}/noteList`,
      jsonData: payload,
      signal: params.signal
    })

    const resultValue = result["resultValue"]
    if (!resultValue || typeof resultValue !== "object") {
      return []
    }
    const noteList = (resultValue as JsonMap)["noteList"]
    return Array.isArray(noteList) ? noteList.filter((item): item is JsonMap => Boolean(item) && typeof item === "object") : []
  }

  async getNoticeWin(noticeId: string, signal?: AbortSignal): Promise<[JsonMap, boolean]> {
    const result = await this.requestWithRetry<JsonMap>({
      method: "POST",
      url: `${this.baseUrl}/getNoticeWin`,
      rawData: `"${noticeId}"`,
      signal
    })

    const resultValue = result["resultValue"]
    const mapped = resultValue && typeof resultValue === "object" ? (resultValue as JsonMap) : {}
    const fileFlag = String(mapped["fileFlag"] ?? "0")
    return [mapped, fileFlag === "1"]
  }

  async getWinFile(noticeId: string, signal?: AbortSignal): Promise<JsonMap[]> {
    const result = await this.requestWithRetry<JsonMap>({
      method: "POST",
      url: `${this.baseUrl}/getWinFile`,
      rawData: `"${noticeId}"`,
      signal
    })

    const resultValue = result["resultValue"]
    if (!resultValue || typeof resultValue !== "object") {
      return []
    }
    const files = (resultValue as JsonMap)["files"]
    return Array.isArray(files) ? files.filter((item): item is JsonMap => Boolean(item) && typeof item === "object") : []
  }

  async downloadFile(
    pdfUrl: string,
    destination: string,
    signal?: AbortSignal,
    progressCb?: (downloaded: number, total: number) => void
  ): Promise<void> {
    const response = await this.requestWithRetry<AxiosResponse<Readable>>({
      method: "GET",
      url: pdfUrl,
      stream: true,
      expectJson: false,
      timeout: 30_000,
      headers: {
        ...this.headers,
        Referer: PORTAL_REFERER
      },
      signal
    })

    const total = Number(response.headers["content-length"] ?? 0)
    let downloaded = 0
    await mkdir(dirname(destination), { recursive: true })

    response.data.on("data", (chunk: Buffer) => {
      downloaded += chunk.length
      progressCb?.(downloaded, total)
      if (signal?.aborted) {
        response.data.destroy(new CancelledError())
      }
    })

    try {
      await pipeline(response.data, createWriteStream(destination))
    } catch (error) {
      await removeIfExists(destination)
      if (this.isAbortError(error)) {
        throw new CancelledError()
      }
      const message = error instanceof AxiosError ? error.message : normalizeErrorMessage(error)
      throw new RequestError(`文件下载失败: ${message}`)
    }
  }
}
