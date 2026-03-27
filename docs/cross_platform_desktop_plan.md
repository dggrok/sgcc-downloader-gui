# SGCC Desktop 技术方案

## 1. 当前状态

当前仓库已经整理为单层 Electron 项目结构：

- 不再保留 `desktop/` 子目录
- 不再保留旧 Python GUI 与相关打包脚本
- 所有当前有效代码都直接位于根目录的 `src/`、`tests/`、`assets/`、`docs/`

当前技术栈：

- `Electron`
- `React`
- `TypeScript`
- `Ant Design`
- `axios`
- `tough-cookie`
- `electron-store`
- `electron-log`

## 2. 当前目录结构

```text
assets/
  app.ico
  app_preview.png
  README.md

docs/
  cross_platform_desktop_plan.md

src/
  crawler/
  main/
  preload/
  renderer/
  shared/

tests/
  api-client.test.ts
  crawler-utils.test.ts
  service.test.ts

electron.vite.config.ts
package.json
pnpm-lock.yaml
tsconfig.json
tsconfig.node.json
tsconfig.web.json
README.md
LICENSE
```

## 3. 架构分层

### `src/main`

负责：

- 应用启动
- 窗口生命周期
- IPC 注册
- 系统目录选择
- 打开目录
- 日志与设置
- 运行时图标加载

### `src/preload`

负责：

- 向渲染层暴露白名单 API
- 机构加载与搜索
- 公告查询
- 下载
- 导出压缩包
- 系统能力调用

### `src/renderer`

负责：

- 查询条件表单
- 机构选择弹窗
- 懒加载机构树
- 附件预览列表
- 下载与导出操作
- 日志与进度展示

### `src/crawler`

负责：

- `orgTreeNew`
- `orgTreeSearch`
- `noteList`
- `getNoticeWin`
- `getWinFile`
- `showPDF`
- 下载目录校验
- 压缩包导出

### `src/shared`

负责：

- 共享类型
- IPC 协议
- 应用元信息

## 4. 已实现能力

- 机构选择框 + 弹窗选择
- 默认机构树与机构搜索
- 树懒加载
- 机构回填查询条件
- 清除查询条件
- 公告查询
- 附件预览
- 清空附件列表
- 自定义下载目录
- 下载选中附件
- 压缩包导出
- 压缩包命名：`机构名_YYYYMMDD_HHMMSS.zip`
- 打开下载目录
- 打开日志目录

## 5. 开发与运行

安装依赖：

```bash
pnpm install
```

开发：

```bash
pnpm dev
```

校验：

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 6. 图标与资源

当前图标策略：

- Windows 图标使用 [app.ico](/Users/yaw/Desktop/demo/tools/assets/app.ico)
- macOS 运行时图标使用 [app_preview.png](/Users/yaw/Desktop/demo/tools/assets/app_preview.png)
- 运行时主进程直接从根目录 `assets/` 读取资源
- 打包时资源会复制到应用内部的 `app-assets/`

## 7. 当前约束

- 当前仓库只面向 Electron 桌面端
- 当前图标在 macOS 打包场景下仍以运行时显示优先，如需完整 `.icns` 可后续补充
- 当前 README 和技术文档都已经按平铺后的目录结构更新

## 8. 后续可以继续做

- 机构选择弹窗进一步贴近业务系统样式
- 搜索结果回填后自动展开树路径
- 压缩包导出增加命名模板
- 安装包与发布流程完善
