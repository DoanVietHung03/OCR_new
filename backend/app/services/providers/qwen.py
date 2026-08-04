from . import ProfileSpec

PROFILE = ProfileSpec(
    id="ollama_qwen3_vl_8b",
    label="Qwen3-VL 8B (Ollama)",
    model="qwen3-vl:8b",
    env_prefix="QWEN",
    prompt_version="10",
    message_order=("instruction", "image", "prompt"),
    thinking_mode=True,
)
