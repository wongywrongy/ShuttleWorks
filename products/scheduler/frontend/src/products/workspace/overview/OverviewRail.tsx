/**
 * The Overview's right rail — hairline-divided fact rows, not a card pile.
 * Each row is a door to the surface that owns the fact (SP-UI-1 3d).
 */
import type { AppTab } from '../../../store/uiStore';
import { EYEBROW_CLASS } from '../../../lib/utils';
import type { RailRow } from './railRows';

interface Props {
  rows: readonly RailRow[];
  onNavigate: (segment: AppTab) => void;
}

export function OverviewRail({ rows, onNavigate }: Props) {
  if (rows.length === 0) return null;

  return (
    <aside data-testid="overview-rail">
      <div className={`mb-1 ${EYEBROW_CLASS} text-ink-faint`}>Workspace</div>
      <ul className="divide-y divide-rule-soft border-t border-rule-soft">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              data-testid={`rail-row-${row.key}`}
              onClick={() => onNavigate(row.segment)}
              className={[
                'group flex w-full items-center justify-between gap-3 py-2.5 text-left',
                'transition-colors duration-fast ease-brand',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              ].join(' ')}
            >
              <span className="text-xs text-text-muted">{row.label}</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={[
                    'text-xs sw-num',
                    row.tone === 'warning'
                      ? 'text-status-warning'
                      : row.tone === 'muted'
                        ? 'text-text-muted'
                        : 'text-foreground',
                  ].join(' ')}
                >
                  {row.actionLabel ?? row.value}
                </span>
                <span
                  aria-hidden
                  className="text-text-muted opacity-0 transition-opacity duration-fast ease-brand group-hover:opacity-100"
                >
                  &rsaquo;
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
