import unittest


class PackageTest(unittest.TestCase):
    def test_package_imports(self):
        import ocr

        self.assertIsNotNone(ocr)

