/**
 * One row in the SuggestionsRail. Dumb: props in, callbacks out.
 *
 * Visual spec: Appendix A of docs/superpowers/plans/2026-05-04-suggestions-inbox.md
 *   - 6px semantic dot
 *   - eyebrow ("REPAIR" / "OPTIMIZE" / "DIRECTOR" / "ALT")
 *   - title (single line, truncate)
 *   - tabular metric (right column)
 *   - Apply button (primary), Dismiss × (ghost)
 *   - Click row body to expand inline preview (handled by parent)
 *
 * Forbidden: side-stripe colored borders (border-l-4), per-kind Apply
 * colors, icons next to title, counter chips, em dashes in copy.
 */
import { CircleNotch, X } from '@phosphor-icons/react';
import type { Suggestion } from '../../api/dto';
import { INTERACTIVE_BASE } from '../../lib/utils';

const KIND_DOT: Record<Suggestion['kind'], string> = {
  repair: 'bg-status-warning',
  director: 'bg-status-info',
  optimize: 'bg-status-idle',
  candidate: 'bg-status-idle',
};

const KIND_EYEBROW: Record<Suggestion['kind'], string> = {
  repair: 'REPAIR',
  director: 'DIRECTOR',
  optimize: 'OPTIMIZE',
  candidate: 'ALT',
};

interface Props {
  suggestion: Suggestion;
  expanded: boolean;
  applying: boolean;
  onToggleExpanded: () => void;
  onApply: () => void;
  onDismiss: () => void;
}

export function SuggestionRow({
  suggestion: s, expanded, applying,
  onToggleExpanded, onApply, onDismiss,
}: Props) {
  return (
    <div
      role="group"
      aria-label={`${KIND_EYEBROW[s.kind]} suggestion: ${s.title}`}
      className="grid items-center gap-2 px-3 py-1.5 hover:bg-bg-subtle transition-colors"
      style={{ gridTemplateColumns: 'auto auto 1fr auto auto auto' }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[s.kind]}`}
        aria-hidden="true"
      />
      <span className="text-2xs font-semibold uppercase tracking-wider text-fg-muted whitespace-nowrap">
        {KIND_EYEBROW[s.kind]}
      </span>
      <button
        type="button"
        onClick={onToggleExpanded}
        title={s.title}
        aria-expanded={expanded}
        className={`${INTERACTIVE_BASE} truncate text-left text-sm font-medium text-fg`}
      >
        {s.title}
      </button>
      <span className="whitespace-nowrap text-xs text-fg-muted tabular-nums">
        {s.metric}
      </span>
      <button
        type="button"
        onClick={onApply}
        disabled={applying}
        className={`${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-60`}
      >
        {applying && <CircleNotch className="h-3 w-3 animate-spin" aria-hidden="true" />}
        {applying ? 'Applying' : 'Apply'}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        className={`${INTERACTIVE_BASE} rounded p-0.5 text-fg-muted hover:bg-bg-subtle hover:text-fg`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
