import { describe, expect, it } from "vitest"

import { buildTaskSubdir, cleanFilename, ensurePdfSuffix } from "../src/crawler/utils"

describe("crawler utils", () => {
  it("cleans invalid filename characters", () => {
    expect(cleanFilename('招标:结果/公告?.pdf')).toBe("招标_结果_公告_.pdf")
  })

  it("adds pdf suffix when missing", () => {
    expect(ensurePdfSuffix("中标结果公告")).toBe("中标结果公告.pdf")
    expect(ensurePdfSuffix("中标结果公告.pdf")).toBe("中标结果公告.pdf")
  })

  it("builds task subdir with org name prefix", () => {
    expect(buildTaskSubdir("国网湖北省电力有限公司")).toMatch(/^国网湖北省电力有限公司_\d{8}_\d{6}$/)
  })
})
