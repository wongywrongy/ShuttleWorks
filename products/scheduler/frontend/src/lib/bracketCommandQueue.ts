/**
 * IndexedDB-backed bracket result queue (SP-F3).
 *
 * Mirrors the meet operator command queue (``commandQueue.ts``) but
 * carries a bracket *result* rather than meet's operational verbs — ADR
 * 0006 keeps the two match models separate, so the queue stays a parallel
 * module sharing the same IndexedDB plumbing pattern rather than forcing a
 * shared discriminated union (bracket's ``ok`` outcome returns the full
 * tournament DTO, a different shape from meet's status/version envelope).
 *
 * It gives bracket result writes the same three guarantees meet has:
 *
 *  1. **Idempotency.** Each command carries a client-generated UUID; the
 *     same id enqueued twice is a no-op, so a double-tap or a reload-then-
 *     retry never records a result twice.
 *  2. **Optimistic concurrency.** ``seenVersion`` is the ``BracketMatch``
 *     version the client last observed; the backend rejects a stale write
 *     with 409 ``stale_version`` so a second operator can't clobber a
 *     result silently.
 *  3. **Persistence + reconnect resilience.** A command survives a reload
 *     and replays on the next flush.
 *
 * The primitive is React-agnostic; the ``useBracketResultQueue`` hook
 * translates outcomes onto the bracket view-model.
 */
import type { BracketScore, BracketTournamentDTO } from '../api/bracketDto';

const DB_NAME = 'scheduler-bracket-result-queue';
const DB_VERSION = 1;
const STORE_NAME = 'bracket-results';

export type BracketCommandStatus = 'pending' | 'applied' | 'rejected' | 'conflict';

export interface BracketResultCommand {
  /** Client-generated UUID — the idempotency key. */
  id: string;
  /** Discriminator so a future shared queue can tell command kinds apart. */
  kind: 'bracket_result';
  tournamentId: string;
  /** The bracket play-unit (match) id the result is recorded against. */
  matchId: string;
  winnerSide: 'A' | 'B';
  finishedAtSlot: number | null;
  walkover: boolean;
  /** Set-by-set score (Sets mode); null in winner-only mode. */
  score: BracketScore | null;
  /** ``BracketMatch.version`` the client observed at submit time. */
  seenVersion: number;
  /** ``Date.now()`` at enqueue time — drives flush ordering. */
  createdAt: number;
  /** Network retry counter; bumped on each transient failure. */
  attempts: number;
  status: BracketCommandStatus;
  /** Server-supplied rejection reason for ``rejected`` / ``conflict`` rows. */
  rejectionReason?: string;
}

/**
 * Normalised server response — the caller (apiClient) turns axios
 * responses + errors into this shape so the queue is testable without
 * coupling to the transport.
 *
 * - ``ok``: 200 carrying the authoritative post-write tournament DTO.
 * - ``staleVersion``: 409 ``stale_version`` — recovery is refetch.
 * - ``conflict``: 409 (any other flavour, including the already-recorded
 *   guard) — permanent rejection, no retry.
 * - ``networkError``: anything else — leave pending, retry next flush.
 */
export type BracketSubmitResult =
  | { kind: 'ok'; dto: BracketTournamentDTO }
  | { kind: 'staleVersion'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'networkError'; message: string };

export type BracketSubmitFn = (
  command: BracketResultCommand,
) => Promise<BracketSubmitResult>;

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

/** Reset the cached database handle — tests call this between cases. */
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
 * Persist a command. If a row with the same id already exists, the call is
 * a no-op — the existing entry wins (queue-layer idempotency mirrors the
 * backend's optimistic-concurrency guard). Returns the command id.
 */
export async function enqueue(
  command: Omit<BracketResultCommand, 'attempts' | 'status'> & {
    attempts?: number;
    status?: BracketCommandStatus;
  },
): Promise<string> {
  const row: BracketResultCommand = {
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

/** Every ``pending`` command, sorted by ``createdAt`` ASC. */
export async function getPending(): Promise<BracketResultCommand[]> {
  return withStore('readonly', async (store) => {
    const all = await reqAsPromise(
      store.getAll() as IDBRequest<BracketResultCommand[]>,
    );
    return all
      .filter((c) => c.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);
  });
}

/** Look up a single command by id. */
export async function getById(
  id: string,
): Promise<BracketResultCommand | undefined> {
  return withStore('readonly', async (store) => {
    return (await reqAsPromise(store.get(id))) as
      | BracketResultCommand
      | undefined;
  });
}

/** Mark a command as applied (server returned 200). */
async function markApplied(id: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    const row = (await reqAsPromise(store.get(id))) as
      | BracketResultCommand
      | undefined;
    if (!row) return;
    row.status = 'applied';
    store.put(row);
  });
}

/**
 * Mark a command as rejected (server returned 409). ``kind`` controls the
 * persisted status — ``stale_version`` → ``rejected`` (recoverable via
 * refetch), ``conflict`` → ``conflict`` (permanent).
 */
async function markRejected(
  id: string,
  kind: 'stale_version' | 'conflict',
  reason: string,
): Promise<void> {
  await withStore('readwrite', async (store) => {
    const row = (await reqAsPromise(store.get(id))) as
      | BracketResultCommand
      | undefined;
    if (!row) return;
    row.status = kind === 'stale_version' ? 'rejected' : 'conflict';
    row.rejectionReason = reason;
    store.put(row);
  });
}

/** Record a transient failure — bump ``attempts``, leave ``pending``. */
async function markRetryable(id: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    const row = (await reqAsPromise(store.get(id))) as
      | BracketResultCommand
      | undefined;
    if (!row) return;
    row.attempts += 1;
    store.put(row);
  });
}

/**
 * Drain the queue: send every pending command in createdAt order, one at a
 * time. Returns per-command outcomes so the hook can settle the view-model
 * and surface conflicts. A failure on one command does not abort the loop.
 */
export async function flush(
  submit: BracketSubmitFn,
): Promise<Array<{ id: string; result: BracketSubmitResult }>> {
  const pending = await getPending();
  const outcomes: Array<{ id: string; result: BracketSubmitResult }> = [];
  for (const command of pending) {
    let result: BracketSubmitResult;
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
