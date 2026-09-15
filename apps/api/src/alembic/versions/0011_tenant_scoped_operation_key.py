"""rebuild — an operation id is tenant-scoped (security/debt program P09).

``event_operations.operation_id`` was a global primary key while the id itself
is minted by a client, so two workspaces shared one id space: the second
workspace to use an id the first had already burned had its command answered as
a replay and never executed. The key becomes ``(tournament_id, operation_id)``,
which keeps the id a client sends the id it can replay while making the tenant
part of the identity rather than a column beside it.

``sync_outbox`` is the one child of that key. It carries the tenant too and
references its parent compositely; its rows are backfilled from the parent they
already point at, so no delivery state is lost. Existing rows keep their
``operation_id`` values — the new key admits every one of them, because a global
key was strictly narrower than a per-tenant one.

Forward-only: the composite key admits data the single-column key cannot, so a
downgrade could not be lossless.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


_EVENT_OPERATION_COLUMNS = (
    ("operation_id", sa.Uuid(), False),
    ("tournament_id", sa.Uuid(), False),
    ("node_id", sa.Uuid(), False),
    ("authority_epoch", sa.Integer(), False),
    ("sequence", sa.Integer(), False),
    ("actor_id", sa.Uuid(), False),
    ("command_type", sa.String(length=100), False),
    ("aggregate_type", sa.String(length=50), False),
    ("aggregate_id", sa.String(length=200), False),
    ("expected_version", sa.Integer(), True),
    ("payload", sa.JSON(), False),
    ("occurred_at_local", sa.DateTime(timezone=True), False),
    ("accepted_at_node", sa.DateTime(timezone=True), False),
    ("traceparent", sa.String(length=128), True),
    ("schema_version", sa.Integer(), False),
)


def _event_operations() -> sa.Table:
    """The table as ``0001`` left it — SQLite batch mode copies from this."""
    table = sa.Table(
        "event_operations",
        sa.MetaData(),
        *(sa.Column(name, type_, nullable=nullable)
          for name, type_, nullable in _EVENT_OPERATION_COLUMNS),
        sa.PrimaryKeyConstraint("operation_id", name="pk_event_operations"),
        sa.UniqueConstraint(
            "tournament_id",
            "authority_epoch",
            "sequence",
            name="uq_event_operations_epoch_sequence",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "authority_epoch"],
            [
                "tournament_authority_epochs.tournament_id",
                "tournament_authority_epochs.epoch",
            ],
            name=(
                "fk_event_operations_tournament_id_authority_epoch"
                "_tournament_authority_epochs"
            ),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name="fk_event_operations_tournament_id_tournaments",
            ondelete="CASCADE",
        ),
    )
    sa.Index(
        "ix_event_operations_aggregate",
        table.c.tournament_id,
        table.c.aggregate_type,
        table.c.aggregate_id,
    )
    return table


def _sync_outbox(*, tenant_column: bool, parent_fk: bool) -> sa.Table:
    columns = [sa.Column("operation_id", sa.Uuid(), nullable=False)]
    if tenant_column:
        columns.append(sa.Column("tournament_id", sa.Uuid(), nullable=True))
    columns += [
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("permanently_blocked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    ]
    constraints = [sa.PrimaryKeyConstraint("operation_id", name="pk_sync_outbox")]
    if parent_fk:
        constraints.append(
            sa.ForeignKeyConstraint(
                ["operation_id"],
                ["event_operations.operation_id"],
                name="fk_sync_outbox_operation_id_event_operations",
                ondelete="CASCADE",
            )
        )
    table = sa.Table("sync_outbox", sa.MetaData(), *columns, *constraints)
    sa.Index(
        "ix_sync_outbox_pending",
        table.c.acknowledged_at,
        table.c.permanently_blocked_at,
        table.c.next_attempt_at,
    )
    return table


def upgrade() -> None:
    # 1. Carry the tenant onto the child, read off the parent it already names.
    #    An outbox row without a parent cannot exist (the FK below was enforcing
    #    that), so the DELETE is a belt on top of braces rather than a policy.
    op.add_column("sync_outbox", sa.Column("tournament_id", sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE sync_outbox SET tournament_id = ("
        " SELECT e.tournament_id FROM event_operations e"
        " WHERE e.operation_id = sync_outbox.operation_id)"
    )
    op.execute("DELETE FROM sync_outbox WHERE tournament_id IS NULL")

    # 2. Release the single-column reference. PostgreSQL refuses to drop a
    #    primary key another table still points at, so this must precede step 3.
    with op.batch_alter_table(
        "sync_outbox", copy_from=_sync_outbox(tenant_column=True, parent_fk=True)
    ) as batch:
        batch.drop_constraint(
            "fk_sync_outbox_operation_id_event_operations", type_="foreignkey"
        )

    # 3. The key itself.
    with op.batch_alter_table("event_operations", copy_from=_event_operations()) as batch:
        batch.drop_constraint("pk_event_operations", type_="primary")
        batch.create_primary_key(
            "pk_event_operations", ["tournament_id", "operation_id"]
        )

    # 4. The child inherits the whole key.
    with op.batch_alter_table(
        "sync_outbox", copy_from=_sync_outbox(tenant_column=True, parent_fk=False)
    ) as batch:
        batch.alter_column("tournament_id", existing_type=sa.Uuid(), nullable=False)
        batch.drop_constraint("pk_sync_outbox", type_="primary")
        batch.create_primary_key("pk_sync_outbox", ["tournament_id", "operation_id"])
        batch.create_foreign_key(
            "fk_sync_outbox_tournament_id_operation_id_event_operations",
            "event_operations",
            ["tournament_id", "operation_id"],
            ["tournament_id", "operation_id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
