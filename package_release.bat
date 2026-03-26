@echo off
setlocal

call build_windows.bat
if errorlevel 1 exit /b %errorlevel%

for /f %%i in ('.venv\Scripts\python scripts\release_meta.py release-name') do set RELEASE_NAME=%%i
set RELEASE_DIR=release\%RELEASE_NAME%

if exist release rmdir /s /q release
mkdir "%RELEASE_DIR%"

copy dist\SGCCDownloader.exe "%RELEASE_DIR%\SGCCDownloader.exe" >nul
copy README.md "%RELEASE_DIR%\README.md" >nul
copy docs\windows_user_guide.md "%RELEASE_DIR%\windows_user_guide.md" >nul
copy docs\windows_build_and_release.md "%RELEASE_DIR%\windows_build_and_release.md" >nul
copy docs\release_checklist.md "%RELEASE_DIR%\release_checklist.md" >nul
copy docs\code_signing_prep.md "%RELEASE_DIR%\code_signing_prep.md" >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%RELEASE_DIR%\*' -DestinationPath 'release\%RELEASE_NAME%.zip' -Force" >nul

echo.
echo 发布目录已生成：%CD%\%RELEASE_DIR%
echo 发布压缩包已生成：%CD%\release\%RELEASE_NAME%.zip

endlocal
