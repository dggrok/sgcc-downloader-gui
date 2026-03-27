import { startTransition, useEffect, useState, type ComponentProps } from "react"

import {
  ApartmentOutlined,
  BranchesOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  FileZipOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  SearchOutlined
} from "@ant-design/icons"
import { APP_VERSION, PRODUCT_NAME } from "@shared/app-meta"
import type {
  AppSettings,
  AttachmentRecord,
  OrgNode,
  SearchParams,
  TaskLogEvent,
  TaskProgress,
  TaskStateEvent
} from "@shared/types"
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  ConfigProvider,
  Empty,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Tree,
  Typography
} from "antd"
import type { DataNode, EventDataNode } from "antd/es/tree"

type OrgTreeNode = OrgNode & {
  children: OrgTreeNode[]
  loaded: boolean
  loading: boolean
}

type AntTreeNode = DataNode & {
  key: string
  title: string
  children?: AntTreeNode[]
  isLeaf?: boolean
  orgNode: OrgTreeNode
}

const DEFAULT_SETTINGS: AppSettings = {
  downloadDir: "",
  createSubdir: true,
  keyword: "",
  manualOrgName: "",
  manualOrgId: "",
  startPage: 1,
  pageSize: 10,
  maxPages: 1
}

const { Title, Paragraph, Text } = Typography
const { Search } = Input
const { DirectoryTree } = Tree

function toTreeNodes(nodes: OrgNode[]): OrgTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: [],
    loaded: false,
    loading: false
  }))
}

function patchTreeNodes(
  nodes: OrgTreeNode[],
  targetId: string,
  update: (node: OrgTreeNode) => OrgTreeNode
): OrgTreeNode[] {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return update(node)
    }

    if (node.children.length === 0) {
      return node
    }

    return {
      ...node,
      children: patchTreeNodes(node.children, targetId, update)
    }
  })
}

function findTreeNode(nodes: OrgTreeNode[], targetId: string): OrgTreeNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node
    }

    if (node.children.length > 0) {
      const matched = findTreeNode(node.children, targetId)
      if (matched) {
        return matched
      }
    }
  }

  return null
}

function formatLogLine(entry: TaskLogEvent | string): string {
  if (typeof entry === "string") {
    return entry
  }

  const time = new Date(entry.at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })

  return `[${time}] ${entry.message}`
}

function selectedCount(records: AttachmentRecord[]): number {
  return records.filter((record) => record.selected).length
}

function BusyTag(props: { label: string }) {
  return (
    <Tag className="soft-tag" icon={<LoadingOutlined spin />} color="processing">
      {props.label}
    </Tag>
  )
}

function toAntTreeNodes(nodes: OrgTreeNode[]): AntTreeNode[] {
  return nodes.map((node) => ({
    key: node.id,
    title: node.name,
    isLeaf: node.loaded ? node.children.length === 0 : false,
    children: node.loaded && node.children.length > 0 ? toAntTreeNodes(node.children) : undefined,
    orgNode: node
  }))
}

export function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [orgTree, setOrgTree] = useState<OrgTreeNode[]>([])
  const [expandedOrgKeys, setExpandedOrgKeys] = useState<string[]>([])
  const [orgSearchKeyword, setOrgSearchKeyword] = useState("")
  const [orgSearchResults, setOrgSearchResults] = useState<OrgNode[]>([])
  const [selectedOrg, setSelectedOrg] = useState<OrgNode | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [pickerSelectedOrg, setPickerSelectedOrg] = useState<OrgNode | null>(null)
  const [pickerSelectedKeys, setPickerSelectedKeys] = useState<string[]>([])
  const [hasSearchedOrgs, setHasSearchedOrgs] = useState(false)
  const [records, setRecords] = useState<AttachmentRecord[]>([])
  const [logs, setLogs] = useState<string[]>(["准备加载跨端桌面端环境。"])
  const [taskMessage, setTaskMessage] = useState("等待操作")
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(1)
  const [activeTaskId, setActiveTaskId] = useState("")
  const [activeTaskKind, setActiveTaskKind] = useState<TaskStateEvent["kind"] | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [lastResultDir, setLastResultDir] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [hydrated, setHydrated] = useState(false)
  const [rootLoading, setRootLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)

  const currentSelectedOrgId = selectedOrg?.id ?? settings.manualOrgId
  const currentSelectedOrgName = selectedOrg?.name ?? settings.manualOrgName
  const isPreviewLoading = isBusy && activeTaskKind === "preview"
  const isDownloadLoading = isBusy && activeTaskKind === "download"
  const isExportLoading = isBusy && activeTaskKind === "export"
  const progressPercent = Math.max(0, Math.min(100, Math.round((progressCurrent / Math.max(progressTotal, 1)) * 100)))
  const treeData = toAntTreeNodes(orgTree)

  const pushLog = (entry: TaskLogEvent | string) => {
    setLogs((current) => [...current, formatLogLine(entry)].slice(-240))
  }

  useEffect(() => {
    let mounted = true

    const unsubscribeProgress = window.sgcc.events.onTaskProgress((event: TaskProgress) => {
      if (!mounted) {
        return
      }

      setProgressCurrent(event.current)
      setProgressTotal(Math.max(event.total, 1))
      setTaskMessage(event.message)
    })

    const unsubscribeLog = window.sgcc.events.onTaskLog((event) => {
      if (!mounted) {
        return
      }

      pushLog(event)
    })

    const unsubscribeState = window.sgcc.events.onTaskState((event: TaskStateEvent) => {
      if (!mounted) {
        return
      }

      setTaskMessage(event.message)

      if (event.status === "started") {
        setActiveTaskId(event.taskId)
        setActiveTaskKind(event.kind)
        setIsBusy(true)
        setErrorMessage("")
      } else {
        setIsBusy(false)
        setActiveTaskId("")
        setActiveTaskKind(null)
      }

      if (event.status === "failed") {
        setErrorMessage(event.message)
        pushLog(`错误：${event.message}`)
      }

      if (event.status === "cancelled") {
        pushLog(`已取消：${event.message}`)
      }
    })

    const bootstrap = async () => {
      setRootLoading(true)

      try {
        const savedSettings = await window.sgcc.settings.get()
        if (!mounted) {
          return
        }

        setSettings(savedSettings)
        if (savedSettings.manualOrgId && savedSettings.manualOrgName) {
          setSelectedOrg({
            id: savedSettings.manualOrgId,
            name: savedSettings.manualOrgName,
            hasChildren: false
          })
        }

        const roots = await window.sgcc.org.loadRoots()
        if (!mounted) {
          return
        }

        startTransition(() => setOrgTree(toTreeNodes(roots)))
        pushLog(`机构根节点加载完成，共 ${roots.length} 个。`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(message)
        pushLog(`初始化失败：${message}`)
      } finally {
        if (mounted) {
          setRootLoading(false)
          setHydrated(true)
        }
      }
    }

    void bootstrap()

    return () => {
      mounted = false
      unsubscribeProgress()
      unsubscribeLog()
      unsubscribeState()
    }
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    void window.sgcc.settings.set({
      downloadDir: settings.downloadDir,
      createSubdir: settings.createSubdir,
      keyword: settings.keyword,
      manualOrgName: settings.manualOrgName,
      manualOrgId: settings.manualOrgId,
      startPage: settings.startPage,
      pageSize: settings.pageSize,
      maxPages: settings.maxPages
    })
  }, [hydrated, settings])

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((current) => ({
      ...current,
      ...patch
    }))
  }

  const handleSelectOrg = (node: OrgNode) => {
    setSelectedOrg(node)
    updateSettings({
      manualOrgName: node.name,
      manualOrgId: node.id
    })
    setErrorMessage("")
    pushLog(`已选择机构：${node.name} (${node.id})`)
  }

  const handleOpenOrgPicker = () => {
    const currentOrg = currentSelectedOrgId && currentSelectedOrgName
      ? {
          id: currentSelectedOrgId,
          name: currentSelectedOrgName,
          hasChildren: false
        }
      : null

    setPickerOpen(true)
    setPickerSelectedOrg(currentOrg)
    setPickerSelectedKeys(currentOrg ? [currentOrg.id] : [])
    setOrgSearchKeyword("")
    setOrgSearchResults([])
    setHasSearchedOrgs(false)
  }

  const handleCloseOrgPicker = () => {
    setPickerOpen(false)
    setOrgSearchKeyword("")
    setOrgSearchResults([])
    setHasSearchedOrgs(false)
  }

  const handleConfirmOrgPicker = () => {
    if (!pickerSelectedOrg) {
      setErrorMessage("请先在弹窗中选择机构。")
      return
    }

    handleSelectOrg(pickerSelectedOrg)
    handleCloseOrgPicker()
  }

  const handlePickOrgInModal = (node: OrgNode) => {
    setPickerSelectedOrg(node)
    setPickerSelectedKeys([node.id])
  }

  const handleLoadTreeData = async (treeNode: EventDataNode<AntTreeNode>) => {
    const nodeId = String(treeNode.key)
    const currentNode = findTreeNode(orgTree, nodeId)

    if (!currentNode || currentNode.loaded || currentNode.loading) {
      return
    }

    setOrgTree((current) =>
      patchTreeNodes(current, nodeId, (node) => ({
        ...node,
        loading: true
      }))
    )

    try {
      const children = await window.sgcc.org.loadChildren(nodeId)
      startTransition(() => {
        setOrgTree((current) =>
          patchTreeNodes(current, nodeId, (node) => ({
            ...node,
            loaded: true,
            loading: false,
            children: toTreeNodes(children)
          }))
        )
      })
      pushLog(`加载机构子节点完成，共 ${children.length} 个。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      setOrgTree((current) =>
        patchTreeNodes(current, nodeId, (node) => ({
          ...node,
          loading: false
        }))
      )
      pushLog(`机构子节点加载失败：${message}`)
    }
  }

  const handleExpandTree: NonNullable<ComponentProps<typeof DirectoryTree>["onExpand"]> = async (nextExpandedKeys, info) => {
    setExpandedOrgKeys(nextExpandedKeys.map((key) => String(key)))

    if (!info.expanded) {
      return
    }

    await handleLoadTreeData(info.node as EventDataNode<AntTreeNode>)
  }

  const handleSearchOrg = async (value?: string) => {
    const keyword = (value ?? orgSearchKeyword).trim()
    if (!keyword) {
      setHasSearchedOrgs(false)
      setOrgSearchResults([])
      setErrorMessage("请输入机构搜索关键字。")
      return
    }

    setOrgSearchKeyword(keyword)
    setHasSearchedOrgs(true)
    setSearchLoading(true)

    try {
      const results = await window.sgcc.org.search(keyword)
      startTransition(() => setOrgSearchResults(results))
      setErrorMessage("")
      pushLog(`机构搜索完成，共 ${results.length} 个结果。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      pushLog(`机构搜索失败：${message}`)
    } finally {
      setSearchLoading(false)
    }
  }

  const handleApplyManualOrg = () => {
    const orgName = settings.manualOrgName.trim()
    const orgId = settings.manualOrgId.trim()

    if (!orgName || !orgId) {
      setErrorMessage("请同时填写机构名称和机构 ID。")
      return
    }

    handleSelectOrg({
      id: orgId,
      name: orgName,
      hasChildren: false,
      raw: {
        source: "manual"
      }
    })
  }

  const handlePreview = async () => {
    const effectiveOrg = currentSelectedOrgId && currentSelectedOrgName
      ? {
          id: currentSelectedOrgId,
          name: currentSelectedOrgName,
          hasChildren: false
        }
      : null

    if (!effectiveOrg) {
      setErrorMessage("请先选择机构。")
      return
    }

    setErrorMessage("")
    setTaskMessage("准备查询公告")
    setProgressCurrent(0)
    setProgressTotal(Math.max(settings.maxPages, 1))

    const params: SearchParams = {
      orgId: effectiveOrg.id,
      orgName: effectiveOrg.name,
      keyword: settings.keyword,
      startPage: settings.startPage,
      pageSize: settings.pageSize,
      maxPages: settings.maxPages
    }

    try {
      const response = await window.sgcc.crawler.preview(params)
      startTransition(() => setRecords(response.records))
      pushLog(`预览列表已刷新，共 ${response.records.length} 条记录。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      pushLog(`预览失败：${message}`)
    }
  }

  const handleDownload = async () => {
    if (records.length === 0) {
      setErrorMessage("当前没有可下载的附件。")
      return
    }

    try {
      const response = await window.sgcc.crawler.download(records, {
        targetDir: settings.downloadDir,
        createSubdir: settings.createSubdir
      })
      setLastResultDir(response.result.targetDir)
      setRecords((current) => [...current])
      pushLog(
        `下载任务完成：成功 ${response.result.successCount} 个，失败 ${response.result.failureCount} 个，目录 ${response.result.targetDir}`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      pushLog(`下载失败：${message}`)
    }
  }

  const handleCancel = async () => {
    if (!activeTaskId) {
      return
    }

    try {
      await window.sgcc.crawler.cancel(activeTaskId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      pushLog(`取消任务失败：${message}`)
    }
  }

  const handleToggleRecord = (index: number) => {
    setRecords((current) =>
      current.map((record, currentIndex) =>
        currentIndex === index
          ? {
              ...record,
              selected: !record.selected
            }
          : record
      )
    )
  }

  const handleSelectAll = () => {
    setRecords((current) => current.map((record) => ({ ...record, selected: true })))
  }

  const handleInvertSelect = () => {
    setRecords((current) => current.map((record) => ({ ...record, selected: !record.selected })))
  }

  const handleClearQueryConditions = () => {
    setSelectedOrg(null)
    setPickerSelectedOrg(null)
    setPickerSelectedKeys([])
    setOrgSearchKeyword("")
    setOrgSearchResults([])
    setHasSearchedOrgs(false)
    updateSettings({
      manualOrgName: "",
      manualOrgId: "",
      keyword: "",
      startPage: 1,
      pageSize: 10,
      maxPages: 1
    })
    setTaskMessage("查询条件已清空")
    setErrorMessage("")
    pushLog("已清空查询条件。")
  }

  const handleClearRecords = () => {
    setRecords([])
    setLastResultDir("")
    setProgressCurrent(0)
    setProgressTotal(1)
    setTaskMessage("附件列表已清空")
    setErrorMessage("")
    pushLog("已清空当前附件列表。")
  }

  const handleOpenTargetDir = async () => {
    const target = lastResultDir || settings.downloadDir
    if (!target) {
      setErrorMessage("当前没有可打开的目录。")
      return
    }

    try {
      await window.sgcc.system.openPath(target)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      pushLog(`打开目录失败：${message}`)
    }
  }

  const handleChooseDownloadDirectory = async () => {
    try {
      if (typeof window.sgcc?.system?.chooseDirectory !== "function") {
        throw new Error("当前应用仍在使用旧版本目录选择接口，请完全退出后重新打开应用。")
      }
      const selectedPath = await window.sgcc.system.chooseDirectory(settings.downloadDir)
      if (!selectedPath) {
        return
      }
      updateSettings({ downloadDir: selectedPath })
      pushLog(`已切换下载目录：${selectedPath}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      pushLog(`选择下载目录失败：${message}`)
    }
  }

  const handleExportZip = async () => {
    if (records.length === 0) {
      setErrorMessage("当前没有可导出的附件。")
      return
    }

    try {
      const response = await window.sgcc.crawler.exportZip(records, settings.downloadDir)
      setLastResultDir(settings.downloadDir)
      pushLog(
        `压缩包导出完成：${response.result.zipPath}，成功 ${response.result.successCount} 个，失败 ${response.result.failureCount} 个`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      pushLog(`压缩包导出失败：${message}`)
    }
  }

  const handleOpenLogDir = async () => {
    try {
      await window.sgcc.system.openLogDir()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      pushLog(`打开日志目录失败：${message}`)
    }
  }

  const tableColumns = [
    {
      title: "下载",
      dataIndex: "selected",
      width: 78,
      render: (_value: boolean, _record: AttachmentRecord, index: number) => (
        <Checkbox checked={records[index]?.selected} onChange={() => handleToggleRecord(index)} />
      )
    },
    {
      title: "附件名",
      dataIndex: "fileName",
      ellipsis: true
    },
    {
      title: "公告标题",
      dataIndex: "noticeTitle",
      ellipsis: true,
      render: (value: string) => value || "未命名公告"
    },
    {
      title: "公告 ID",
      dataIndex: "noticeId",
      width: 150
    },
    {
      title: "机构",
      dataIndex: "orgName",
      ellipsis: true
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string, record: AttachmentRecord) => {
        if (value === "成功") {
          return <Tag color="success">成功</Tag>
        }
        if (value === "失败") {
          return <Tag color="error">{record.errorMessage || "失败"}</Tag>
        }
        if (value === "下载中") {
          return <BusyTag label="下载中" />
        }
        if (value === "已取消") {
          return <Tag color="default">已取消</Tag>
        }
        return <Tag>{value}</Tag>
      }
    },
    {
      title: "保存路径",
      dataIndex: "localPath",
      ellipsis: true,
      render: (value: string) => value || "尚未下载"
    }
  ]

  const statusTags = [
    rootLoading ? <BusyTag key="root" label="加载机构树" /> : null,
    searchLoading ? <BusyTag key="search" label="搜索机构" /> : null,
    isPreviewLoading ? <BusyTag key="preview" label="查询公告" /> : null,
    isDownloadLoading ? <BusyTag key="download" label="下载附件" /> : null,
    isExportLoading ? <BusyTag key="export" label="导出压缩包" /> : null
  ].filter(Boolean)

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#bb5631",
          colorInfo: "#bb5631",
          colorSuccess: "#284c44",
          colorWarning: "#bb5631",
          colorError: "#962d20",
          borderRadius: 18,
          wireframe: false,
          colorBgBase: "#f7f0e6",
          colorTextBase: "#201913",
          fontFamily: "\"Avenir Next\", \"PingFang SC\", \"Hiragino Sans GB\", sans-serif"
        }
      }}
    >
      <div className="antd-app-shell">
        <section className="hero-card">
          <div className="hero-main">
            <Text className="hero-eyebrow">Cross-Platform Desktop Migration</Text>
            <Title level={1} className="hero-title">
              {PRODUCT_NAME}
            </Title>
            <Paragraph className="hero-description">
              面向国网 ECP 公告附件的日常检索与批量处理。支持机构选择、公告查询、附件下载和压缩包导出，默认把高频操作集中在同一页完成。
            </Paragraph>
            <Space wrap size={[8, 8]}>
              <Tag className="soft-tag" icon={<ApartmentOutlined />} color="default">
                Ant Design
              </Tag>
              <Tag className="soft-tag" icon={<BranchesOutlined />} color="default">
                Lazy Tree
              </Tag>
              <Tag className="soft-tag" icon={<CloudDownloadOutlined />} color="default">
                Node Crawler
              </Tag>
            </Space>
          </div>

          <div className="hero-stats-grid">
            <Card className="stat-card" size="small" variant="borderless">
              <Text type="secondary">版本</Text>
              <Title level={4}>v{APP_VERSION}</Title>
            </Card>
            <Card className="stat-card" size="small" variant="borderless">
              <Text type="secondary">已加载附件</Text>
              <Title level={4}>{records.length}</Title>
            </Card>
            <Card className="stat-card" size="small" variant="borderless">
              <Text type="secondary">已勾选</Text>
              <Title level={4}>{selectedCount(records)}</Title>
            </Card>
          </div>
        </section>

        {errorMessage ? (
          <Alert
            banner
            className="page-alert"
            message={errorMessage}
            showIcon
            type="error"
          />
        ) : null}

        <Card className="panel-card guide-card" title="使用说明">
          <div className="guide-grid">
            <div className="guide-item">
              <div className="guide-badge">
                <ApartmentOutlined />
              </div>
              <div className="guide-copy">
                <Text className="guide-title">1. 选择机构</Text>
                <Paragraph className="guide-text">
                  点击“选择机构”，在弹窗里通过默认机构树或搜索结果确认发布单位。
                </Paragraph>
              </div>
            </div>

            <div className="guide-item">
              <div className="guide-badge">
                <SearchOutlined />
              </div>
              <div className="guide-copy">
                <Text className="guide-title">2. 设置条件</Text>
                <Paragraph className="guide-text">
                  填写关键词、页码和下载目录；如需重新开始，可清除查询条件或清空附件列表。
                </Paragraph>
              </div>
            </div>

            <div className="guide-item">
              <div className="guide-badge">
                <FileSearchOutlined />
              </div>
              <div className="guide-copy">
                <Text className="guide-title">3. 查询附件</Text>
                <Paragraph className="guide-text">
                  点击“查询公告”后，附件列表会展示当前机构下的附件，并支持勾选与批量操作。
                </Paragraph>
              </div>
            </div>

            <div className="guide-item">
              <div className="guide-badge">
                <CloudDownloadOutlined />
              </div>
              <div className="guide-copy">
                <Text className="guide-title">4. 下载或导出</Text>
                <Paragraph className="guide-text">
                  勾选后可直接下载，也可以导出成以机构名和时间命名的压缩包。
                </Paragraph>
              </div>
            </div>
          </div>
        </Card>

        <div className="dashboard-grid dashboard-grid--single">
          <div className="dashboard-content">
            <Card className="panel-card" title="查询条件">
              <Space direction="vertical" size={18} style={{ width: "100%" }}>
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Text type="secondary">机构</Text>
                    <Space.Compact style={{ width: "100%" }}>
                      <Input
                        className="org-picker-input"
                        placeholder="请选择发布单位"
                        readOnly
                        value={currentSelectedOrgName ? `${currentSelectedOrgName} (${currentSelectedOrgId})` : ""}
                        onClick={handleOpenOrgPicker}
                      />
                      <Button icon={<ApartmentOutlined />} onClick={handleOpenOrgPicker}>
                        选择机构
                      </Button>
                    </Space.Compact>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary">关键词</Text>
                    <Input
                      placeholder="例如：物资"
                      value={settings.keyword}
                      onChange={(event) => updateSettings({ keyword: event.target.value })}
                    />
                  </Col>
                  <Col span={4}>
                    <Text type="secondary">起始页</Text>
                    <InputNumber
                      min={1}
                      style={{ width: "100%" }}
                      value={settings.startPage}
                      onChange={(value) => updateSettings({ startPage: Number(value) || 1 })}
                    />
                  </Col>
                  <Col span={4}>
                    <Text type="secondary">每页数量</Text>
                    <InputNumber
                      min={1}
                      style={{ width: "100%" }}
                      value={settings.pageSize}
                      onChange={(value) => updateSettings({ pageSize: Number(value) || 10 })}
                    />
                  </Col>
                  <Col span={4}>
                    <Text type="secondary">最大页数</Text>
                    <InputNumber
                      min={1}
                      style={{ width: "100%" }}
                      value={settings.maxPages}
                      onChange={(value) => updateSettings({ maxPages: Number(value) || 1 })}
                    />
                  </Col>
                  <Col span={18}>
                    <Text type="secondary">下载目录</Text>
                    <Space.Compact style={{ width: "100%" }}>
                      <Input
                        placeholder="默认会写入系统下载目录"
                        value={settings.downloadDir}
                        onChange={(event) => updateSettings({ downloadDir: event.target.value })}
                      />
                      <Button onClick={handleChooseDownloadDirectory}>选择目录</Button>
                    </Space.Compact>
                  </Col>
                  <Col span={6}>
                    <Text type="secondary">任务子目录</Text>
                    <div className="checkbox-wrap">
                      <Checkbox
                        checked={settings.createSubdir}
                        onChange={(event) => updateSettings({ createSubdir: event.target.checked })}
                      >
                        为本次任务创建子目录
                      </Checkbox>
                    </div>
                  </Col>
                </Row>

                <Space wrap size={[10, 10]}>
                  <Button
                    icon={<FileSearchOutlined />}
                    loading={isPreviewLoading}
                    type="primary"
                    onClick={handlePreview}
                  >
                    查询公告
                  </Button>
                  <Button disabled={isBusy || records.length === 0} onClick={handleSelectAll}>
                    全选
                  </Button>
                  <Button disabled={isBusy || records.length === 0} onClick={handleInvertSelect}>
                    反选
                  </Button>
                  <Button onClick={handleClearQueryConditions}>
                    清除查询条件
                  </Button>
                  <Popconfirm
                    disabled={isBusy || records.length === 0}
                    okText="清空"
                    cancelText="取消"
                    placement="top"
                    title="确认清空当前附件列表吗？"
                    onConfirm={handleClearRecords}
                  >
                    <Button
                      danger
                      disabled={isBusy || records.length === 0}
                      icon={<DeleteOutlined />}
                    >
                      清空附件列表
                    </Button>
                  </Popconfirm>
                  <Button
                    icon={<CloudDownloadOutlined />}
                    loading={isDownloadLoading}
                    disabled={records.length === 0}
                    type="primary"
                    onClick={handleDownload}
                  >
                    下载选中
                  </Button>
                  <Button
                    icon={<FileZipOutlined />}
                    loading={isExportLoading}
                    disabled={records.length === 0}
                    onClick={handleExportZip}
                  >
                    导出压缩包
                  </Button>
                  <Button danger disabled={!isBusy} onClick={handleCancel}>
                    停止
                  </Button>
                  <Button icon={<FolderOpenOutlined />} onClick={handleOpenTargetDir}>
                    打开目录
                  </Button>
                  <Button onClick={() => setLogModalOpen(true)}>
                    查看运行日志
                  </Button>
                  <Button onClick={handleOpenLogDir}>
                    打开日志目录
                  </Button>
                </Space>

                <div className="progress-block">
                  <Space wrap size={[8, 8]}>
                    <Tag color={isBusy ? "processing" : "default"}>{taskMessage}</Tag>
                    {isPreviewLoading ? <BusyTag label="正在请求公告列表" /> : null}
                    {isDownloadLoading ? <BusyTag label="正在写入文件" /> : null}
                    {isExportLoading ? <BusyTag label="正在生成压缩包" /> : null}
                  </Space>
                  <Progress percent={progressPercent} status={isBusy ? "active" : "normal"} strokeColor={{ from: "#bb5631", to: "#284c44" }} />
                </div>
              </Space>
            </Card>

            <Card
              className="panel-card"
              title="附件预览"
              extra={
                <Space>
                  <Text type="secondary">共 {records.length} 条</Text>
                  <Tag color="success">已勾选 {selectedCount(records)} 条</Tag>
                </Space>
              }
            >
              <Spin spinning={isPreviewLoading || isDownloadLoading} tip={isPreviewLoading ? "正在查询附件…" : "正在下载附件…"}>
                <Table
                  columns={tableColumns}
                  dataSource={records}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  rowKey={(record) => `${record.noticeId}:${record.filePath}`}
                  scroll={{ x: 1080, y: 440 }}
                  size="middle"
                />
              </Spin>
            </Card>

          </div>
        </div>

        <Modal
          destroyOnClose={false}
          okButtonProps={{ disabled: !pickerSelectedOrg }}
          okText="确定"
          open={pickerOpen}
          title="请选择发布单位"
          width={960}
          onCancel={handleCloseOrgPicker}
          onOk={handleConfirmOrgPicker}
        >
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Search
              allowClear
              enterButton={<><SearchOutlined /> 查询</>}
              loading={searchLoading}
              placeholder="请输入要查询的单位名称"
              value={orgSearchKeyword}
              onChange={(event) => {
                const nextValue = event.target.value
                setOrgSearchKeyword(nextValue)
                if (!nextValue.trim()) {
                  setOrgSearchResults([])
                  setHasSearchedOrgs(false)
                }
              }}
              onSearch={handleSearchOrg}
            />

            <Space wrap size={[8, 8]}>
              {rootLoading ? <BusyTag label="加载机构树" /> : <Tag color="success">机构树已就绪</Tag>}
              {searchLoading ? <BusyTag label="搜索机构" /> : null}
              {pickerSelectedOrg ? <Tag color="processing">已选择：{pickerSelectedOrg.name}</Tag> : null}
            </Space>

            {hasSearchedOrgs && orgSearchKeyword.trim() ? (
              <List
                bordered
                className="picker-result-list"
                dataSource={orgSearchResults}
                locale={{
                  emptyText: <Empty description="未找到匹配单位" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                }}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button
                        key={item.id}
                        size="small"
                        type={pickerSelectedOrg?.id === item.id ? "primary" : "link"}
                        onClick={() => handlePickOrgInModal(item)}
                      >
                        {pickerSelectedOrg?.id === item.id ? "已选择" : "选择"}
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={<span className="result-item-title">{item.name}</span>}
                      description={item.id}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div className="picker-tree-wrap">
                {rootLoading ? (
                  <div className="tree-loading-wrap">
                    <Spin indicator={<LoadingOutlined spin />} size="large" />
                    <Text type="secondary">正在准备机构根节点…</Text>
                  </div>
                ) : treeData.length > 0 ? (
                  <DirectoryTree
                    blockNode
                    expandAction="click"
                    expandedKeys={expandedOrgKeys}
                    height={520}
                    loadData={handleLoadTreeData}
                    multiple={false}
                    selectedKeys={pickerSelectedKeys}
                    showLine={{ showLeafIcon: false }}
                    switcherIcon={<BranchesOutlined />}
                    style={{ background: "transparent" }}
                    treeData={treeData}
                    onExpand={handleExpandTree}
                    onSelect={(_keys, info) => {
                      if ("orgNode" in info.node) {
                        handlePickOrgInModal(info.node.orgNode)
                      }
                    }}
                  />
                ) : (
                  <Empty description="机构树暂未返回数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            )}
          </Space>
        </Modal>

        <Modal
          footer={null}
          open={logModalOpen}
          title="运行日志"
          width={860}
          onCancel={() => setLogModalOpen(false)}
        >
          <div className="log-view log-view--modal">
            {logs.map((line, index) => (
              <div key={`${line}-${index}`} className="log-line">
                {line}
              </div>
            ))}
          </div>
        </Modal>
      </div>
    </ConfigProvider>
  )
}
