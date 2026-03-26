from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from sgcc_gui.core.exceptions import CancelledError, ValidationError
from sgcc_gui.core.models import AttachmentRecord, SearchParams
from sgcc_gui.core.utils import CancelToken
from sgcc_gui.service.crawler_service import SGCCCrawlerService


class FakeApiClient:
    pdf_base_url = "https://example.com/showPDF?filePath="

    def __init__(self) -> None:
        self.downloaded_files: list[Path] = []

    def load_org_roots(self):
        return []

    def load_org_children(self, parent_id: str):
        return []

    def search_orgs(self, keyword: str):
        return []

    def get_note_list(self, *, page: int, size: int, org_id: str, org_name: str, keyword: str):
        if page > 1:
            return []
        return [
            {"noticeId": "N001", "title": "第一次公告"},
            {"noticeId": "N002", "title": "第二次公告"},
        ]

    def get_notice_win(self, notice_id: str):
        return {}, notice_id == "N001"

    def get_win_file(self, notice_id: str):
        return [
            {"FILE_NAME": "中标结果公告", "FILE_PATH": "/docs/a.pdf"},
            {"FILE_NAME": "中标结果公告", "FILE_PATH": "/docs/a.pdf"},
        ]

    def download_file(self, pdf_url: str, destination: Path, progress_cb=None) -> None:
        destination.write_bytes(b"pdf")
        self.downloaded_files.append(destination)
        if progress_cb:
            progress_cb(3, 3)


def build_service(fake_api_client: FakeApiClient) -> SGCCCrawlerService:
    return SGCCCrawlerService(
        api_client=fake_api_client,
        delay_range=(0, 0),
        download_delay_range=(0, 0),
        sleeper=lambda _: None,
    )


class ServiceTestCase(unittest.TestCase):
    def test_preview_attachments_filters_invalid_notices_and_deduplicates(self) -> None:
        service = build_service(FakeApiClient())
        params = SearchParams(org_id="1001", org_name="国网湖北省电力有限公司", keyword="物资")

        records = service.preview_attachments(params)

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].notice_id, "N001")
        self.assertEqual(records[0].file_name, "中标结果公告")

    def test_preview_attachments_raises_when_cancelled(self) -> None:
        service = build_service(FakeApiClient())
        token = CancelToken()
        token.cancel()

        with self.assertRaises(CancelledError):
            service.preview_attachments(
                SearchParams(org_id="1001", org_name="国网湖北省电力有限公司"),
                cancel_token=token,
            )

    def test_download_attachments_creates_unique_files(self) -> None:
        fake_api = FakeApiClient()
        service = build_service(fake_api)
        records = [
            AttachmentRecord(
                notice_id="N001",
                notice_title="第一次公告",
                file_name="中标结果公告",
                file_path="/docs/a.pdf",
                full_url="https://example.com/a.pdf",
                org_name="国网湖北省电力有限公司",
            ),
            AttachmentRecord(
                notice_id="N002",
                notice_title="第二次公告",
                file_name="中标结果公告",
                file_path="/docs/b.pdf",
                full_url="https://example.com/b.pdf",
                org_name="国网湖北省电力有限公司",
            ),
        ]

        with TemporaryDirectory() as temp_dir:
            tmp_path = Path(temp_dir)
            result = service.download_attachments(records, str(tmp_path), create_subdir=False)

            self.assertEqual(result.success_count, 2)
            self.assertEqual(result.failure_count, 0)
            self.assertEqual(records[0].status, "成功")
            self.assertEqual(records[1].status, "成功")
            self.assertTrue((tmp_path / "中标结果公告.pdf").exists())
            self.assertTrue((tmp_path / "中标结果公告_1.pdf").exists())

    def test_download_attachments_requires_selected_records(self) -> None:
        fake_api = FakeApiClient()
        service = build_service(fake_api)
        record = AttachmentRecord(
            notice_id="N001",
            notice_title="第一次公告",
            file_name="中标结果公告",
            file_path="/docs/a.pdf",
            full_url="https://example.com/a.pdf",
            org_name="国网湖北省电力有限公司",
            selected=False,
        )

        with TemporaryDirectory() as temp_dir:
            with self.assertRaises(ValidationError):
                service.download_attachments([record], temp_dir, create_subdir=False)


if __name__ == "__main__":
    unittest.main()
