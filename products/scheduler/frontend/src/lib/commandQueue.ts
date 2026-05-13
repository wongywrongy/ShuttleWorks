/**
 * IndexedDB-backed operator command queue (Step F of the
 * architecture-adjustment arc).
 *
 * Every operator action — call to court, start, finish, retire,
 * uncall — is enqueued here before going out over the wire. The
 * queue gives us three things the bare `apiClient.submitCommand`
 * call doesn't:
 *
 * 1. **Persistence across reloads.** A command typed in just before
 *    a tab reload survives — flushed on next mount.
 * 2. **Reconnect resilience.** Commands queued while FastAPI is
 *    unreachable replay on the next reachability transition.
 * 3. **Single source of truth for "what's pending."** Step G's UI
 *    badge subscribes via `getPending()` filtered by match id; no
 *    parallel "did we just optimistically apply X" bookkeeping.
 *
 * The primitive is React-agnostic; consumer code (the
 * ``useCommandQueue`` hook) is responsible for translating the
 * status updates onto the Zustand store.
 */

const DB_NAME = 'scheduler-command-queue';
const DB_VERSION = 1;
const STORE_NAME = 'commands';

export type MatchAction =
  | 'call_to_court'
  | 'start_match'
  | 'finish_match'
  | 'retire_match'
  | 'uncall';

export type CommandStatus = 'pending' | 'applied' | 'rejected' | 'conflict';

export interface QueuedCommand {
  /** Client-generated UUID — the idempotency key the backend honours. */
  id: string;
  tournamentId: string;
  matchId: string;
  action: MatchAction;
  payload: Record<string, unknown>;
  /** ``matches.version`` the client observed at submit time. */
  seenVersion: number;
  /** ``Date.now()`` at enqueue time — drives the flush ordering. */
  createdAt: number;
  /** Network retry counter; bumped on each transient failure. */
  attempts: number;
  status: CommandStatus;
  /** Server-supplied rejection_reason for `rejected` / `conflict` rows. */
  rejectionReason?: string;
}

/**
 * Server response shape returned by the apiClient.submitCommand
 * caller, normalised so the queue can be tested without coupling to
 * axios. The caller turns axios responses + errors into this shape.
 *
 * - ``ok``: 200 from the server. Carries the authoritative
 *   post-write match state (current status + version).
 * - ``staleVersion``: 409 with ``error: 'stale_version'``. Rollback
 *   strategy is refetch (caller's responsibility).
 * - ``conflict``: 409 with ``error: 'conflict'``. Permanent
 *   rejection — no retry.
 * - ``networkError``: anything else (timeout, 5xx, no response).
 *   Leave pending, retry next flush.
 */
export type SubmitResult =
  | {
      kind: 'ok';
      matchStatus: string;
      matchVersion: number;
      courtId: number | null;
      timeSlot: number | null;
    }
  | { kind: 'staleVersion'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'networkError'; message: string };

export type SubmitFn = (command: QueuedCommand) => Promise<SubmitResult>;

// ---- IndexedDB open / upgrade ------------------------------------------

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
  return _dbPromise;
}

/**
 * Reset the cached database handle. Tests call this between cases
 * to close + drop the database before the next case opens a fresh
 * one. Production never needs to. The close is important — a stale
 * open connection blocks ``deleteDatabase`` and causes the test
 * harness to hang on its blocked event.
 */
export async function _resetDbHandleForTests(): Promise<void> {
  if (_dbPromise) {
    try {
      const db = await _dbPromise;
      db.close();
    } catch {
      // ignore — promise may have rejected; nothing to close
    }
  }
  _dbPromise = null;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let result: T;
    Promise.resolve(fn(store))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- Public API ---------------------------------------------------------

/**
 * Persist a command. If a row with the same id already exists, the
 * call is a no-op — the existing entry wins (idempotency at the
 * queue layer mirrors the backend's idempotency on `commands.id`).
 * Returns the command id so callers can reference it later.
 */
export async function enqueue(
  command: Omit<QueuedCommand, 'attempts' | 'status'> & {
    attempts?: number;
    status?: CommandStatus;
  },
): Promise<string> {
  const row: QueuedCommand = {
    attempts: 0,
    status: 'pending',
    ...command,
  };
  await withStore('readwrite', async (store) => {
    const existing = await reqAsPromise(store.get(row.id));
    if (existing) return; // dedupe — same id, same outcome
    store.put(row);
  });
  return row.id;
}

/**
 * Return every command whose status is `pending`, sorted by
 * `createdAt` ASC. Step G's UI badge filters this dict by matchId.
 */
export async function getPending(): Promise<QueuedCommand[]> {
  return withStore('readonly', async (store) => {
    const all = await reqAsPromise(store.getAll() as IDBRequest<QueuedCommand[]>);
    return all
      .filter((c) => c.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);
  });
}

/**
 * Look up a single command by id. Used by tests + the hook's result
 * resolution path.
 */
export async function getById(id: string): Promise<QueuedCommand | undefined> {
  return withStore('readonly', async (store) => {
    return (await reqAsPromise(store.get(id))) as QueuedCommand | undefined;
  });
}

/**
 * Mark a command as applied. The hook calls this after a successful
 * 200; UI surfaces (Step G) react to the status change.
 */
export async function markApplied(id: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    const row = (await reqAsPromise(store.get(id))) as QueuedCommand | undefined;
    if (!row) return;
    row.status = 'applied';
    store.put(row);
  });
}

/**
 * Mark a command as rejected (server returned 409). ``kind`` controls
 * the persisted status field — ``stale_version`` and ``conflict`` are
 * different terminal states the UI may want to distinguish (e.g. only
 * the conflict flavour needs an explicit dismiss).
 */
export async function markRejected(
  id: string,
  kind: 'stale_version' | 'conflict',
  reason: string,
): Promise<void> {
  await withStore('readwrite', async (store) => {
    const row = (await reqAsPromise(store.get(id))) as QueuedCommand | undefined;
    if (!row) return;
    row.status = kind === 'stale_version' ? 'rejected' : 'conflict';
    row.rejectionReason = reason;
    store.put(row);
  });
}

/**
 * Record a transient failure — increments ``attempts``, leaves the
 * row in ``pending`` so the next flush retries.
 */
export async function markRetryable(id: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    const row = (await reqAsPromise(store.get(id))) as QueuedCommand | undefined;
    if (!row) return;
    row.attempts += 1;
    store.put(row);
  });
}

/**
 * Drain the queue: send every pending command in createdAt order,
 * one at a time. Returns an array of per-command results so the
 * caller (the hook) can apply rollbacks and update its Zustand store
 * appropriately. Failing on one command does not abort the loop —
 * the next pending command still gets its chance.
 *
 * Concurrency: serialised by IndexedDB's transaction boundary plus
 * the per-iteration ``await``. The prompt is explicit: "one at a
 * time — order matters."
 */
export async function flush(
  submit: SubmitFn,
): Promise<Array<{ id: string; result: SubmitResult }>> {
  const pending = await getPending();
  const outcomes: Array<{ id: string; result: SubmitResult }> = [];
  for (const command of pending) {
    let result: SubmitResult;
    try {
      result = await submit(command);
    } catch (err) {
      result = {
        kind: 'networkError',
        message: err instanceof Error ? err.message : String(err),
      };
    }
    outcomes.push({ id: command.id, result });
    switch (result.kind) {
      case 'ok':
        await markApplied(command.id);
        break;
      case 'staleVersion':
        await markRejected(command.id, 'stale_version', result.message);
        break;
      case 'conflict':
        await markRejected(command.id, 'conflict', result.message);
        break;
      case 'networkError':
        await markRetryable(command.id);
        break;
    }
  }
  return outcomes;
}

/**
 * Wipe every command — pending and terminal alike. Tests call this
 * between cases; production code shouldn't need it (terminal-state
 * rows are visible audit trail and can be trimmed by a future
 * housekeeping pass).
 */
export async function _clearAllForTests(): Promise<void> {
  await withStore('readwrite', async (store) => {
    store.clear();
  });
}
