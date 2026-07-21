from __future__ import annotations

import csv
import platform
import shutil
import subprocess
from pathlib import Path

import psutil


def _number(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def _safe_text(value: str) -> str:
    return " ".join(value.split())[:120]


def gpu_metrics() -> dict:
    executable = shutil.which("nvidia-smi")
    if not executable:
        return {"status": "unavailable", "devices": []}
    try:
        result = subprocess.run(
            [
                executable,
                "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,driver_version",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=2,
        )
        devices = []
        for row in csv.reader(result.stdout.splitlines(), skipinitialspace=True):
            if len(row) != 8:
                raise ValueError("unexpected nvidia-smi output")
            devices.append({
                "index": int(row[0]),
                "name": _safe_text(row[1]),
                "utilization_percent": _number(row[2]),
                "memory_used_mb": _number(row[3]),
                "memory_total_mb": _number(row[4]),
                "temperature_c": _number(row[5]),
                "power_w": _number(row[6]),
                "driver_version": _safe_text(row[7]),
            })
        return {"status": "available", "devices": devices}
    except (OSError, subprocess.SubprocessError, ValueError):
        return {"status": "error", "devices": []}


def system_metrics(data_dir: str) -> dict:
    cpu = memory_percent = cpu_details = memory = runtime = disk = None
    loads: tuple[float | None, float | None, float | None] = (None, None, None)
    try:
        cpu = psutil.cpu_percent()
    except Exception:
        pass
    try:
        loads = tuple(round(float(value), 3) for value in psutil.getloadavg())
    except Exception:
        pass
    try:
        cpu_details = {
            "model": _safe_text(platform.processor()),
            "physical_cores": psutil.cpu_count(logical=False),
            "logical_cores": psutil.cpu_count(logical=True),
            "percent": cpu,
            "load_1m": loads[0], "load_5m": loads[1], "load_15m": loads[2],
        }
    except Exception:
        pass
    try:
        read = psutil.virtual_memory()
        memory_percent = read.percent
        memory = {"total_bytes": read.total, "used_bytes": read.used,
                  "available_bytes": read.available, "percent": read.percent}
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
    except Exception:
        pass
    try:
        runtime = {
            "os_family": _safe_text(platform.system()),
            "architecture": _safe_text(platform.machine()),
            "python_version": _safe_text(platform.python_version()),
        }
    except Exception:
        pass
    return {
        "cpu_percent": cpu,
        "memory_percent": memory_percent,
        "cpu": cpu_details,
        "memory": memory,
        "runtime": runtime,
        "disk": disk,
        "gpu": gpu_metrics(),
    }
