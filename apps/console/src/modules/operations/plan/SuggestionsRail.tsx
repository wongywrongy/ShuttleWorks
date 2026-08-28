/**
 * The Suggestions Inbox rail.
 *
 * Always-visible-when-populated strip below the AdvisoryBanner,
 * above the Gantt. Renders nothing when zero suggestions.
 *
 * Owns the expanded-row state, the per-row Apply/Dismiss
 * lifecycle, and the "+ N more" overflow tail. Visual rules are kept with
 * the component and the design-system tokens it consumes.
 */
import { useState } from 'react';

import { useTournamentStore } from '../../../store/tournamentStore';
import { useUiStore } from '../../../store/uiStore';
import { SuggestionRow } from './SuggestionRow';
import { SuggestionPreview } from './SuggestionPreview';
import { useSuggestionActions } from './hooks/useSuggestionActions';

const VISIBLE_CAP = 3;

export function SuggestionsRail() {
  // `?? []` — tests that replace the uiStore wholesale leave the slice
  // undefined (same defensive line as AdvisoryBanner).
  const suggestions = useUiStore((s) => s.suggestions) ?? [];
  const config = useTournamentStore((s) => s.config);
  const { apply, dismiss, applyingId } = useSuggestionActions();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (suggestions.length === 0) return null;

  const visible = showAll
    ? suggestions
    : suggestions.slice(0, VISIBLE_CAP);
  const overflow = suggestions.length - VISIBLE_CAP;

  return (
    <section
      role="region"
      aria-label="Pre-computed schedule suggestions"
      className="border-b border-border bg-card"
    >
      <ul className="divide-y divide-border/60">
        {visible.map((s) => (
          <li key={s.id}>
            <SuggestionRow
              suggestion={s}
              expanded={expandedId === s.id}
              applying={applyingId === s.id}
              onToggleExpanded={() =>
                setExpandedId(expandedId === s.id ? null : s.id)
              }
              onApply={() => void apply(s)}
              onDismiss={() => {
                if (expandedId === s.id) setExpandedId(null);
                void dismiss(s);
              }}
            />
            {expandedId === s.id && (
              <SuggestionPreview proposalId={s.proposalId} config={config} />
            )}
          </li>
        ))}
        {!showAll && overflow > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="block w-full px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              + {overflow} more
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
