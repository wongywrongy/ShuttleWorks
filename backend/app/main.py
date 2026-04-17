"""Main FastAPI application - stateless scheduler for school sparring."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import schedule, match_state, tournament_state

app = FastAPI(
    title="School Sparring Scheduler API",
    description="Stateless scheduling API for school sparring matches using CP-SAT solver",
    version="2.0.0",
)

# CORS middleware - explicit dev origins for local development
DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",  # Vite alternate port
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",  # Vite preview
    "http://127.0.0.1:4173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_credentials=False,  # Set to False when not using cookies/session auth
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["*"],
)

# Register API routers
app.include_router(schedule.router)
app.include_router(match_state.router)
app.include_router(tournament_state.router)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "2.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
