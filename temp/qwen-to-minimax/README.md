# Qwen to MiniMax one-time migration

This folder is standalone and disposable. It changes only JSON files under the
`OCR_DATA_DIR` passed on the command line. No project module imports it.

## Server runbook

Pause uploads, drain the queue, then stop the worker:

```bash
docker compose stop worker
```

Copy the script into the running backend container:

```bash
docker compose cp temp/qwen-to-minimax/migrate.py backend:/tmp/qwen-to-minimax.py
```

Inspect the real server data without writing:

```bash
docker compose exec backend python /tmp/qwen-to-minimax.py /data/jobs
```

Apply only after checking the dry-run counts:

```bash
docker compose exec backend python /tmp/qwen-to-minimax.py /data/jobs --apply
docker compose exec backend python /tmp/qwen-to-minimax.py /data/jobs
```

The second dry-run must report zero replacements. The apply command stores the
original JSON files under `/data/jobs/_migration_backups/`.

Restart the worker and refresh Sizing:

```bash
docker compose start worker
```

After verification, this source folder and the copied `/tmp` script may be
deleted. Keep the generated data backup until the result has been accepted.

## Local self-check

```bash
python temp/qwen-to-minimax/test_migrate.py
```
