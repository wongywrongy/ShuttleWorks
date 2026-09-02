"""Cloud ordered-ingestion and disposable-projection API."""
from sync.service import (
    apply_cloud_projection,
    ingest_batch,
    rebuild_cloud_projection,
)

__all__ = ["apply_cloud_projection", "ingest_batch", "rebuild_cloud_projection"]
