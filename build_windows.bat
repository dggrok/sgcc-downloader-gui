@echo off
setlocal
set PYINSTALLER_CONFIG_DIR=%CD%\.pyinstaller

if not exist .venv (
    py -3.11 -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
mkdir build
python scripts\release_meta.py version-file build\version_info.txt
pyinstaller --noconfirm SGCCDownloader.spec

endlocal
