from __future__ import annotations

import argparse

from sgcc_gui.core.models import SearchParams
from sgcc_gui.core.utils import default_download_root
from sgcc_gui.logging_utils import configure_logging
from sgcc_gui.service.crawler_service import SGCCCrawlerService
from sgcc_gui.version import APP_VERSION


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SGCC 调试命令行")
    parser.add_argument("--version", action="version", version=f"%(prog)s {APP_VERSION}")
    parser.add_argument("--org-id", required=True, help="机构 ID")
    parser.add_argument("--org-name", required=True, help="机构名称")
    parser.add_argument("--keyword", default="", help="关键词")
    parser.add_argument("--page", type=int, default=1, help="起始页")
    parser.add_argument("--size", type=int, default=10, help="每页数量")
    parser.add_argument("--max-pages", type=int, default=1, help="最大页数")
    parser.add_argument("--download-dir", default="", help="下载目录")
    parser.add_argument("--download", action="store_true", help="是否直接下载")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    logger, log_path = configure_logging()
    service = SGCCCrawlerService(logger=logger.info)
    params = SearchParams(
        org_id=args.org_id,
        org_name=args.org_name,
        keyword=args.keyword,
        start_page=args.page,
        page_size=args.size,
        max_pages=args.max_pages,
    )
    attachments = service.preview_attachments(params)
    print(f"找到 {len(attachments)} 个附件，日志：{log_path}")
    for record in attachments:
        print(f"- {record.file_name} | {record.notice_title}")

    if args.download and attachments:
        download_dir = args.download_dir or ""
        result = service.download_attachments(attachments, download_dir or str(default_download_root()), True)
        print(f"下载完成：{result.target_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
