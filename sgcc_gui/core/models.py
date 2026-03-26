from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class OrgNode:
    id: str
    name: str
    parent_id: str | None = None
    has_children: bool = False
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SearchParams:
    org_id: str
    org_name: str
    keyword: str = ""
    start_page: int = 1
    page_size: int = 10
    max_pages: int = 1


@dataclass(slots=True)
class AttachmentRecord:
    notice_id: str
    notice_title: str
    file_name: str
    file_path: str
    full_url: str
    org_name: str
    selected: bool = True
    status: str = "待下载"
    local_path: str = ""
    error_message: str = ""

    @property
    def unique_key(self) -> str:
        return f"{self.notice_id}:{self.file_path}"


@dataclass(slots=True)
class TaskProgress:
    stage: str
    current: int
    total: int
    message: str


@dataclass(slots=True)
class DownloadResult:
    target_dir: Path
    success_count: int
    failure_count: int
