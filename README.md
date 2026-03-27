# SGCC Desktop

基于 `Electron + React + TypeScript + Node.js` 的国网 ECP 公告附件桌面工具。

当前仓库已经平铺为单层应用结构，不再保留 `desktop/` 子目录，也不再包含旧的 Python GUI 方案。

## 当前能力

- 查询条件中的机构选择框
- 机构选择弹窗
- 懒加载机构树
- 机构关键字搜索
- 清除查询条件
- 公告查询与附件预览
- 清空附件列表
- 自定义下载目录
- 下载选中附件
- 导出压缩包
- 日志与任务进度

## 目录结构

```text
assets/  图标与资源
docs/    当前技术方案文档
src/     Electron 源码
tests/   测试
```

其中：

- [assets/app.ico](/Users/yaw/Desktop/demo/tools/assets/app.ico) 用于 Windows 图标
- [assets/app_preview.png](/Users/yaw/Desktop/demo/tools/assets/app_preview.png) 用于 macOS 运行时图标
- [src](/Users/yaw/Desktop/demo/tools/src) 是当前应用源码主目录

## 开发

安装依赖：

```bash
pnpm install
```

启动开发环境：

```bash
pnpm dev
```

## 校验

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Windows 打包

如果你有一台 Windows 机器，直接在项目根目录执行：

```bash
pnpm install
pnpm dist:win
```

产物会输出到：

```text
dist/
```

常用命令：

```bash
pnpm dist:win
pnpm dist:win:dir
```

其中：

- `pnpm dist:win` 会构建 Windows 安装包和便携包
- `pnpm dist:win:dir` 会输出未封装目录，适合先做本地验证

如果你当前在 macOS 上开发，推荐使用仓库内置的 GitHub Actions 工作流：

- 工作流文件： [.github/workflows/build-windows.yml](/Users/yaw/Desktop/demo/tools/.github/workflows/build-windows.yml)
- 触发后会在 `windows-latest` 上自动安装依赖、跑校验并生成 Windows 包
- 生成后的安装包会作为 `SGCCDesktop-windows` artifact 上传

## 入口位置

- 主进程入口：[index.ts](/Users/yaw/Desktop/demo/tools/src/main/index.ts)
- 预加载入口：[index.ts](/Users/yaw/Desktop/demo/tools/src/preload/index.ts)
- 渲染层入口：[App.tsx](/Users/yaw/Desktop/demo/tools/src/renderer/src/App.tsx)
- 抓取服务入口：[service.ts](/Users/yaw/Desktop/demo/tools/src/crawler/service.ts)

## 说明

- 当前仓库只维护 Electron 桌面端
- 当前图标资源直接来自根目录 [assets](/Users/yaw/Desktop/demo/tools/assets)
- 如需继续扩展功能，请优先修改 [src](/Users/yaw/Desktop/demo/tools/src) 和 [tests](/Users/yaw/Desktop/demo/tools/tests)
