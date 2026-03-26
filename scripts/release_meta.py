from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sgcc_gui.version import (  # noqa: E402
    APP_NAME,
    APP_VERSION,
    COMPANY_NAME,
    COPYRIGHT,
    FILE_DESCRIPTION,
    INTERNAL_NAME,
    PRODUCT_NAME,
)


def version_tuple_text(version: str) -> tuple[str, str]:
    parts = version.split(".")
    while len(parts) < 4:
        parts.append("0")
    numeric = tuple(int(part) for part in parts[:4])
    dotted = ".".join(str(part) for part in numeric)
    comma = ", ".join(str(part) for part in numeric)
    return dotted, comma


def render_version_file() -> str:
    dotted, comma = version_tuple_text(APP_VERSION)
    return f"""VSVersionInfo(
  ffi=FixedFileInfo(
    filevers=({comma}),
    prodvers=({comma}),
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo([
      StringTable(
        '040904B0',
        [
          StringStruct('CompanyName', '{COMPANY_NAME}'),
          StringStruct('FileDescription', '{FILE_DESCRIPTION}'),
          StringStruct('FileVersion', '{dotted}'),
          StringStruct('InternalName', '{INTERNAL_NAME}'),
          StringStruct('OriginalFilename', '{APP_NAME}.exe'),
          StringStruct('ProductName', '{PRODUCT_NAME}'),
          StringStruct('ProductVersion', '{dotted}'),
          StringStruct('LegalCopyright', '{COPYRIGHT}')
        ]
      )
    ]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)"""


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: release_meta.py [version|release-name|version-file <path>]")
        return 1

    command = argv[1]
    if command == "version":
        print(APP_VERSION)
        return 0
    if command == "release-name":
        print(f"{APP_NAME}-windows-v{APP_VERSION}")
        return 0
    if command == "version-file":
        if len(argv) < 3:
            print("missing output path for version-file", file=sys.stderr)
            return 1
        output_path = Path(argv[2])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(render_version_file(), encoding="utf-8")
        print(output_path)
        return 0

    print(f"unknown command: {command}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
