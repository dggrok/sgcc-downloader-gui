# SGCC Windows GUI 工具实施计划

## 摘要
- 在当前项目目录中建立一个独立的 Windows 桌面应用，复用现有 `downLoadV2.py` 的抓取能力，但不继续沿用其“命令行入口 + 业务逻辑 + 下载流程”耦合结构。
- 技术栈固定为 `Python 3.11 + PySide6 Widgets + requests + PyInstaller(onefile)`。
- 产品主流程固定为：机构树/机构搜索 -> 输入检索条件 -> 预览附件结果 -> 勾选下载 -> 查看进度与日志。
- 下载目录必须支持自定义，默认指向 Windows 用户下载目录，并记住上次选择。
- 实施顺序固定为：先重构爬虫内核，再做 GUI 主流程，再补下载目录/配置持久化，最后做打包与测试。

## 关键变更

### 架构拆分
- 将现有脚本拆成三层：`api_client` 负责接口访问与会话管理，`service` 负责公告查询与下载编排，`ui` 负责 PySide6 界面与后台线程。
- 现有命令行入口仅保留为调试用途；桌面版主入口独立，不在 GUI 中直接调用 `argparse`。
- 所有 `print` 输出改为结构化日志和进度回调，供日志面板与文件日志共同消费。
- 抓取逻辑继续沿用现有接口顺序：`noteList -> getNoticeWin -> getWinFile -> showPDF`。
- 新增机构接口支持：`orgTreeNew` 用于懒加载机构树，`orgTreeSearch` 用于关键字搜索机构。

### 对外接口与数据类型
- 固定业务接口：
  - `load_org_roots()`
  - `load_org_children(parent_id)`
  - `search_orgs(keyword)`
  - `preview_attachments(search_params, progress_cb, cancel_token)`
  - `download_attachments(records, target_dir, create_subdir, progress_cb, cancel_token)`
- 固定数据类型：
  - `OrgNode(id, name, parent_id, has_children)`
  - `SearchParams(org_id, org_name, keyword, start_page, page_size, max_pages)`
  - `AttachmentRecord(notice_id, notice_title, file_name, file_path, full_url, selected, status, local_path, error_message)`
  - `TaskProgress(stage, current, total, message)`
- `AttachmentRecord` 以 `notice_id + file_path` 作为唯一键去重，避免结果表与下载列表出现重复项。
- 下载接口返回逐条结果状态，GUI 以此更新“待下载 / 下载中 / 成功 / 失败 / 已取消”。

### GUI 交互设计
- 主窗口分三块：
  - 查询区：机构搜索框、机构树、关键词、起始页、每页数量、最大页数、下载目录、`浏览...`、`恢复默认`。
  - 结果区：附件勾选表格，列为勾选、附件名、公告标题、公告 ID、机构、状态、保存路径。
  - 任务区：`查询公告`、`全选`、`反选`、`下载选中`、`停止`、`打开目录`、总进度条、日志面板。
- 查询公告只做预览，不自动下载。
- 用户可从机构树逐级展开选择机构，也可通过关键字搜索后定位并回填 `orgId/orgName`。
- 下载目录逻辑固定为：
  - 默认目录：`%USERPROFILE%/Downloads/SGCCDownloader`
  - 支持手工输入与目录选择器浏览
  - 支持“本次任务创建子目录”，命名规则为 `<机构名>_<YYYYMMDD_HHMMSS>`
  - 启动下载前校验路径存在性、可写性和合法性
  - 最近一次目录、是否创建子目录、窗口状态和检索参数保存到本地配置
- 查询和下载均放到后台线程执行，主线程只做界面刷新，确保窗口不假死。
- 停止按钮触发取消令牌，允许在分页循环和单文件下载之间安全停止，不强杀线程。

### 对现有脚本的必要优化
- 移除无效构造参数。当前 `initial_cookie` 形参没有真正发挥作用，需要统一成“内部生成”或“显式注入”二选一，默认采用内部生成。
- 将请求头抽成配置常量，`User-Agent` 改为 Windows 浏览器标识，不再保留 macOS 标识。
- `_request_with_retry` 补充 JSON 解析异常保护，接口异常统一映射成可展示的错误信息。
- 下载逻辑补充重名处理策略：非法字符清洗后，如文件重名则追加 `_(n)`，避免覆盖。
- 失败处理细分为：网络超时、403、返回空数据、目录不可写、文件写入失败、用户取消。
- 删除与当前主流程无关的依赖，至少清理 `pandas`、`fake_useragent`、`mbutil`，减小打包体积并降低运行环境复杂度。
- 日志同时写入界面和本地文件，日志文件放入 `%LOCALAPPDATA%/SGCCDownloader/logs`。
- 下载完成后支持一键打开目标目录，并在结果表中显示真实落盘路径。

## 实施顺序
- 第 1 步：搭建桌面项目骨架，建立 `core/service/ui` 分层，迁移现有爬虫逻辑但不改业务行为。
- 第 2 步：实现机构树懒加载和机构搜索，完成 `orgId/orgName` 的可视化选择。
- 第 3 步：实现公告查询与附件预览表格，支持勾选、全选、去重和状态列。
- 第 4 步：实现自定义下载目录、子目录创建、路径校验和下载执行。
- 第 5 步：接入 `QSettings`、日志文件、停止任务和打开目录能力。
- 第 6 步：补单元测试、集成测试和 Windows 单文件打包脚本。

## 测试计划
- 单元测试覆盖：
  - 机构树与机构搜索结果解析
  - 公告列表解析
  - `fileFlag=0` 过滤
  - 附件去重
  - 文件名清洗与重名追加
  - 下载目录校验与子目录创建
- 集成测试覆盖：
  - 查询公告后能正确展示附件预览
  - 勾选部分附件后能下载到自定义目录
  - 非法目录、无权限目录、403、超时、空结果都能给出明确提示
  - 点击停止后不再继续新的分页请求和文件下载
- Windows 验收标准：
  - 双击 `exe` 可启动
  - 查询与下载过程中窗口不假死
  - 机构树与机构搜索都可用
  - 下载目录可自定义且可记忆
  - 下载完成后可打开目录
  - 失败项可在界面与日志中定位原因

## 假设与默认
- 当前实现代码放在当前项目目录中，原始脚本 `downLoadV2.py` 仅作为逻辑迁移参考，不直接在原文件上继续堆 GUI。
- 首版只支持 PDF 下载，不内嵌 PDF 预览器。
- 首版不做并发下载，统一采用后台串行执行，优先保证稳定性和降低反爬风险。
- 首版交付形式为单文件 `exe`，暂不做安装包。
