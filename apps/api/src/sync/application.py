"""Route-facing synchronization application service.

This module owns transaction dispatch. Protocol behavior remains grouped in
the narrower authority/checkpoint/operation/ingestion/recovery/reconciliation
modules, while :mod:`sync.service` keeps compatibility exports for callers
that predate the split.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from db.models import CloudEventProjection, TournamentAuthority
from identity import offline_sessions
from repositories import LocalRepository


class SyncApplication:
    """Route-facing boundary; HTTP adapters never own transactions."""

    def __init__(self, repo: LocalRepository):
        self._repo = repo

    @staticmethod
    def _service():
        from sync import service

        return service

    def checkout(self, *, tournament_id, node_id, schema_version):  # noqa: ANN001
        service = self._service()
        return self._repo.stage(
            service.begin_checkout,
            tournament_id=tournament_id,
            node_id=node_id,
            schema_version=schema_version,
        )

    def enroll_device(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(self._service().enroll_device, **kwargs)

    def revoke_device(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(self._service().revoke_device, **kwargs)

    def issue_offline_session(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.execute_transaction(offline_sessions.issue, **kwargs)

    def bootstrap_offline_session(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.execute_transaction(offline_sessions.bootstrap, **kwargs)

    def revoke_offline_session(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.execute_transaction(offline_sessions.revoke, **kwargs)

    def import_checkpoint(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(self._service().import_checkpoint, **kwargs)

    def ready(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(self._service().mark_ready, **kwargs)

    def return_to_cloud(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(self._service().return_to_cloud, **kwargs)

    def planned_transfer(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(self._service().planned_transfer, **kwargs)

    def recover_lost_node(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(self._service().recover_lost_node, **kwargs)

    def latest_authority(
        self, tournament_id: uuid.UUID
    ) -> tuple[TournamentAuthority, int, int, datetime | None, int, str | None]:
        return self._repo.execute_query(
            self._service()._latest_authority_status, tournament_id
        )

    def projection(self, tournament_id: uuid.UUID) -> CloudEventProjection:
        service = self._service()
        projection = self._repo.execute_query(service._projection, tournament_id)
        if projection is None:
            raise service.ProtocolError(
                404, "projection_not_found", "Cloud projection is not available"
            )
        return projection

    def rebuild_projection(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(self._service().rebuild_cloud_projection, **kwargs)

    def upload(self, *, tournament_id, capability, batch):  # noqa: ANN001, ANN201
        return self._repo.stage(
            self._service().ingest_batch,
            tournament_id=tournament_id,
            capability=capability,
            batch=batch,
        )

    def status(
        self,
        *,
        tournament_id: uuid.UUID,
        authority_epoch: int,
        capability: str,
    ) -> tuple[int, int]:
        return self._repo.execute_query(
            self._service()._sync_status,
            tournament_id,
            authority_epoch,
            capability,
        )

    def list_quarantines(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.execute_query(self._service().list_quarantines, **kwargs)

    def resolve_quarantine(self, **kwargs):  # noqa: ANN003, ANN201
        return self._repo.stage(
            self._service()._resolve_quarantine_and_get, **kwargs
        )
