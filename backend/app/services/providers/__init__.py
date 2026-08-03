from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from typing import Any

from ...settings import Settings, settings
from ..sizing import checksum


@dataclass(frozen=True)
class ProfileSpec:
    id: str
    label: str
    model: str
    env_prefix: str
    prompt_version: str
    message_order: tuple[str, ...] = ("prompt", "image")
    image_instruction: str = "Analyze this image."
    thinking_mode: bool | None = None
    structured_output: bool = False
    max_tokens_by_task: tuple[tuple[str, int], ...] = ()
    tasks: tuple[str, ...] = ("full_ocr", "metadata")
    page_modes: tuple[str, ...] = ("all", "auto", "first,last")
    max_pages: int = 100
    processing_modes: tuple[str, ...] = (
        "administrative_document", "dossier_cover", "combined_dossier",
    )
    base_url: str = ""
    api_key: str = ""
    timeout_seconds: float = 180
    endpoint_external: bool = True
    provider_config_version: str = "default"

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    @property
    def fingerprint(self) -> str:
        return checksum({
            "provider_profile_id": self.id,
            "model": self.model,
            "prompt_version": self.prompt_version,
            "message_order": self.message_order,
            "image_instruction": self.image_instruction,
            "thinking_mode": self.thinking_mode,
            "structured_output": self.structured_output,
            "max_tokens_by_task": self.max_tokens_by_task,
            "provider_config_version": self.provider_config_version,
        })

    def max_tokens(self, task: str) -> int | None:
        return dict(self.max_tokens_by_task).get(task)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id, "label": self.label, "model": self.model,
            "external": self.endpoint_external,
            "status": "configured" if self.configured else "not_configured",
            "tasks": list(self.tasks), "page_modes": list(self.page_modes),
            "max_pages": self.max_pages, "processing_modes": list(self.processing_modes),
        }


from .minimax import PROFILE as MINIMAX  # noqa: E402
from .qwen import PROFILE as QWEN  # noqa: E402

PROFILES = (MINIMAX, QWEN)
REGISTRY = {profile.id: profile for profile in PROFILES}
if len(REGISTRY) != len(PROFILES):
    raise ValueError("Provider profile IDs must be unique")


def _resolve(spec: ProfileSpec, config: Settings) -> ProfileSpec:
    prefix = spec.env_prefix.casefold()
    if prefix == "minimax":
        legacy = not config.minimax_base_url
        if legacy and config.ocr_model and config.ocr_model != spec.model:
            raise ValueError("OCR_MODEL must match MiniMax-M3")
        return replace(
            spec,
            base_url=config.minimax_base_url or config.ocr_base_url,
            api_key=config.minimax_api_key or config.ocr_api_key,
            timeout_seconds=config.minimax_timeout_seconds if not legacy else config.ocr_timeout_seconds,
            endpoint_external=config.minimax_endpoint_external if not legacy else config.ocr_endpoint_external,
            provider_config_version=config.minimax_config_version if not legacy else config.ocr_provider_config_version,
        )
    limits = tuple(
        (task, value) for task, value in (
            ("metadata", config.qwen_max_tokens_metadata),
            ("full_ocr", config.qwen_max_tokens_full_ocr),
            ("segmentation", config.qwen_max_tokens_segmentation),
        ) if value is not None
    )
    return replace(
        spec, base_url=config.qwen_base_url, api_key=config.qwen_api_key,
        timeout_seconds=config.qwen_timeout_seconds,
        endpoint_external=config.qwen_endpoint_external,
        provider_config_version=config.qwen_config_version,
        thinking_mode=config.qwen_thinking_mode,
        structured_output=config.qwen_structured_output,
        max_tokens_by_task=limits,
    )


def enabled_profiles(config: Settings = settings) -> tuple[ProfileSpec, ...]:
    raw = config.ocr_enabled_profiles.strip()
    ids = [item.strip() for item in raw.split(",") if item.strip()] if raw else [config.ocr_provider]
    if not ids or len(ids) != len(set(ids)) or any(item not in REGISTRY for item in ids):
        raise ValueError("OCR_ENABLED_PROFILES contains duplicate or unknown IDs")
    default = config.ocr_default_profile.strip() or ids[0]
    if default not in ids:
        raise ValueError("OCR_DEFAULT_PROFILE must be enabled")
    return tuple(_resolve(REGISTRY[item], config) for item in ids)


def default_profile(config: Settings = settings) -> ProfileSpec:
    profiles = enabled_profiles(config)
    target = config.ocr_default_profile.strip() or profiles[0].id
    return next(profile for profile in profiles if profile.id == target)


def validate_profiles(config: Settings = settings) -> None:
    profile = default_profile(config)
    if not profile.configured:
        raise ValueError("OCR_DEFAULT_PROFILE is not configured")
    if profile.id == "minimax" and not config.minimax_base_url:
        logging.getLogger(__name__).warning("Using legacy OCR_* provider configuration")


def get_profile(
    profile_id: str, config: Settings = settings, *,
    expected_fingerprint: str = "", require_configured: bool = False,
) -> ProfileSpec:
    try:
        profile = next(profile for profile in enabled_profiles(config) if profile.id == profile_id)
    except StopIteration as exc:
        raise ValueError("provider_profile_unavailable") from exc
    if expected_fingerprint and expected_fingerprint != profile.fingerprint:
        raise ValueError("provider_profile_changed")
    if require_configured and not profile.configured:
        raise ValueError("provider_profile_unavailable")
    return profile
