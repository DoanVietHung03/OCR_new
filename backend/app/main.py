from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from .api.routes import router

app = FastAPI(title="OCR API", version="0.2.0")
app.include_router(router, prefix="/api")


@app.exception_handler(RequestValidationError)
async def invalid_request(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": {"code": "invalid_request", "message": "invalid_request"}},
    )

@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
