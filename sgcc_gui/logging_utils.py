from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from sgcc_gui.core.utils import get_log_dir


def configure_logging() -> tuple[logging.Logger, Path]:
    log_dir = get_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "app.log"

    logger = logging.getLogger("sgcc_gui")
    logger.setLevel(logging.INFO)
    logger.propagate = False

    if not logger.handlers:
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s - %(message)s",
            "%Y-%m-%d %H:%M:%S",
        )

        file_handler = RotatingFileHandler(log_path, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger, log_path
