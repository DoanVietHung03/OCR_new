import unittest
from pathlib import Path


class WebAssetsTest(unittest.TestCase):
    def test_index_uses_the_fastapi_static_mount(self):
        html = (Path(__file__).parents[1] / "web" / "index.html").read_text(encoding="utf-8")
        for asset in ("styles.css", "i18n.js", "app.js"):
            self.assertIn(f'"/web/{asset}"', html)


if __name__ == "__main__":
    unittest.main()
