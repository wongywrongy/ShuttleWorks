/**
 * Sides — the console's one side formatter (package 10b, v3 consolidated
 * plan). D17/D14/D15 land here: a `Side` is the discriminated model from the
 * match-card contract (§2.1) and the state-and-formatting contract (§6.1),
 * never a pre-joined string, and it is never parsed back OUT of one either
 * (`names.ts`'s split/rejoin round-trip is the anti-pattern this file
 * replaces for every site listed in package 10's scope).
 *
 * Two constructors meet the two engines where their wire already is:
 *  - `meetSideFromIds` — the meet engine already ships individual player ids
 *    + a roster, so a meet side gets full per-person fidelity here, with NO
 *    backend change (see D17 note in the package 10 report).
 *  - `sideFromWire` — the bracket engine's structured `SideDTO`
 *    (`shared/sides.py`, package 10a). Since v3 package 29 (V3-10-1) a
 *    bracket doubles pair arrives as TWO `PersonRef`s: the backend resolves
 *    `member_ids` against the bracket roster rather than shipping only the
 *    composite team name, so full per-partner fidelity now reaches this file
 *    from BOTH engines. A pair one member short arrives as
 *    `persons: [A], unresolved: pending_member` (V3-10-2), which is what
 *    `formatSideLines` turns into the known name plus "partner to be
 *    confirmed". Where a member id has no roster row the backend still sends
 *    the composite name as one person — the only honest label it has.
 *
 * `resolveFeederReference` is the seam back to the console's own identity
 * authority: the wire's `winner_of`/`loser_of` carries a RAW play-unit id
 * (state-and-formatting §6.3 — the backend does not duplicate the console's
 * round-label speller), and a caller with a `labelById` map (
 * `bracketLabels.ts`'s `buildPlayUnitLabels`) turns it into "Winner of QF1"
 * before formatting.
 *
 * `formatPersonName`/`formatSideName`/`sideNameLines` (retired from
 * `lib/names.ts`, V3-10-3) are a narrower compatibility shim for callers that
 * only ever held a pre-joined side string ("A / B") rather than the
 * structured wire `sides` this file otherwise expects — `MatchesSpreadsheet`,
 * `BracketPlayerFields`, `ParticipantPicker` and `RunCourtGrid` were outside
 * package 10c's scope (BracketMatchesTab, prior art for the full `Side`
 * conversion) and still work from joined strings. They preserve the operator-
 * entered name exactly (no reordering — names are not safely parseable from
 * whitespace) and stay presentation-only, same as their `names.ts` originals.
 */

/** One resolved (or dead) person reference. */
export interface PersonRef {
  id: string | null;
  name: string;
}

/** Why a side has no (or an incomplete) resolved person — match-card
 *  contract §2.1. `persons` and `unresolved` on `Side` are NOT mutually
 *  exclusive: `pending_member` carries both the known persons and this. */
export type UnresolvedSide =
  | { kind: 'bye' }
  | { kind: 'pending_member'; known: PersonRef[]; missing: number }
  | { kind: 'winner_of'; reference: string }
  | { kind: 'loser_of'; reference: string }
  | { kind: 'withheld' }
  | { kind: 'undetermined' };

export interface Side {
  persons: PersonRef[];
  unresolved: UnresolvedSide | null;
  seed: number | null;
  participantKey: string | null;
}

const UNDETERMINED: Side = {
  persons: [],
  unresolved: { kind: 'undetermined' },
  seed: null,
  participantKey: null,
};

/** Build a side from the meet engine's raw player ids + a roster name map.
 *  Every id resolves to its own `PersonLine` (one participant per line) —
 *  the meet wire already carries per-person identity, so this is a pure
 *  projection, never a join. */
export function meetSideFromIds(
  ids: readonly string[] | undefined,
  nameById: Record<string, string>,
): Side {
  if (!ids || ids.length === 0) return UNDETERMINED;
  return {
    persons: ids.map((id) => ({ id, name: nameById[id] ?? id })),
    unresolved: null,
    seed: null,
    participantKey: ids.length === 1 ? ids[0] : null,
  };
}

/** The minimal shape `sideFromWire` needs from `shared/sides.py`'s
 *  `SideDTO` — matched structurally so this file does not import the
 *  bracket-specific wire module (foundation layers stay dependency-light;
 *  callers pass their own `BracketDto.SideDTO`, which satisfies this shape). */
export interface WireSide {
  persons?: { id?: string | null; name: string }[] | null;
  unresolved?: {
    kind: UnresolvedSide['kind'];
    known?: { id?: string | null; name: string }[] | null;
    missing?: number | null;
    reference?: string | null;
  } | null;
  seed?: number | null;
  participantKey?: string | null;
}

/** Build a side from the operator wire's structured `SideDTO` (bracket,
 *  package 10a). Absent entirely on an older cached payload — callers fall
 *  back to `undefined` and should use the legacy `slot`/`side_a` reader. */
export function sideFromWire(dto: WireSide | null | undefined): Side {
  if (!dto) return UNDETERMINED;
  const persons = (dto.persons ?? []).map((p) => ({ id: p.id ?? null, name: p.name }));
  let unresolved: UnresolvedSide | null = null;
  const u = dto.unresolved;
  if (u) {
    switch (u.kind) {
      case 'bye':
        unresolved = { kind: 'bye' };
        break;
      case 'withheld':
        unresolved = { kind: 'withheld' };
        break;
      case 'undetermined':
        unresolved = { kind: 'undetermined' };
        break;
      case 'winner_of':
        unresolved = { kind: 'winner_of', reference: u.reference ?? '' };
        break;
      case 'loser_of':
        unresolved = { kind: 'loser_of', reference: u.reference ?? '' };
        break;
      case 'pending_member':
        unresolved = {
          kind: 'pending_member',
          known: (u.known ?? []).map((p) => ({ id: p.id ?? null, name: p.name })),
          missing: u.missing ?? 1,
        };
        break;
    }
  } else if (persons.length === 0) {
    unresolved = { kind: 'undetermined' };
  }
  return {
    persons,
    unresolved,
    seed: dto.seed ?? null,
    participantKey: dto.participantKey ?? null,
  };
}

/** Resolve a `winner_of`/`loser_of` side's raw play-unit-id reference to the
 *  console's own friendly identity spelling ("Winner of QF1"). A no-op for
 *  every other side shape. `labelById` is `bracketLabels.ts`'s
 *  `buildPlayUnitLabels()` map; an id with no entry passes through raw
 *  rather than throwing, matching the legacy `sideLabel` fallback. */
export function resolveFeederReference(
  side: Side,
  labelById: ReadonlyMap<string, string> | Record<string, string>,
): Side {
  if (side.unresolved?.kind !== 'winner_of' && side.unresolved?.kind !== 'loser_of') return side;
  const raw = side.unresolved.reference;
  const label = labelById instanceof Map ? labelById.get(raw) : (labelById as Record<string, string>)[raw];
  if (!label || label === raw) return side;
  return { ...side, unresolved: { ...side.unresolved, reference: label } };
}

/** One line per participant, in the fixed label wording (state-and-
 *  formatting §6.1 / match-card §2.1). Never `TBD`, `–`, `No players` or an
 *  empty string — an unresolved side always renders its label, in the same
 *  ink and size as a name (never a blank row). */
export function formatSideLines(side: Side): string[] {
  if (side.persons.length > 0) {
    const lines = side.persons.map((p) => p.name);
    if (side.unresolved?.kind === 'pending_member') lines.push('partner to be confirmed');
    return lines;
  }
  const u = side.unresolved ?? { kind: 'undetermined' as const };
  switch (u.kind) {
    case 'bye':
      return ['Bye'];
    case 'winner_of':
      return [`Winner of ${u.reference}`];
    case 'loser_of':
      return [`Loser of ${u.reference}`];
    case 'withheld':
      return ['Player not published'];
    case 'pending_member':
      return [...u.known.map((p) => p.name), 'partner to be confirmed'];
    case 'undetermined':
      return ['To be decided'];
  }
}

/** A side collapsed to one line — for the compact chip and the board's own
 *  condensed density (match-card §3.2). Joins with `' / '`, never a rebuilt
 *  string parsed back apart later (D15). */
export function formatSideCondensed(side: Side): string {
  return formatSideLines(side).join(' / ');
}

/** The accessible inline phrase for one side, joining persons with "and"
 *  (match-card §3.2, state-and-formatting §6.1) — never a slash. */
export function sideSummaryText(side: Side): string {
  return formatSideLines(side).join(' and ');
}

/** `"{sideA} versus {sideB}"` — the one accessible-name / inline-summary
 *  builder every renderer uses (match-card §3.2). Built from the structured
 *  sides, never from `persons.map(...).join(' / ')`. */
export function sideSummaryPhrase(sideA: Side, sideB: Side): string {
  return `${sideSummaryText(sideA)} versus ${sideSummaryText(sideB)}`;
}

/** True for a side that is a genuine hole with no label at all — should
 *  never happen (every branch above returns at least one line), kept as a
 *  defensive assertion helper for tests. */
export function isEmptySide(side: Side): boolean {
  return formatSideLines(side).length === 0;
}

/** Preserve the canonical operator-entered display name. Names are not
 *  safely parseable from whitespace, so presentation must never silently
 *  reorder them. See this file's module docstring — a pre-joined-string
 *  compatibility shim, not the structured `Side` formatting above. */
export function formatPersonName(name: string): string {
  return name.trim();
}

/** Format every player inside a pre-joined side string, preserving the
 *  joiner ("A / B" or "A & B"). Compatibility shim — see module docstring. */
export function formatSideName(side: string, joiner: ' / ' | ' & ' = ' / '): string {
  return side.split(joiner).map(formatPersonName).join(joiner);
}

/** The players of a pre-joined side, formatted, one entry per player — for
 *  callers that render each on its own line. Compatibility shim — see module
 *  docstring. */
export function sideNameLines(side: string, joiner: ' / ' | ' & ' = ' / '): string[] {
  return side.split(joiner).map(formatPersonName);
}
