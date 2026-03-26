# GitHub Actions 打包 Windows EXE 指南

## 1. 适用场景
- 当前开发机不是 Windows
- 需要直接拿到可验证的 `SGCCDownloader.exe`
- 希望不额外准备一台 Windows 打包机

这份项目已经内置了 GitHub Actions 工作流 [build-windows.yml](/Users/yaw/Desktop/demo/tools/.github/workflows/build-windows.yml)，可以在 GitHub 的 Windows Runner 上自动构建 `.exe`。

## 2. 先明确一件事
- 在 macOS 上，本地可以验证代码、图标和打包配置
- 但不能直接产出真正可运行的 Windows `.exe`
- 要拿到 Windows `.exe`，推荐走 GitHub Actions 或一台 Windows 机器本地打包

## 3. 最快路径
1. 把当前项目上传到 GitHub 仓库
2. 进入仓库 `Actions`
3. 运行 `build-windows`
4. 等待构建完成
5. 下载 artifact
6. 拿到 `SGCCDownloader.exe` 或完整发布包

## 4. 如果你当前还没有 GitHub 仓库
### 4.1 在 GitHub 网站创建仓库
- 登录 GitHub
- 点击右上角 `New repository`
- 仓库名建议使用：`sgcc-downloader-gui`
- 选择 `Private` 或 `Public`
- 点击 `Create repository`

### 4.2 本地初始化并上传
在当前项目目录执行：

```bash
cd /Users/yaw/Desktop/demo/tools
git init
git add .
git commit -m "init sgcc downloader gui"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

示例远程地址：

```text
https://github.com/<your-name>/sgcc-downloader-gui.git
```

或：

```text
git@github.com:<your-name>/sgcc-downloader-gui.git
```

## 5. 如果你已经有 GitHub 仓库
直接在当前目录执行：

```bash
cd /Users/yaw/Desktop/demo/tools
git add .
git commit -m "add windows gui build pipeline"
git push
```

## 6. GitHub 上如何触发构建
### 方式一：推送自动触发
以下分支会自动触发：
- `main`
- `master`
- `codex/**`

也就是说，只要你把代码推送到这些分支，GitHub 就会自动开始构建。

### 方式二：手动触发
1. 打开 GitHub 仓库页面
2. 点击顶部 `Actions`
3. 在左侧选择 `build-windows`
4. 点击 `Run workflow`
5. 选择要构建的分支
6. 点击确认运行

## 7. 如何下载 EXE
构建完成后，进入这次 workflow 的运行详情页。

页面底部会看到两个 artifact：
- `SGCCDownloader-exe`
- `SGCCDownloader-release`

它们的区别：
- `SGCCDownloader-exe`：只包含 `SGCCDownloader.exe`
- `SGCCDownloader-release`：包含完整发布目录，里面有 exe 和使用说明文档

推荐优先下载：
- 测试验证时：`SGCCDownloader-exe`
- 对外发人时：`SGCCDownloader-release`

## 8. 下载后怎么用
### 8.1 如果下载的是 `SGCCDownloader-exe`
- 解压 artifact
- 直接双击 `SGCCDownloader.exe`

### 8.2 如果下载的是 `SGCCDownloader-release`
- 解压 artifact
- 再解压其中的发布目录或 zip 包
- 双击 `SGCCDownloader.exe`

## 9. 如何判断构建成功
满足以下任意一种即可：
- GitHub Actions 显示绿色对勾
- artifact 下载成功
- `SGCCDownloader.exe` 可以在 Windows 上双击启动

## 10. 构建失败时优先看哪里
先看 GitHub Actions 日志中的以下步骤：
- `Setup Python`
- `Install dependencies`
- `Build release`

如果失败，大概率集中在：
- 依赖下载失败
- Python 版本不匹配
- 打包脚本路径错误
- Windows Runner 临时网络问题

## 11. 推荐你的实际操作顺序
如果你现在只是想尽快拿到一个可验证的 `.exe`，建议按这个顺序：

1. 把当前项目推到 GitHub
2. 触发 `build-windows`
3. 下载 `SGCCDownloader-exe`
4. 在 Windows 上验证功能
5. 没问题后再下载 `SGCCDownloader-release` 做正式交付

## 12. 一句话结论
你现在这台 macOS 机器不用负责生成 `.exe`；把项目推到 GitHub 后，直接用仓库内置的 Windows 构建工作流就能拿到可验证的 `SGCCDownloader.exe`。
