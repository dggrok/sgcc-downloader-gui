from __future__ import annotations

import random
import time
from pathlib import Path
from typing import Callable, Iterable

from sgcc_gui.core.api_client import SGCCApiClient
from sgcc_gui.core.exceptions import CancelledError, ValidationError
from sgcc_gui.core.models import AttachmentRecord, DownloadResult, OrgNode, SearchParams, TaskProgress
from sgcc_gui.core.utils import (
    CancelToken,
    build_task_subdir,
    clean_filename,
    default_download_root,
    ensure_pdf_suffix,
    ensure_unique_path,
    validate_download_directory,
)


class SGCCCrawlerService:
    def __init__(
        self,
        api_client: SGCCApiClient | None = None,
        logger: Callable[[str], None] | None = None,
        delay_range: tuple[float, float] = (0.5, 1.5),
        download_delay_range: tuple[float, float] = (1.0, 2.0),
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.api_client = api_client or SGCCApiClient(logger=logger)
        self.logger = logger
        self.delay_range = delay_range
        self.download_delay_range = download_delay_range
        self.sleeper = sleeper

    def _log(self, message: str) -> None:
        if self.logger:
            self.logger(message)

    def _sleep_between(self, delay_range: tuple[float, float]) -> None:
        low, high = delay_range
        if high <= 0:
            return
        self.sleeper(random.uniform(low, high))

    def load_org_roots(self) -> list[OrgNode]:
        self._log("加载机构根节点。")
        return self.api_client.load_org_roots()

    def load_org_children(self, parent_id: str) -> list[OrgNode]:
        self._log(f"加载机构子节点：{parent_id}")
        return self.api_client.load_org_children(parent_id)

    def search_orgs(self, keyword: str) -> list[OrgNode]:
        if not keyword.strip():
            raise ValidationError("机构搜索关键字不能为空。")
        self._log(f"搜索机构：{keyword}")
        return self.api_client.search_orgs(keyword.strip())

    def preview_attachments(
        self,
        search_params: SearchParams,
        progress_cb: Callable[[TaskProgress], None] | None = None,
        cancel_token: CancelToken | None = None,
    ) -> list[AttachmentRecord]:
        cancel_token = cancel_token or CancelToken()
        if not search_params.org_id or not search_params.org_name:
            raise ValidationError("请选择机构后再查询。")

        records: list[AttachmentRecord] = []
        seen: set[str] = set()

        self._log(
            f"开始查询公告：机构={search_params.org_name}({search_params.org_id})，"
            f"关键词={search_params.keyword or '空'}，页数={search_params.max_pages}"
        )

        for offset in range(search_params.max_pages):
            cancel_token.raise_if_cancelled()
            page = search_params.start_page + offset
            if progress_cb:
                progress_cb(TaskProgress("page", offset, search_params.max_pages, f"正在加载第 {page} 页公告"))

            notes = self.api_client.get_note_list(
                page=page,
                size=search_params.page_size,
                org_id=search_params.org_id,
                org_name=search_params.org_name,
                keyword=search_params.keyword,
            )
            if not notes:
                self._log(f"第 {page} 页无数据，结束查询。")
                break

            for index, note in enumerate(notes, start=1):
                cancel_token.raise_if_cancelled()
                notice_id = str(note.get("noticeId") or "").strip()
                title = str(note.get("title") or "").strip()
                if not notice_id:
                    continue

                if progress_cb:
                    progress_cb(TaskProgress("notice", index, len(notes), f"处理公告：{title or notice_id}"))

                _, valid_file = self.api_client.get_notice_win(notice_id)
                if not valid_file:
                    self._log(f"公告跳过：{notice_id} 无有效附件。")
                    continue

                files = self.api_client.get_win_file(notice_id)
                for file_info in files:
                    file_name = str(file_info.get("FILE_NAME") or "").strip()
                    file_path = str(file_info.get("FILE_PATH") or "").strip()
                    if not file_name or not file_path:
                        continue
                    record = AttachmentRecord(
                        notice_id=notice_id,
                        notice_title=title,
                        file_name=file_name,
                        file_path=file_path,
                        full_url=f"{self.api_client.pdf_base_url}{file_path}",
                        org_name=search_params.org_name,
                    )
                    if record.unique_key in seen:
                        continue
                    seen.add(record.unique_key)
                    records.append(record)
                self._sleep_between(self.delay_range)

        self._log(f"预览完成，共找到 {len(records)} 个附件。")
        if progress_cb:
            progress_cb(TaskProgress("done", len(records), len(records), f"共找到 {len(records)} 个附件"))
        return records

    def download_attachments(
        self,
        records: Iterable[AttachmentRecord],
        target_dir: str,
        create_subdir: bool,
        progress_cb: Callable[[TaskProgress], None] | None = None,
        cancel_token: CancelToken | None = None,
    ) -> DownloadResult:
        cancel_token = cancel_token or CancelToken()
        selected = [record for record in records if record.selected]
        if not selected:
            raise ValidationError("请先勾选要下载的附件。")

        root_dir = validate_download_directory(target_dir)
        if create_subdir:
            root_dir = validate_download_directory(str(root_dir / build_task_subdir(selected[0].org_name)))

        success_count = 0
        failure_count = 0

        for index, record in enumerate(selected, start=1):
            try:
                cancel_token.raise_if_cancelled()
                record.status = "下载中"
                record.error_message = ""
                progress_message = f"下载文件 {index}/{len(selected)}：{record.file_name}"
                self._log(progress_message)
                if progress_cb:
                    progress_cb(TaskProgress("download", index - 1, len(selected), progress_message))

                safe_name = ensure_pdf_suffix(clean_filename(record.file_name) or "未命名文件")
                target_path = ensure_unique_path(Path(root_dir) / safe_name)
                self.api_client.download_file(record.full_url, target_path)
                record.local_path = str(target_path)
                record.status = "成功"
                success_count += 1
                self._sleep_between(self.download_delay_range)
            except CancelledError:
                record.status = "已取消"
                raise
            except Exception as exc:
                record.status = "失败"
                record.error_message = str(exc)
                failure_count += 1
                self._log(f"下载失败：{record.file_name}，原因：{exc}")

        if progress_cb:
            progress_cb(TaskProgress("done", len(selected), len(selected), f"下载完成，成功 {success_count} 个"))
        self._log(f"下载完成，成功 {success_count} 个，失败 {failure_count} 个，目录：{root_dir}")
        return DownloadResult(target_dir=root_dir, success_count=success_count, failure_count=failure_count)
