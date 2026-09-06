/**
 * The entrant tier's one side-summary formatter (state-and-formatting
 * contract §6.1, D14). It replaces the slash-joined aria label that used to
 * live at `components/MatchCard.tsx:85` — `persons.map(...).join(' / ')` —
 * which parsed nothing back out but did assemble a display string outside
 * the identity seam, exactly what D14/D15 forbid.
 *
 * `sideNamePhrase` joins the persons WITHIN one side with "and"; a side with
 * no resolved persons renders its placeholder, or "To be decided" when even
 * that is absent (contract §6.2 — never "TBD", "–", "No players" or "").
 * `sideSummaryPhrase` joins the two sides with "versus" — the one inline
 * accessible phrase every renderer must share, kept even where the visual
 * card omits the word because stacked sides already make opposition
 * obvious (contract §6.1 "the vs rule").
 */
import type { PersonReferenceDTO } from './person.types';
import { personRefModel } from '../../public/assets/person-ref.js';

export interface SideLike {
  persons: PersonReferenceDTO[];
  placeholder?: string | null;
}

export function sideNamePhrase(slug: string, side: SideLike): string {
  if (side.persons.length) {
    return side.persons
      .map(
        (person) =>
          personRefModel({
            slug,
            identity: person.identity,
            state: person.resolution === 'dead' ? 'dead' : 'resolved',
            label: person.label,
          }).text,
      )
      .join(' and ');
  }
  return side.placeholder ?? 'To be decided';
}

export function sideSummaryPhrase(slug: string, sides: readonly SideLike[]): string {
  return sides.map((side) => sideNamePhrase(slug, side)).join(' versus ');
}
