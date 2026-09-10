from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.compliance import router as compliance_router


app = FastAPI(title="GeM Compliance Platform", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4321", "http://127.0.0.1:4321"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(compliance_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "GeM Compliance Platform API", "docs": "/docs"}
