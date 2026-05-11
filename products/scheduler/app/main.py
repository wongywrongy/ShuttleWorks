"""
Standalone CP-SAT Tournament Scheduling API.

DEPRECATED: This module is maintained for backward compatibility.
New deployments should use adapters.fastapi.main instead.

This module redirects to the new FastAPI adapter.
"""
from adapters.fastapi.main import app

__all__ = ["app"]

# Import the app from the new adapter
# This maintains backward compatibility while using the new implementation


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
