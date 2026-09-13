# Reset a pre-launch database

Pre-launch databases are disposable and support only the current schema.
A database with a retired Alembic revision cannot be upgraded through the
squashed history. A blob at another version also requires a reset. Do not use
`alembic stamp head` to bypass either error.

For development, create a fresh simulator-backed fixture:

```sh
make fixture-up
```

If a fixture is already running, reset it in one line:

```sh
make fixture-down && make fixture-up
```

This starts the API, console, and entrant site against a new disposable SQLite
database and seeds the canonical tournaments through HTTP. It does not replace
an unrelated `local.db`; point development work at the fixture's API. See
[the shared fixture guide](run-the-shared-fixture.md) for ports and teardown.

For the owner-controlled demo, once its deferred cutover is resumed:

```sh
make demo-rebuild
```

This command backs up and quarantines the demo database, rebuilds the images,
creates the schema from empty, and reseeds the simulator fixtures. It discards
the live demo state, so it is the explicit pre-launch reset operation. The
[recorded demo deferral](../reference/registration-competition-implementation.md) remains in
place until the owner resumes that deployment.

Startup failures are fatal. SQLite upgrades retain five standalone snapshots
under `BACKEND_DATA_DIR/backups/pre-migration-<revision>-<timestamp>.db`, then
check all foreign keys. These are recovery evidence for a faulty direct change;
reset/reseed remains the supported pre-launch undo workflow. Downgrades raise.
