from __future__ import annotations

import sys
from typing import Callable

from PySide6.QtWidgets import QApplication

from sgcc_gui.logging_utils import configure_logging
from sgcc_gui.service.crawler_service import SGCCCrawlerService
from sgcc_gui.ui.main_window import MainWindow
from sgcc_gui.version import APP_NAME, APP_VERSION, COMPANY_NAME


def build_service_factory(logger) -> Callable[[Callable[[str], None] | None], SGCCCrawlerService]:
    def factory(log_callback: Callable[[str], None] | None = None) -> SGCCCrawlerService:
        return SGCCCrawlerService(logger=log_callback)

    return factory


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(APP_VERSION)
    app.setOrganizationName(COMPANY_NAME)

    logger, log_path = configure_logging()
    logger.info("应用启动，日志文件：%s", log_path)

    window = MainWindow(build_service_factory(logger), logger)
    window.show()
    return app.exec()
