import unittest

from ocr.runner import request_body, validate_result


class RunnerTest(unittest.TestCase):
    def test_request_requires_the_field_schema_as_json(self):
        body = request_body("image", "model")
        self.assertEqual(body["response_format"], {"type": "json_object"})
        self.assertIn("confidence", body["messages"][0]["content"][0]["text"])
        self.assertIn("page_index", body["messages"][0]["content"][0]["text"])

    def test_valid_field_contract_is_accepted(self):
        result = validate_result({"fields": {"so_van_ban": {"value": "24", "confidence": 0.9, "bbox": [0, 0, 1, 1], "page_index": 0}}})
        self.assertEqual(result["fields"]["so_van_ban"]["value"], "24")


if __name__ == "__main__":
    unittest.main()
