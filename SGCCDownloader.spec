# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

ROOT = Path(SPECPATH)
app_name = "SGCCDownloader"
icon_file = ROOT / "assets" / "app.ico"
version_file = ROOT / "build" / "version_info.txt"

a = Analysis(
    ["run_gui.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name=app_name,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    icon=str(icon_file) if icon_file.exists() else None,
    version=str(version_file) if version_file.exists() else None,
    codesign_identity=None,
    entitlements_file=None,
)
