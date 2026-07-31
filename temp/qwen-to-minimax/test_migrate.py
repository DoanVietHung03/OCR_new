import json
import tempfile
import unittest
from pathlib import Path

import migrate


class MigrationTest(unittest.TestCase):
    def test_relabels_measurements_and_backdates_price_profile(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            job = root / "job-1"
            operations = job / "provider_operations"
            operations.mkdir(parents=True)
            (job / "job.json").write_text(
                json.dumps(
                    {
                        "ocr_method": "qwen",
                        "provider": "qwen",
                        "provider_profile_id": "qwen",
                        "model": "MiniMax-M3",
                    }
                ),
                encoding="utf-8",
            )
            (operations / "op-1.json").write_text(
                json.dumps(
                    {
                        "provider_profile_id": "qwen",
                        "model": "MiniMax-M3",
                        "started_at": "2026-07-01T00:00:00+00:00",
                    }
                ),
                encoding="utf-8",
            )
            (root / "_sizing.json").write_text(
                json.dumps(
                    {
                        "revision": 2,
                        "price_profiles": [
                            {
                                "id": "price-old-qwen",
                                "provider_profile_id": "qwen",
                                "model": "MiniMax-M3",
                                "effective_from": "2026-07-10T00:00:00+00:00",
                                "archived": True,
                            },
                            {
                                "id": "price-active-qwen",
                                "provider_profile_id": "qwen",
                                "model": "MiniMax-M3",
                                "effective_from": "2026-07-20T00:00:00+00:00",
                            },
                            {
                                "id": "price-current",
                                "provider_profile_id": "minimax",
                                "model": "MiniMax-M3",
                                "effective_from": "2026-07-30T00:00:00+00:00",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            snapshots = root / "_sizing" / "snapshots"
            snapshots.mkdir(parents=True)
            (snapshots / "snapshot-1.json").write_text(
                json.dumps(
                    {
                        "id": "snapshot-1",
                        "provenance": {
                            "filters": {"provider_profile_id": "qwen"}
                        },
                    }
                ),
                encoding="utf-8",
            )

            updates, replacements, earliest, warnings = migrate.plan(root)
            self.assertEqual(replacements, 7)
            self.assertEqual(earliest, "2026-07-01T00:00:00+00:00")
            self.assertEqual(warnings, [])
            backup = root / "_migration_backups" / "test"
            migrate.apply(root, updates, backup)

            self.assertEqual(migrate.plan(root)[1], 0)
            profiles = migrate.load(root / "_sizing.json")["price_profiles"]
            self.assertTrue(
                all(profile["provider_profile_id"] == "minimax" for profile in profiles)
            )
            self.assertEqual(
                [profile["id"] for profile in profiles if not profile.get("archived")],
                ["price-current"],
            )
            self.assertEqual(
                profiles[2]["effective_from"],
                earliest,
            )
            self.assertEqual(
                migrate.load(snapshots / "snapshot-1.json")["provenance"]["filters"][
                    "provider_profile_id"
                ],
                "minimax",
            )
            self.assertTrue((backup / "manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
