import unittest
from pathlib import Path

from sgcc_gui.core.utils import (
    build_task_subdir,
    clean_filename,
    ensure_pdf_suffix,
    ensure_unique_path,
    validate_download_directory,
)


class UtilsTestCase(unittest.TestCase):
    def test_clean_filename_replaces_invalid_chars(self) -> None:
        self.assertEqual(clean_filename('a/b:c*?"<>|'), "a_b_c______")

    def test_ensure_pdf_suffix_adds_extension(self) -> None:
        self.assertEqual(ensure_pdf_suffix("report"), "report.pdf")
        self.assertEqual(ensure_pdf_suffix("report.PDF"), "report.PDF")

    def test_ensure_unique_path_adds_counter(self) -> None:
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as temp_dir:
            tmp_path = Path(temp_dir)
            original = tmp_path / "same.pdf"
            original.write_bytes(b"first")
            unique = ensure_unique_path(original)
            self.assertEqual(unique.name, "same_1.pdf")

    def test_validate_download_directory_creates_path(self) -> None:
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as temp_dir:
            tmp_path = Path(temp_dir)
            target = tmp_path / "nested" / "downloads"
            result = validate_download_directory(str(target))
            self.assertTrue(result.exists())
            self.assertTrue(result.is_dir())

    def test_build_task_subdir_includes_org_name(self) -> None:
        value = build_task_subdir("国网湖北省电力有限公司")
        self.assertTrue(value.startswith("国网湖北省电力有限公司_"))

if __name__ == "__main__":
    unittest.main()
