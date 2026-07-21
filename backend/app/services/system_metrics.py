from __future__ import annotations

import csv
import shutil
import subprocess
from pathlib import Path

import psutil


def _number(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def gpu_metrics() -> dict:
    executable = shutil.which("nvidia-smi")
    if not executable:
        return {"status": "unavailable", "devices": []}
    try:
        result = subprocess.run(
            [
                executable,
                "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=2,
        )
        devices = []
        for row in csv.reader(result.stdout.splitlines(), skipinitialspace=True):
            if len(row) != 6:
                raise ValueError("unexpected nvidia-smi output")
            devices.append({
                "index": int(row[0]),
                "name": row[1].strip(),
                "utilization_percent": _number(row[2]),
                "memory_used_mb": _number(row[3]),
                "memory_total_mb": _number(row[4]),
                "temperature_c": _number(row[5]),
            })
        return {"status": "available", "devices": devices}
    except (OSError, subprocess.SubprocessError, ValueError):
        return {"status": "error", "devices": []}


def system_metrics(data_dir: str) -> dict:
    cpu = memory = disk = None
    try:
        cpu = psutil.cpu_percent()
        memory = psutil.virtual_memory().percent
    except Exception:
        pass
    try:
        usage = shutil.disk_usage(Path(data_dir).resolve())
        disk = {
            "used_bytes": usage.used,
            "total_bytes": usage.total,
            "free_bytes": usage.free,
            "percent": round(usage.used / usage.total * 100, 1) if usage.total else 0,
        }
    except OSError:
        pass
    return {"cpu_percent": cpu, "memory_percent": memory, "disk": disk, "gpu": gpu_metrics()}
