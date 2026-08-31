/**
 * Module contracts — the PURELY ADDITIVE module-ownership layer.
 *
 * This file declares, per architectural module, what it OWNS and CONSUMES
 * today — nothing aspirational. It is the typed, test-enforced spine of the
 * "module-contract modernization" design
 * (docs/reference/contracts/index.md).
 *
 * ## Honesty is the invariant
 *
 * Every field encodes what the code ACTUALLY does in the current workspace
 * shell,
 * not what it might do later. The colocated test
 * (`__tests__/moduleContract.test.ts`) turns that honesty into a checked
 * invariant:
 *   - `ownedSegments` are asserted against the real left-sidebar nav model
 *     (`buildWorkspaceNav`) — they are the actual destinations the shell
 *     renders for that module's section.
 *   - `ownedEndpoints` / `consumedEndpoints` are REFERENCES to real
 *     `apiClient` methods. The test asserts referential identity (function
 *     reference ===), never string matching. Rename or remove a client
 *     method and this file fails to compile, or the test fails on identity.
 *   - `produces` / `consumes` are constrained to `DtoName` — a compile-time
 *     union of the DTO type names that actually cross the wire. A typo or a
 *     removed DTO is a type error, not a silent string drift.
 *   - `emits` / `reactsTo` name the EXISTING store-subscription / poll edges
 *     (documentation only). The test pins them to the honest §3 edge set, so
 *     claiming an unwired seam (e.g. Operations→Bracket advancement) fails
 *     loudly.
 *
 * ## What this file is NOT
 *
 * It is imported ONLY by its test. It is never on an app runtime path — it
 * registers nothing, mounts nothing, mutates no store, and adds no router
 * dependency. It establishes ownership by REFERENCING the existing seams, not
 * by re-wiring them. No slice moves; no control-plane edit.
 */
import type { ArchModuleId } from '../product-shell/types';
export type { ArchModuleId } from '../product-shell/types';
import type { AppTab } from '../../store/uiStore';
import { apiClient } from '../../api/client';
import type {
  TournamentConfig,
  PlayerDTO,
  MatchDTO,
  ScheduleDTO,
  MatchStateDTO,
  TournamentStateDTO,
  LineupDTO,
  EntryDTO,
  EntryCommitResultDTO,
} from '../../api/dto';
import type {
  BracketTournamentDTO,
  BracketCreateIn,
  EventIn,
  ResultDTO,
  AssignmentDTO,
  PlayUnitDTO,
} from '../../api/bracketDto';

/**
 * The registry of DTO type names that cross the wire today. Used purely to
 * derive `DtoName` as a compile-time union — referencing the real exported
 * types means a renamed/removed DTO surfaces as a type error here.
 */
interface DtoRegistry {
  TournamentConfig: TournamentConfig;
  PlayerDTO: PlayerDTO;
  MatchDTO: MatchDTO;
  ScheduleDTO: ScheduleDTO;
  MatchStateDTO: MatchStateDTO;
  TournamentStateDTO: TournamentStateDTO;
  LineupDTO: LineupDTO;
  BracketTournamentDTO: BracketTournamentDTO;
  BracketCreateIn: BracketCreateIn;
  EventIn: EventIn;
  ResultDTO: ResultDTO;
  AssignmentDTO: AssignmentDTO;
  PlayUnitDTO: PlayUnitDTO;
  EntryDTO: EntryDTO;
  EntryCommitResultDTO: EntryCommitResultDTO;
}

/** A DTO type name that exists in the wire vocabulary (compile-time checked). */
type DtoName = keyof DtoRegistry;

/**
 * A backend endpoint, referenced as the actual `apiClient` method. The
 * `never[]` rest parameter is the correct variance to accept every concrete
 * method signature (a `never` arg is assignable to any real parameter) while
 * still constraining the value to be a function.
 */
export type ApiEndpoint = (...args: never[]) => unknown;

/**
 * The honest, named cross-module edges. These are the EXISTING
 * store-subscription / poll edges (NOT a new event bus). The test pins
 * descriptors to this set so an unwired seam can't be claimed.
 */
export type SeamEdge =
  | 'scheduleFinalized'
  | 'drawGenerated'
  | 'matchStateChanged'
  /** Entries → Meet | Bracket, spec §5 Seam A. Unlike the other three this is
   *  NOT a store subscription or a poll: it is an operator-pressed, server-side
   *  commit that writes roster players. Named here because it is a real,
   *  wired, cross-module write — the honesty rule is about whether the edge
   *  exists, not about which mechanism carries it. */
  | 'entriesCommitted';

export interface ModuleContract {
  id: ArchModuleId;
  /**
   * Literal enablement flag. Operations is a Tier-2 architectural module
   * with no enable flag, so `false`. The test asserts the literal ONLY; it
   * does not validate against `workspace_modules` / `ModuleId` (no
   * control-plane cross-check).
   */
  enableable: boolean;

  /** Left-sidebar nav segments this module's section owns (`buildWorkspaceNav`). */
  ownedSegments: readonly AppTab[];

  /** `apiClient` methods this module OWNS (its surfaces drive them). */
  ownedEndpoints: readonly ApiEndpoint[];
  /** `apiClient` methods this module CONSUMES but another module owns. */
  consumedEndpoints: readonly ApiEndpoint[];

  /** DTOs this module produces / consumes on EXISTING seams — honest only. */
  produces: readonly DtoName[];
  consumes: readonly DtoName[];

  /** Named existing edges (store-subscription or poll). Documentation. */
  emits: readonly SeamEdge[];
  reactsTo: readonly SeamEdge[];
}

// ---------------------------------------------------------------------------
// Five honest descriptors
// ---------------------------------------------------------------------------

/**
 * Meet — the scheduling engine. Owns the roster/matches/configuration IA and
 * the solve-job rail (`/tournaments/{id}/solve-jobs`, SP-CLOUD-1) plus the
 * proposal/advisory/suggestion routes. Consumes the shared `/state` blob and
 * live match-states as solve inputs. `/state` is shared, NOT owned (it
 * co-lives with control-plane CRUD in the tournaments router).
 */
export const meetContract: ModuleContract = {
  id: 'meet',
  enableable: true,
  ownedSegments: ['roster', 'matches', 'setup'],
  ownedEndpoints: [
    apiClient.submitSolveJob,
    apiClient.getSolveJob,
    apiClient.listSolveJobs,
    apiClient.cancelSolveJob,
    apiClient.generateMeetLineup,
    apiClient.runSolveJob,
    apiClient.validateMove,
    apiClient.createWarmRestartProposal,
    apiClient.createRepairProposal,
    apiClient.createManualEditProposal,
    apiClient.createDirectorActionProposal,
    apiClient.commitProposal,
    apiClient.cancelProposal,
    apiClient.getProposal,
    apiClient.getAdvisories,
    apiClient.getSuggestions,
    apiClient.applySuggestion,
    apiClient.dismissSuggestion,
  ],
  consumedEndpoints: [
    apiClient.getTournamentState, // shared /state, not owned
    apiClient.putTournamentState, // shared /state, not owned
    apiClient.getMatchStates, // reads live state owned by Operations
  ],
  produces: ['ScheduleDTO'],
  consumes: ['TournamentConfig', 'PlayerDTO', 'MatchDTO', 'MatchStateDTO'],
  emits: ['scheduleFinalized'], // = tournamentStore.setSchedule store edge
  reactsTo: [],
};

/**
 * Bracket — the draw engine. Owns the draw/configuration IA and every
 * `/bracket/*` route. Advancement is intra-bracket today
 * (`POST /bracket/results`), so it reacts to nothing cross-module.
 */
export const bracketContract: ModuleContract = {
  id: 'bracket',
  enableable: true,
  ownedSegments: ['bracket-roster', 'bracket-draws', 'bracket-matches', 'bracket-setup'],
  ownedEndpoints: [
    apiClient.getBracket,
    apiClient.createBracket,
    apiClient.deleteBracket,
    apiClient.scheduleNextBracketRound,
    apiClient.recordBracketResult,
    apiClient.bracketMatchAction,
    apiClient.validateBracketMove,
    apiClient.pinBracketMatch,
    apiClient.importBracketJson,
    apiClient.importBracketCsv,
    apiClient.bracketEventUpsert,
    apiClient.bracketEventGenerate,
    apiClient.bracketEventPatch,
    apiClient.bracketEventNextRound,
    apiClient.bracketEventDelete,
  ],
  consumedEndpoints: [],
  produces: ['BracketTournamentDTO', 'PlayUnitDTO', 'AssignmentDTO', 'ResultDTO'],
  consumes: ['BracketCreateIn', 'EventIn', 'ResultDTO'],
  emits: ['drawGenerated'],
  reactsTo: [], // advancement is intra-bracket today (no cross-module edge)
};

/**
 * Operations — the Tier-2 live-ops module (no enable flag). Owns the
 * Courts/Live IA and the match-states + commands routes. Consumes the bracket
 * snapshot to lay out bracket-origin live matches; consumes the schedule via
 * the store edge (named in `reactsTo`, not an owned endpoint).
 */
export const operationsContract: ModuleContract = {
  id: 'operations',
  enableable: false,
  ownedSegments: ['schedule', 'live', 'bracket-schedule', 'bracket-live'],
  ownedEndpoints: [
    apiClient.getMatchStates,
    apiClient.getMatchState,
    apiClient.getMatchVersion,
    apiClient.updateMatchState,
    apiClient.resetMatchStates,
    apiClient.submitCommand,
    apiClient.exportMatchStates,
    apiClient.importMatchStates,
    apiClient.importMatchStatesBulk,
  ],
  consumedEndpoints: [
    apiClient.getBracket, // reads bracket assignments for the live layout
  ],
  produces: ['MatchStateDTO'],
  consumes: ['ScheduleDTO', 'BracketTournamentDTO'], // both read off existing seams
  emits: ['matchStateChanged'], // = match-state write edge
  reactsTo: ['scheduleFinalized'], // = store subscription seeding live layout
};

/**
 * Display — the read-only output module. Owns the preview/configuration IA and
 * (since SP-CLOUD-2) the token-authenticated public projection routes
 * (`/display/{token}/*`) that serve the spectator board without a session.
 * Everything else it reads is a poll of endpoints other modules own. Reacts to
 * live match-state changes via its independent poll.
 */
export const displayContract: ModuleContract = {
  id: 'display',
  enableable: true,
  ownedSegments: ['tv', 'display-config'],
  ownedEndpoints: [
    apiClient.getDisplaySummary,
    apiClient.getDisplayState,
    apiClient.getDisplayMatchStates,
    apiClient.getDisplayBracket,
  ],
  consumedEndpoints: [
    apiClient.getTournamentState,
    apiClient.getMatchStates,
    apiClient.getBracket,
  ],
  produces: [],
  consumes: ['TournamentStateDTO', 'MatchStateDTO', 'BracketTournamentDTO'],
  emits: [],
  reactsTo: ['matchStateChanged'], // via its independent poll
};

/**
 * Entries — the INTAKE module (SP-E1-1). Owns the operator desk segment and
 * the three workspace-scoped desk routes. Its other surface, the public
 * `/e/{slug}` page and submit, is served by FastAPI and has no frontend at
 * all — so it is named here in prose and claimed in no field, because the
 * contract is checked against `apiClient` and the SPA nav, and claiming a
 * surface neither of them can see would be exactly the aspirational entry
 * this file exists to forbid.
 *
 * `produces: PlayerDTO` is Seam A: a confirmed entry becomes a roster player.
 * That is a genuine cross-module product — `meetContract` already declares
 * `PlayerDTO` in `consumes`, so the pairing closes. The Bracket half of the
 * same seam writes `bracket_participants` plus the blob's bracket roster, but
 * neither shape is in the wire registry, so nothing is claimed for it.
 *
 * The edge is emitted and, deliberately, reacted to by NOBODY client-side:
 * the commit is a server-side write, and Meet/Bracket pick the new players up
 * on their next `/state` read. A `reactsTo` on either engine would be a claim
 * about a subscription that does not exist.
 */
export const entriesContract: ModuleContract = {
  id: 'entries',
  enableable: true,
  ownedSegments: ['entries'],
  ownedEndpoints: [
    apiClient.listEntries,
    apiClient.confirmEntry,
    // E2 (program Phase 7): the rest of the operator's half of the §6 state
    // machine. Owned by Entries and reachable from nowhere else — the desk
    // is the only surface that decides an entry's fate.
    apiClient.rejectEntry,
    apiClient.promoteEntry,
    apiClient.withdrawEntry,
    // E5 (program Phase 10): the payment record. Owned by Entries — the
    // desk is the only surface that records a payment, and the submission
    // is the level that was actually paid.
    apiClient.markSubmissionPaid,
    apiClient.markSubmissionUnpaid,
    apiClient.commitEntries,
  ],
  consumedEndpoints: [],
  produces: ['PlayerDTO'], // via Seam A, into the Meet roster blob
  consumes: ['EntryDTO', 'EntryCommitResultDTO'],
  emits: ['entriesCommitted'],
  reactsTo: [],
};

/** All five descriptors, in declaration order. */
export const moduleContracts: readonly ModuleContract[] = [
  meetContract,
  bracketContract,
  operationsContract,
  displayContract,
  entriesContract,
];
