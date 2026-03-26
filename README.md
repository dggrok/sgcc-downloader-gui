# SGCC Downloader GUI

Windows 桌面版国网 ECP 公告附件下载工具。

## 功能
- 机构树懒加载与机构搜索
- 公告检索与附件预览
- 勾选后下载 PDF
- 自定义下载目录与任务子目录
- 本地配置记忆与日志落盘

## 运行模式
- `源码运行`：适合开发调试，需要先安装 Python 3.11+ 和依赖。
- `打包运行`：适合最终用户，直接双击 `SGCCDownloader.exe`，通常不需要额外安装 Python。

## 运行
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run_gui.py
```

## 调试命令行
```bash
python -m sgcc_gui.cli --org-id 2019061900000259 --org-name "国网安徽省电力有限公司" --keyword 物资 --page 1 --size 10 --max-pages 1
```

## 打包
Windows 环境下执行：
```bat
build_windows.bat
```

## 发布
- 构建完成后，执行 `package_release.bat` 会生成可交付目录。
- 详细流程见 [docs/windows_build_and_release.md](/Users/yaw/Desktop/demo/tools/docs/windows_build_and_release.md)。
- macOS 上拿 Windows `.exe` 的流程见 [docs/github_actions_build_guide.md](/Users/yaw/Desktop/demo/tools/docs/github_actions_build_guide.md)。
- 最终用户说明见 [docs/windows_user_guide.md](/Users/yaw/Desktop/demo/tools/docs/windows_user_guide.md)。
- 发布检查清单见 [docs/release_checklist.md](/Users/yaw/Desktop/demo/tools/docs/release_checklist.md)。
- 签名前准备见 [docs/code_signing_prep.md](/Users/yaw/Desktop/demo/tools/docs/code_signing_prep.md)。
- 应用版本统一维护在 [version.py](/Users/yaw/Desktop/demo/tools/sgcc_gui/version.py)。
