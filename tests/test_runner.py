import unittest

from ocr.runner import ADMIN_FIELDS, FIELD_ALIASES, PROMPT, message_text, is_terminal_page_error, request_body, validate_result


class RunnerTest(unittest.TestCase):
    def test_request_requires_the_field_schema_as_json(self):
        body = request_body("image", "model")
        self.assertEqual(body["response_format"], {"type": "json_object"})
        self.assertEqual(body["thinking"], {"type": "disabled"})
        self.assertIn("confidence", body["messages"][0]["content"][0]["text"])
        self.assertIn("page_index", body["messages"][0]["content"][0]["text"])
        self.assertIn('"bbox": [0, 0, 1, 1]', body["messages"][0]["content"][0]["text"])

    def test_invalid_model_json_is_terminal_for_a_document(self):
        self.assertTrue(is_terminal_page_error(ValueError("invalid_model_json")))
        self.assertFalse(is_terminal_page_error(RuntimeError("provider_network_error")))

    def test_qwen_text_content_blocks_are_unwrapped(self):
        response = {"choices": [{"message": {"content": [{"type": "text", "text": '{"fields": {}}'}]}}]}
        self.assertEqual(message_text(response), '{"fields": {}}')

    def test_valid_field_contract_is_accepted(self):
        result = validate_result({"fields": {"so_van_ban": {"value": "24", "confidence": 0.9, "bbox": [0, 0, 1, 1], "page_index": 0}}})
        self.assertEqual(result["fields"]["so_van_ban"]["value"], "24")

    def test_document_type_is_an_existing_ui_field(self):
        result = validate_result({"fields": {"document_type": {"value": "cong_van", "confidence": 0.9, "bbox": [0, 0, 1, 1], "page_index": 0}}})
        self.assertEqual(result["fields"]["document_type"]["value"], "cong_van")

    def test_all_known_aliases_are_normalized_to_schema_fields(self):
        payload = {"fields": {name: {"value": name, "confidence": 0.9, "bbox": [0, 0, 1, 1], "page_index": 0} for name in FIELD_ALIASES}}
        result = validate_result(payload)
        self.assertEqual(set(result["fields"]), set(FIELD_ALIASES.values()))

    def test_prompt_targets_header_and_signature_fields(self):
        self.assertTrue(all(name in PROMPT for name in ADMIN_FIELDS))
        self.assertIn("upper-center national title", PROMPT)
        self.assertIn("Ignore dates in the body", PROMPT)
        self.assertIn("TM., Q., KT., TL., TUQ.", PROMPT)


if __name__ == "__main__":
    unittest.main()
