/**
 * Read-only introspection tests for the additive module-contract layer.
 *
 * These assert that the four descriptors in `moduleContract.ts` are HONEST
 * against the already-built app:
 *   1. `ownedSegments` match the real left-sidebar nav model
 *      (`buildWorkspaceNav`) — ownership asserted against the running IA.
 *   2. `ownedEndpoints` / `consumedEndpoints` are REFERENTIALLY IDENTICAL to
 *      real `apiClient` methods (function reference ===), never string-matched.
 *   3. `enableable` literals + the named seam edges are pinned, so an unwired
 *      seam (e.g. Operations→Bracket advancement) can't be silently claimed.
 *
 * The suite is strictly READ-ONLY: it imports the descriptors, the api client,
 * and the nav builder; it never mutates a store, never calls an endpoint, and
 * never perturbs the control plane.
 */
import { describe, expect, it } from 'vitest';
import {
  bracketContract,
  displayContract,
  entriesContract,
  meetContract,
  moduleContracts,
  operationsContract,
  type ApiEndpoint,
  type ArchModuleId,
  type ModuleContract,
  type SeamEdge,
} from '../moduleContract';
import { apiClient } from '../../../api/client';
import { buildWorkspaceNav, type WsSection } from '../../product-shell/workspaceNav';
import type { ModuleId } from '../../product-shell/types';
import type { AppTab } from '../../../store/uiStore';

// ---------------------------------------------------------------------------
// Helpers — all pure, no side effects.
// ---------------------------------------------------------------------------

// BASELINE EDIT (SP-E1-1): `entries` added. The nav renders a section only for
// an ENABLED module, so without it here the Entries section never appears and
// `ownedSegments` would have nothing to be checked against.
const ALL_MODULES: Set<ModuleId> = new Set<ModuleId>([
  'meet',
  'bracket',
  'display',
  'entries',
]);

/** The exact set of segments the real nav renders for each section id, taken
 *  as the union across both engine kinds (Operations' Courts/Live items differ
 *  by kind). This is the ground truth `ownedSegments` is checked against. */
function navSegmentsBySection(): Map<WsSection['id'], Set<AppTab>> {
  const out = new Map<WsSection['id'], Set<AppTab>>();
  for (const kind of ['meet', 'bracket'] as const) {
    const nav = buildWorkspaceNav(kind, ALL_MODULES);
    for (const section of nav.sections) {
      const set = out.get(section.id) ?? new Set<AppTab>();
      for (const item of section.items) set.add(item.segment);
      out.set(section.id, set);
    }
  }
  return out;
}

/** Every callable method on the built `apiClient`, gathered from both the
 *  instance's own properties and its prototype, so the referential-identity
 *  check doesn't silently depend on how methods are declared. */
function apiClientMethods(): Set<unknown> {
  const methods = new Set<unknown>();
  const seen = new Set<string>();
  let obj: object | null = apiClient as unknown as object;
  while (obj && obj !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(obj)) {
      if (name === 'constructor' || seen.has(name)) continue;
      seen.add(name);
      const value = (apiClient as unknown as Record<string, unknown>)[name];
      if (typeof value === 'function') methods.add(value);
    }
    obj = Object.getPrototypeOf(obj);
  }
  return methods;
}

const CONTRACT_BY_ID: Record<ArchModuleId, ModuleContract> = {
  meet: meetContract,
  bracket: bracketContract,
  operations: operationsContract,
  display: displayContract,
  entries: entriesContract,
};

// ---------------------------------------------------------------------------
// Descriptor sanity
// ---------------------------------------------------------------------------

describe('moduleContract — descriptor set', () => {
  it('exposes exactly the five architectural modules, keyed by their id', () => {
    // BASELINE EDIT (SP-E1-1): `entries` appended. The assertion is ORDER
    // SENSITIVE and the position is a decision, not an accident — entries is
    // last here for the same reason it is last in `MODULE_ORDER`: it is the
    // only cloud-only module, and putting it after the three every workspace
    // has keeps the existing order stable for everyone.
    expect(moduleContracts.map((c) => c.id)).toEqual([
      'meet',
      'bracket',
      'operations',
      'display',
      'entries',
    ]);
    for (const contract of moduleContracts) {
      expect(CONTRACT_BY_ID[contract.id]).toBe(contract);
    }
  });

  it('pins the enableable literal (Operations is the only Tier-2 module)', () => {
    expect(meetContract.enableable).toBe(true);
    expect(bracketContract.enableable).toBe(true);
    expect(displayContract.enableable).toBe(true);
    // BASELINE EDIT (SP-E1-1): Entries is Tier-1 enableable (Q1) — its
    // cloud-only-ness is a SEEDING rule, not a tier. Asserting `false` here
    // would conflate "not present in local mode" with "always on".
    expect(entriesContract.enableable).toBe(true);
    expect(operationsContract.enableable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ownership against the already-built nav
// ---------------------------------------------------------------------------

describe('moduleContract — ownedSegments match buildWorkspaceNav', () => {
  const sectionSegments = navSegmentsBySection();

  it('every module section the nav renders has a descriptor', () => {
    // The nav's section ids are exactly the architectural module ids.
    // BASELINE EDIT (SP-E1-1): `entries` added — a nav section without a
    // descriptor is precisely the drift this assertion exists to catch.
    expect([...sectionSegments.keys()].sort()).toEqual(
      ['bracket', 'display', 'entries', 'meet', 'operations'].sort(),
    );
  });

  for (const contract of moduleContracts) {
    it(`${contract.id} owns exactly its nav-section segments`, () => {
      const expected = sectionSegments.get(contract.id);
      expect(expected, `nav has no section for ${contract.id}`).toBeDefined();
      expect([...contract.ownedSegments].sort()).toEqual(
        [...(expected as Set<AppTab>)].sort(),
      );
    });
  }

  it('does not claim AppTab segments that are not nav destinations', () => {
    // bracket-events / bracket-draw exist in AppTab but are internal surfaces
    // (reached from Draws, not the sidebar) — no descriptor may claim them.
    const claimed = new Set<AppTab>(
      moduleContracts.flatMap((c) => [...c.ownedSegments]),
    );
    expect(claimed.has('bracket-events')).toBe(false);
    expect(claimed.has('bracket-draw')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Referential identity of apiClient endpoints (NOT string matching)
// ---------------------------------------------------------------------------

describe('moduleContract — endpoints are real apiClient methods (by reference)', () => {
  const methods = apiClientMethods();

  for (const contract of moduleContracts) {
    const endpoints: Array<[string, readonly ApiEndpoint[]]> = [
      ['ownedEndpoints', contract.ownedEndpoints],
      ['consumedEndpoints', contract.consumedEndpoints],
    ];
    for (const [field, list] of endpoints) {
      it(`${contract.id}.${field} are all functions referentially on apiClient`, () => {
        for (const endpoint of list) {
          expect(typeof endpoint).toBe('function');
          // Referential identity: the descriptor holds the SAME function
          // reference the client exposes — not a string that happens to match.
          expect(methods.has(endpoint)).toBe(true);
        }
      });
    }
  }

  it('spot-checks identity against named apiClient methods', () => {
    expect(meetContract.ownedEndpoints).toContain(apiClient.submitSolveJob);
    expect(bracketContract.ownedEndpoints).toContain(apiClient.getBracket);
    expect(operationsContract.ownedEndpoints).toContain(apiClient.submitCommand);
    expect(operationsContract.consumedEndpoints).toContain(apiClient.getBracket);
    expect(displayContract.consumedEndpoints).toContain(apiClient.getTournamentState);
  });

  it('no module claims to OWN an endpoint another module owns', () => {
    const ownerByEndpoint = new Map<ApiEndpoint, ArchModuleId>();
    for (const contract of moduleContracts) {
      for (const endpoint of contract.ownedEndpoints) {
        expect(
          ownerByEndpoint.has(endpoint),
          `endpoint owned by both ${ownerByEndpoint.get(endpoint)} and ${contract.id}`,
        ).toBe(false);
        ownerByEndpoint.set(endpoint, contract.id);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Seam-edge honesty — the Seam-C (Operations→Bracket advancement) guard
// ---------------------------------------------------------------------------

describe('moduleContract — named seam edges are honest', () => {
  const ALLOWED: ReadonlySet<SeamEdge> = new Set<SeamEdge>([
    'scheduleFinalized',
    'drawGenerated',
    'matchStateChanged',
    // BASELINE EDIT (SP-E1-1): Seam A. Unlike its three siblings this edge is
    // an operator-pressed server-side write rather than a store subscription;
    // it is admitted because it is REAL, which is the only criterion this set
    // has ever applied.
    'entriesCommitted',
  ]);

  it('every emitted / reacted edge is in the honest §3 set', () => {
    for (const contract of moduleContracts) {
      for (const edge of [...contract.emits, ...contract.reactsTo]) {
        expect(ALLOWED.has(edge)).toBe(true);
      }
    }
  });

  it('Seam C stays unwired: advancement is intra-bracket only', () => {
    // Bracket advancement reacts to nothing cross-module today. If a future
    // PR wires Operations→Bracket advancement, these literals must change —
    // and this test fails loudly to demand the matching behavior PR.
    expect(bracketContract.reactsTo).toEqual([]);
    expect(operationsContract.reactsTo).toEqual(['scheduleFinalized']);
    expect(operationsContract.emits).toEqual(['matchStateChanged']);
  });

  it('display only reacts (read-only) and emits nothing', () => {
    expect(displayContract.emits).toEqual([]);
    expect(displayContract.reactsTo).toEqual(['matchStateChanged']);
  });

  it('the commit edge is emitted by Entries and reacted to by nobody', () => {
    // The Seam-C guard's sibling. The commit is a SERVER-side write; Meet and
    // Bracket see the new players on their next `/state` read, not through a
    // subscription. Declaring `reactsTo: ['entriesCommitted']` on either
    // engine would claim a client-side wire that does not exist — and if one
    // is ever built, this assertion is what forces the descriptor to say so.
    expect(entriesContract.emits).toEqual(['entriesCommitted']);
    expect(entriesContract.reactsTo).toEqual([]);
    for (const contract of moduleContracts) {
      expect(contract.reactsTo).not.toContain('entriesCommitted');
    }
  });
});

// ---------------------------------------------------------------------------
// DTO vocabulary — produced DTOs have a consumer somewhere (honest seams)
// ---------------------------------------------------------------------------

describe('moduleContract — DTO seams are non-empty and named', () => {
  it('each produced/consumed DTO name is a non-empty string', () => {
    for (const contract of moduleContracts) {
      for (const dto of [...contract.produces, ...contract.consumes]) {
        expect(typeof dto).toBe('string');
        expect(dto.length).toBeGreaterThan(0);
      }
    }
  });

  it('the cross-engine aggregate DTOs flow to their honest consumers', () => {
    // Bracket produces the aggregate BracketTournamentDTO; Operations + Display
    // consume that aggregate (the granular PlayUnitDTO/AssignmentDTO/ResultDTO
    // ride inside it — intentionally NOT claimed as standalone `consumes`).
    expect(bracketContract.produces).toContain('BracketTournamentDTO');
    expect(operationsContract.consumes).toContain('BracketTournamentDTO');
    expect(displayContract.consumes).toContain('BracketTournamentDTO');
    // Meet produces the schedule; Operations seeds its live layout from it.
    expect(meetContract.produces).toContain('ScheduleDTO');
    expect(operationsContract.consumes).toContain('ScheduleDTO');
    // Operations produces match-state; Meet + Display consume it.
    expect(operationsContract.produces).toContain('MatchStateDTO');
    expect(meetContract.consumes).toContain('MatchStateDTO');
    expect(displayContract.consumes).toContain('MatchStateDTO');
  });

  it("Seam A's product closes: Entries produces the roster player Meet consumes", () => {
    // The whole point of the module (spec §5): a confirmed entry becomes a
    // PlayerDTO on the Meet roster. If `produces` here ever stopped naming
    // it, the desk would be an inbox that goes nowhere.
    expect(entriesContract.produces).toContain('PlayerDTO');
    expect(meetContract.consumes).toContain('PlayerDTO');
  });
});
