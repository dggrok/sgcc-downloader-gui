from __future__ import annotations

from typing import Callable

from PySide6.QtCore import QThread, Signal

from sgcc_gui.core.exceptions import CancelledError
from sgcc_gui.core.models import AttachmentRecord, DownloadResult, SearchParams, TaskProgress
from sgcc_gui.core.utils import CancelToken
from sgcc_gui.service.crawler_service import SGCCCrawlerService


class FunctionWorker(QThread):
    completed = Signal(object)
    failed = Signal(str)

    def __init__(self, fn: Callable[[], object]) -> None:
        super().__init__()
        self.fn = fn

    def run(self) -> None:
        try:
            self.completed.emit(self.fn())
        except Exception as exc:
            self.failed.emit(str(exc))


class PreviewWorker(QThread):
    progress = Signal(object)
    log = Signal(str)
    completed = Signal(object)
    failed = Signal(str)
    cancelled = Signal(str)

    def __init__(
        self,
        service_factory: Callable[[Callable[[str], None]], SGCCCrawlerService],
        search_params: SearchParams,
        cancel_token: CancelToken,
    ) -> None:
        super().__init__()
        self.service_factory = service_factory
        self.search_params = search_params
        self.cancel_token = cancel_token

    def run(self) -> None:
        try:
            service = self.service_factory(self.log.emit)
            results = service.preview_attachments(
                self.search_params,
                progress_cb=self.progress.emit,
                cancel_token=self.cancel_token,
            )
            self.completed.emit(results)
        except CancelledError as exc:
            self.cancelled.emit(str(exc))
        except Exception as exc:
            self.failed.emit(str(exc))


class DownloadWorker(QThread):
    progress = Signal(object)
    log = Signal(str)
    completed = Signal(object)
    failed = Signal(str)
    cancelled = Signal(str)

    def __init__(
        self,
        service_factory: Callable[[Callable[[str], None]], SGCCCrawlerService],
        records: list[AttachmentRecord],
        target_dir: str,
        create_subdir: bool,
        cancel_token: CancelToken,
    ) -> None:
        super().__init__()
        self.service_factory = service_factory
        self.records = records
        self.target_dir = target_dir
        self.create_subdir = create_subdir
        self.cancel_token = cancel_token

    def run(self) -> None:
        try:
            service = self.service_factory(self.log.emit)
            result = service.download_attachments(
                self.records,
                self.target_dir,
                self.create_subdir,
                progress_cb=self.progress.emit,
                cancel_token=self.cancel_token,
            )
            self.completed.emit(result)
        except CancelledError as exc:
            self.cancelled.emit(str(exc))
        except Exception as exc:
            self.failed.emit(str(exc))
