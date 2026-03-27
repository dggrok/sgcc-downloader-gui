import { describe, expect, it } from "vitest"

import { parseOrgNodes } from "../src/crawler/api-client"

describe("parseOrgNodes", () => {
  it("supports nested resultValue payloads", () => {
    const nodes = parseOrgNodes({
      resultValue: {
        children: [
          { orgId: "1001", orgName: "国网湖北省电力有限公司", childFlag: true },
          { orgId: "1002", orgName: "国网上海市电力公司", leaf: true }
        ]
      }
    })

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      id: "1001",
      hasChildren: true
    })
    expect(nodes[1]).toMatchObject({
      id: "1002",
      hasChildren: false
    })
  })

  it("supports orgTreeSearch items payload with uppercase fields", () => {
    const nodes = parseOrgNodes({
      successful: true,
      resultValue: {
        itemCount: 2,
        items: [
          { PID: "100000", ID: "2019061900034123", NAME: "国网甘肃省电力公司" },
          { PID: "2019061900034123", ID: "2020043077358988", NAME: "国网甘肃招标有限公司" }
        ]
      }
    })

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      id: "2019061900034123",
      name: "国网甘肃省电力公司",
      parentId: "100000"
    })
    expect(nodes[1]).toMatchObject({
      id: "2020043077358988",
      name: "国网甘肃招标有限公司",
      parentId: "2019061900034123"
    })
  })
})
