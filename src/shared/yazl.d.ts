declare module "yazl" {
  import type { Readable } from "node:stream"

  export class ZipFile {
    outputStream: Readable
    addFile(realPath: string, metadataPath: string): void
    end(): void
  }
}
