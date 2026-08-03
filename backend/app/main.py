from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from .auth import require_authenticated, require_safe_browser_request, router as auth_router
from .api.routes import router
from .services.providers import validate_profiles


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_profiles()
    yield


app = FastAPI(title="OCR API", version="0.2.0", lifespan=lifespan)
app.include_router(auth_router, prefix="/api")
app.include_router(router, prefix="/api")


@app.middleware("http")
async def auth_gate(request: Request, call_next):
    try:
        if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/auth/"):
            require_authenticated(request)
            require_safe_browser_request(request)
    except Exception as exc:
        from fastapi import HTTPException
        if not isinstance(exc, HTTPException):
            raise
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers={"Cache-Control": "no-store"})
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def invalid_request(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": {"code": "invalid_request", "message": "invalid_request"}},
    )

@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
