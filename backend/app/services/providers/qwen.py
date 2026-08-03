from . import ProfileSpec

PROFILE = ProfileSpec(
    id="ollama_qwen35_9b",
    label="Qwen 3.5 9B (Ollama)",
    model="qwen3.5:9b",
    env_prefix="QWEN",
    prompt_version="9",
    message_order=("instruction", "image", "prompt"),
    thinking_mode=True,
)
