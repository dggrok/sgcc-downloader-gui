from __future__ import annotations

import hashlib
import os
import random
import threading
import tempfile
from datetime import datetime
from pathlib import Path

from sgcc_gui.core.exceptions import CancelledError, ValidationError


def generate_random_cookie() -> str:
    rand_str = "".join(random.choices("abcdefghijklmnopqrstuvwxyz1234567890", k=32))
    md5_hash = hashlib.md5(rand_str.encode("utf-8")).hexdigest().upper()
    return f"JSESSIONID={md5_hash}"


def clean_filename(filename: str) -> str:
    invalid_chars = r'\/:*?"<>|'
    cleaned = filename
    for char in invalid_chars:
        cleaned = cleaned.replace(char, "_")
    return cleaned.strip().rstrip(".")


def ensure_pdf_suffix(filename: str) -> str:
    if filename.lower().endswith(".pdf"):
        return filename
    return f"{filename}.pdf"


def default_download_root() -> Path:
    downloads = Path.home() / "Downloads"
    base_dir = downloads if downloads.exists() else Path.home()
    return base_dir / "SGCCDownloader"


def get_log_dir() -> Path:
    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "SGCCDownloader" / "logs"
    home_dir = Path.home() / ".sgcc_downloader" / "logs"
    try:
        home_dir.parent.mkdir(parents=True, exist_ok=True)
        return home_dir
    except OSError:
        return Path(tempfile.gettempdir()) / "sgcc_downloader" / "logs"


def build_task_subdir(org_name: str) -> str:
    safe_org = clean_filename(org_name) or "任务"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{safe_org}_{timestamp}"


def ensure_unique_path(path: Path) -> Path:
    if not path.exists():
        return path

    stem = path.stem
    suffix = path.suffix
    counter = 1
    while True:
        candidate = path.with_name(f"{stem}_{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def validate_download_directory(path_text: str) -> Path:
    if not path_text.strip():
        raise ValidationError("下载目录不能为空。")

    path = Path(path_text).expanduser()
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ValidationError(f"无法创建下载目录: {exc}") from exc

    if not path.is_dir():
        raise ValidationError("下载路径不是有效目录。")

    test_file = path / ".write_test"
    try:
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)
    except OSError as exc:
        raise ValidationError(f"下载目录不可写: {exc}") from exc

    return path


class CancelToken:
    def __init__(self) -> None:
        self._event = threading.Event()

    def cancel(self) -> None:
        self._event.set()

    def is_cancelled(self) -> bool:
        return self._event.is_set()

    def raise_if_cancelled(self) -> None:
        if self.is_cancelled():
            raise CancelledError("任务已取消。")
