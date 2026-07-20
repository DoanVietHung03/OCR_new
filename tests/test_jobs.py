import tempfile
import unittest
from pathlib import Path

from ocr.jobs import JobStore


class JobStoreTest(unittest.TestCase):
    def test_pdf_upload_reaches_ready_and_rejects_non_pdf(self):
        with tempfile.TemporaryDirectory() as directory:
            store = JobStore(Path(directory))
            job = store.create({"file_count": 1, "ocr_method": "qwen"})
            with self.assertRaisesRegex(ValueError, "unsupported_file"):
                store.add_pdf(job["id"], "note.txt", b"text")
            ready = store.add_pdf(job["id"], "folder/document.pdf", b"%PDF-1.7")
            self.assertEqual(ready["status"], "ready")
            self.assertEqual(ready["uploaded_files"], 1)


if __name__ == "__main__":
    unittest.main()
