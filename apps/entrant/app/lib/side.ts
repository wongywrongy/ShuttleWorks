/**
 * The entrant tier's one side model and side-summary formatter
 * (state-and-formatting contract §6.1, D14). It replaces the slash-joined
 * aria label that used to live at `components/MatchCard.tsx:85` —
 * `persons.map(...).join(' / ')` — which parsed nothing back out but did
 * assemble a display string outside the identity seam, exactly what D14/D15
 * forbid.
 *
 * Since v3 package 29 the wire carries the DISCRIMINATED reason a side is
 * unresolved (`PublicUnresolvedSideDTO`, `entries_site.py`), so nothing here
 * infers a reason from a sentence any more: `unresolvedLabel` switches on
 * `kind` and returns the §6.1 wording, and the legacy `placeholder` string is
 * only a fallback for a payload minted before that field existed.
 *
 * `sideNamePhrase` joins the persons WITHIN one side with "and"; a doubles
 * side one player short appends "partner to be confirmed" as its own term
 * (§6.1: the known names, THEN the phrase — never an invented second
 * person, never rendered as if the side were singles). A side with no
 * resolved persons renders its unresolved label, or "To be decided" when
 * even that is absent (§6.2 — never "TBD", "–", "No players" or "").
 * `sideSummaryPhrase` joins the two sides with "versus" — the one inline
 * accessible phrase every renderer must share, kept even where the visual
 * card omits the word because stacked sides already make opposition
 * obvious (§6.1 "the vs rule").
 */
import type { PersonReferenceDTO } from './person.types';
import { personRefModel } from '../../public/assets/person-ref.js';

/** Why a side has no (or an incomplete) resolved person — match-card
 *  contract §2.1. Mirrors `PublicUnresolvedSideDTO` on the wire. `known` is
 *  always empty on the public tier (the side's own `persons`, already
 *  publication-gated, IS the known set); `reference` is the formatted human
 *  match reference, e.g. "QF 3". */
export interface UnresolvedSideDTO {
  kind: 'bye' | 'pending_member' | 'winner_of' | 'loser_of' | 'withheld' | 'undetermined';
  known?: PersonReferenceDTO[];
  missing?: number;
  reference?: string | null;
}

/** The §6.1 wording for a side one player short. One spelling, one place. */
export const PENDING_MEMBER_LABEL = 'partner to be confirmed';

/**
 * The muted feeder line for a side whose predecessor has not been played
 * (state-and-formatting §6.2, match-card §4.3 — public-visual-fixes P3).
 *
 * The public tier does NOT say "Winner of {reference}". That phrasing
 * dressed a structural placeholder as a participant, so a draw's unplayed
 * half read as generated player content; the operator tier keeps it, the
 * public tier renders an empty participant slot carrying one muted line
 * instead. The relationship itself travels in the connector geometry and in
 * `feederNodeKey`, never in visible prose, and the reference is the SHARED
 * one (§6.1) — the same string the node it points at is labelled with, so
 * "from QF2" resolves by reading, not by counting rows.
 *
 * `loser_of` reads the same way on purpose: the public tier states where the
 * side comes FROM, and the draw structure says which half of that match it
 * is. One spelling, both takes.
 */
export function feederLabel(reference: string | null | undefined): string {
  return reference ? `from ${reference}` : 'from an earlier match';
}

export interface SideLike {
  persons: PersonReferenceDTO[];
  placeholder?: string | null;
  unresolved?: UnresolvedSideDTO | null;
}

/** The §6.1 label for an unresolved side, or `null` when the kind is one
 *  that qualifies persons rather than replacing them (`pending_member`) or
 *  when there is no discriminant at all. */
export function unresolvedLabel(unresolved: UnresolvedSideDTO | null | undefined): string | null {
  if (!unresolved) return null;
  switch (unresolved.kind) {
    case 'bye':
      return 'Bye';
    case 'winner_of':
    case 'loser_of':
      return feederLabel(unresolved.reference);
    case 'withheld':
      return 'Player not published';
    case 'undetermined':
      return 'To be decided';
    case 'pending_member':
      // Qualifies the known persons; it never stands in for them. A
      // `pending_member` side with NO persons still has a known member the
      // caller could not resolve, so it falls back to §6.2's wording.
      return null;
  }
}

/** True when this side is an empty participant slot fed by an unplayed
 *  match — the case that renders as a muted feeder line rather than as a
 *  name-shaped placeholder (§6.2). */
export function isFeederSide(side: SideLike): boolean {
  return side.unresolved?.kind === 'winner_of' || side.unresolved?.kind === 'loser_of';
}

/** True when this side is a pair with a member still outstanding — the case
 *  that must never render as an ordinary singles side (§2.1). */
export function isPendingPair(side: SideLike): boolean {
  return side.unresolved?.kind === 'pending_member';
}

/** The label a side with NO resolved persons renders. Prefers the
 *  discriminant; falls back to the legacy placeholder string only for a
 *  payload minted before `unresolved` existed. */
export function sideFallbackLabel(side: SideLike): string {
  return unresolvedLabel(side.unresolved) ?? side.placeholder ?? 'To be decided';
}

export function sideNamePhrase(slug: string, side: SideLike): string {
  if (side.persons.length) {
    const names = side.persons.map(
      (person) =>
        personRefModel({
          slug,
          identity: person.identity,
          state: person.resolution === 'dead' ? 'dead' : 'resolved',
          label: person.label,
        }).text,
    );
    if (isPendingPair(side)) names.push(PENDING_MEMBER_LABEL);
    return names.join(' and ');
  }
  return sideFallbackLabel(side);
}

export function sideSummaryPhrase(slug: string, sides: readonly SideLike[]): string {
  return sides.map((side) => sideNamePhrase(slug, side)).join(' versus ');
}
