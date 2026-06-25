/**
 * Module contracts — the PURELY ADDITIVE module-ownership layer.
 *
 * This file declares, per architectural module, what it OWNS and CONSUMES
 * today — nothing aspirational. It is the typed, test-enforced spine of the
 * "module-contract modernization" design
 * (docs/superpowers/plans/2026-06-25-module-architecture-modernization-design.md).
 *
 * ## Honesty is the invariant
 *
 * Every field encodes what the code ACTUALLY does on `dev/workspace-suite`,
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
import type { ModuleId } from '../product-shell/types';
import type { AppTab } from '../../store/uiStore';
import { apiClient } from '../../api/client';
import type {
  TournamentConfig,
  PlayerDTO,
  MatchDTO,
  ScheduleDTO,
  MatchStateDTO,
  TournamentStateDTO,
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
 * Tier-2 ids extend the Tier-1 `ModuleId` with the architectural
 * `'operations'` module. Type-level only — this never reads the
 * `workspace_modules` vocabulary at runtime.
 */
export type ArchModuleId = ModuleId | 'operations';

/**
 * The registry of DTO type names that cross the wire today. Used purely to
 * derive `DtoName` as a compile-time union — referencing the real exported
 * types means a renamed/removed DTO surfaces as a type error here.
 */
export interface DtoRegistry {
  TournamentConfig: TournamentConfig;
  PlayerDTO: PlayerDTO;
  MatchDTO: MatchDTO;
  ScheduleDTO: ScheduleDTO;
  MatchStateDTO: MatchStateDTO;
  TournamentStateDTO: TournamentStateDTO;
  BracketTournamentDTO: BracketTournamentDTO;
  BracketCreateIn: BracketCreateIn;
  EventIn: EventIn;
  ResultDTO: ResultDTO;
  AssignmentDTO: AssignmentDTO;
  PlayUnitDTO: PlayUnitDTO;
}

/** A DTO type name that exists in the wire vocabulary (compile-time checked). */
export type DtoName = keyof DtoRegistry;

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
export type SeamEdge = 'scheduleFinalized' | 'drawGenerated' | 'matchStateChanged';

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
// Four honest descriptors
// ---------------------------------------------------------------------------

/**
 * Meet — the scheduling engine. Owns the roster/matches/configuration IA and
 * the `/schedule` + proposal/advisory/suggestion routes. Consumes the shared
 * `/state` blob and live match-states as solve inputs. `/state` is shared,
 * NOT owned (it co-lives with control-plane CRUD in the tournaments router).
 */
export const meetContract: ModuleContract = {
  id: 'meet',
  enableable: true,
  ownedSegments: ['roster', 'matches', 'setup'],
  ownedEndpoints: [
    apiClient.generateSchedule,
    apiClient.generateScheduleWithProgress,
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
  ownedSegments: ['bracket-draw', 'bracket-setup'],
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
 * Display — the read-only output module. Owns the preview/configuration IA but
 * NO backend route; it only polls. Reacts to live match-state changes via its
 * independent poll.
 */
export const displayContract: ModuleContract = {
  id: 'display',
  enableable: true,
  ownedSegments: ['tv', 'display-config'],
  ownedEndpoints: [],
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

/** All four descriptors, in declaration order. */
export const moduleContracts: readonly ModuleContract[] = [
  meetContract,
  bracketContract,
  operationsContract,
  displayContract,
];
