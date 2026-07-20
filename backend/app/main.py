from fastapi import FastAPI
from .api.routes import router

app = FastAPI(title="OCR API", version="0.2.0")
app.include_router(router, prefix="/api")

@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
