# Windows 打包与发布流程

## 1. 目标
- 把当前项目打包成最终用户可直接双击运行的 `SGCCDownloader.exe`
- 最终用户电脑通常不需要安装 Python
- 打包机建议使用 Windows 10/11 + Python 3.11
- 如果当前开发机是 macOS，可直接参考 [github_actions_build_guide.md](/Users/yaw/Desktop/demo/tools/docs/github_actions_build_guide.md) 通过 GitHub Actions 产出 Windows `.exe`

## 2. 打包机准备
- 安装 `Python 3.11.x`
- 确认命令行可使用 `py -3.11`
- 确认机器可联网下载依赖
- 建议在干净目录中执行打包

## 3. 一键构建
在项目根目录执行：

```bat
build_windows.bat
```

该脚本会自动完成：
- 创建 `.venv`
- 安装运行与打包依赖
- 清理旧的 `build/` 与 `dist/`
- 按 [SGCCDownloader.spec](/Users/yaw/Desktop/demo/tools/SGCCDownloader.spec) 构建单文件 GUI 程序

构建产物默认位于：

```text
dist\SGCCDownloader.exe
```

## 4. 一键生成交付目录
如果要把可执行文件和说明文档一起整理好，执行：

```bat
package_release.bat
```

生成目录和压缩包：

```text
release\SGCCDownloader-windows-v<version>\
release\SGCCDownloader-windows-v<version>.zip
```

目录内默认包含：
- `SGCCDownloader.exe`
- `README.md`
- `windows_user_guide.md`
- `windows_build_and_release.md`
- `release_checklist.md`
- `code_signing_prep.md`

压缩包命名规则：

```text
SGCCDownloader-windows-v<主版本号>.<次版本号>.<修订号>.zip
```

示例：

```text
SGCCDownloader-windows-v1.0.0.zip
```

## 5. 对外发布建议
- 内部试用：直接压缩 `release\SGCCDownloader-windows-v<version>\` 整个目录发给测试或业务同事
- 正式交付：建议输出 zip 包，例如 `SGCCDownloader-windows-v1.0.0.zip`
- 如果公司有代码签名证书，建议对 exe 做签名，减少 Windows Defender 告警概率

## 5.1 版本号维护
- 当前版本号统一维护在 [version.py](/Users/yaw/Desktop/demo/tools/sgcc_gui/version.py)
- 每次发版前至少确认：
  - `APP_VERSION`
  - `PRODUCT_NAME`
  - `COMPANY_NAME`
  - `FILE_DESCRIPTION`
- 构建脚本会自动生成 Windows 版本资源文件并注入 exe

## 5.2 图标接入
- 如果存在 `assets/app.ico`，打包时会自动把它作为 exe 图标
- 如果不存在，仍可构建，只是会使用默认图标
- 图标规范见 [assets/README.md](/Users/yaw/Desktop/demo/tools/assets/README.md)

## 6. 发布前自检清单
- 程序能正常启动
- 可加载机构树
- 可搜索机构
- 可查询公告并展示附件列表
- 可自定义下载目录
- 可下载选中的 PDF
- 下载完成后可打开目录
- 日志文件可正常生成

## 7. 常见问题
### 用户电脑需要安装 Python 吗
不需要。只要交付的是 `exe`，最终用户一般不需要安装 Python。

### 为什么仍然建议打包机安装 Python
因为 `exe` 需要在打包阶段由 Python 环境和 PyInstaller 构建出来。

### Windows Defender 弹出风险提示怎么办
- 优先使用公司签名证书签名
- 首次内部试用时，告知用户这是内部工具
- 尽量保持发布来源、文件名和版本号稳定

## 8. 推荐发布话术
可直接发给最终用户：

```text
请解压后直接双击 SGCCDownloader.exe 运行，无需额外安装 Python。
首次启动若被安全策略拦截，请联系管理员确认来源后放行。
```
