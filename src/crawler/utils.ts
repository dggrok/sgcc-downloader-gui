import { access, mkdir, rm, stat, writeFile } from "node:fs/promises"
import { dirname, extname, join, parse, resolve } from "node:path"
import { randomBytes, randomUUID } from "node:crypto"

import { CancelledError, ValidationError } from "./errors"

export function generateRandomCookie(): string {
  return `JSESSIONID=${randomBytes(16).toString("hex").toUpperCase()}`
}

export function createTaskId(): string {
  return randomUUID()
}

export function cleanFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]/g, "_").trim().replace(/[.]+$/g, "")
}

export function ensurePdfSuffix(filename: string): string {
  return filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`
}

export function buildTaskSubdir(orgName: string): string {
  const safeOrgName = cleanFilename(orgName) || "任务"
  const now = new Date()
  const stamp = buildTimestamp(now)
  return `${safeOrgName}_${stamp}`
}

export function buildTimestamp(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("") + "_" + [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("")
}

export async function ensureUniquePath(targetPath: string): Promise<string> {
  const parsed = parse(targetPath)
  let candidate = targetPath
  let counter = 1

  while (await pathExists(candidate)) {
    candidate = join(parsed.dir, `${parsed.name}_${counter}${parsed.ext}`)
    counter += 1
  }

  return candidate
}

export async function validateDownloadDirectory(pathText: string): Promise<string> {
  const trimmed = pathText.trim()
  if (!trimmed) {
    throw new ValidationError("下载目录不能为空。")
  }

  const resolvedPath = resolve(trimmed)
  await mkdir(resolvedPath, { recursive: true })

  const info = await stat(resolvedPath)
  if (!info.isDirectory()) {
    throw new ValidationError("下载路径不是有效目录。")
  }

  const testFile = join(resolvedPath, ".write_test")
  try {
    await writeFile(testFile, "ok", "utf8")
  } catch (error) {
    throw new ValidationError(`下载目录不可写: ${String(error)}`)
  } finally {
    await rm(testFile, { force: true }).catch(() => undefined)
  }

  return resolvedPath
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CancelledError()
  }
}

export async function sleepBetween(range: [number, number], signal?: AbortSignal): Promise<void> {
  const [low, high] = range
  if (high <= 0) {
    return
  }

  const min = Math.min(low, high)
  const max = Math.max(low, high)
  const duration = Math.floor((Math.random() * (max - min) + min) * 1000)

  await new Promise<void>((resolvePromise, rejectPromise) => {
    throwIfAborted(signal)
    const timer = setTimeout(() => {
      cleanup()
      resolvePromise()
    }, duration)

    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      rejectPromise(new CancelledError())
    }

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort)
    }

    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

export async function removeIfExists(targetPath: string): Promise<void> {
  await rm(targetPath, { force: true }).catch(() => undefined)
}

export function extensionOf(targetPath: string): string {
  return extname(targetPath)
}

export function parentDirectory(targetPath: string): string {
  return dirname(targetPath)
}
