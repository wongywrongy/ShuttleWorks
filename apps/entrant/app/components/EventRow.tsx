/**
 * One row of the Draws panel (ADR 0028, formerly the Events tab): discipline
 * · code · facts · "N entered" · state as text+tone · up to two outline
 * buttons — **Entrants** into the Players directory and **Draw** into the
 * event's draw page once one is published. The facts line prefers the draw
 * card's own description (format · size · rounds) and falls back to the
 * entry-page constraints before a draw exists. A decided draw adds a
 * "Champion" line from the card. "N entered" only — G2 (caps) was declined,
 * so no "of M".
 */
import { Button } from '@scheduler/design-system/components';

import type { DrawCardDTO } from '../lib/draws.types';
import { entryCountLabel, eventCodeLabel, kindLabel } from '../lib/draws.types';
import type { EntryEventDTO } from '../lib/entryPage.types';
import { PersonGroup } from './PersonGroup';

function genderLabel(constraint: string | null): string {
  if (constraint === null) return 'Open to all';
  const folded = constraint.toLowerCase();
  if (folded === 'm') return 'Men';
  if (folded === 'f') return 'Women';
  return constraint;
}

/**
 * Legacy imports occasionally contain a storage slug where the public event
 * code belongs (for example `mens_doubles_final`). Keep normalization at the
 * rendering boundary so the public page never exposes database-style names;
 * the wire contract and operator vocabulary remain unchanged.
 */
function displayEventCode(code: string): string {
  const compact = eventCodeLabel(code);
  if (!compact.includes('_')) return compact;
  return compact
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function displayEventName(name: string, code: string): string {
  const source = name.trim() || code;
  if (!source.includes('_')) return source;
  return source
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function EventRow({
  event,
  entrantsHref,
  draw = null,
  drawHref = null,
  slug = '',
}: {
  event: EntryEventDTO;
  /** Null when the Players tab is not visible — no link to a hidden panel. */
  entrantsHref: string | null;
  /** The published draw card for this event, when there is one. */
  draw?: DrawCardDTO | null;
  drawHref?: string | null;
  slug?: string;
}) {
  const publicFields = event as EntryEventDTO & { format?: string | null; eligibility?: string | null; capacity?: number | null; drawPublished?: boolean; resultsPublished?: boolean };
  const eligibility = publicFields.eligibility ?? genderLabel(event.genderConstraint);
  const facts = draw
    ? [
        kindLabel(draw.kind),
        eligibility,
        entryCountLabel(draw.eventCode, draw.size),
        `${draw.roundCount} ${draw.roundCount === 1 ? 'round' : 'rounds'}`,
        draw.hasConsolation ? 'with consolation' : null,
      ]
    : [publicFields.format, eligibility];
  const countLabel = publicFields.capacity !== null && publicFields.capacity !== undefined
    ? `${event.entryCount} of ${publicFields.capacity} entered`
    : `${event.entryCount} entered`;
  const state = event.isOpen
    ? { label: 'Open', tone: 'text-status-live' }
    : publicFields.resultsPublished
      ? { label: 'Results published', tone: 'text-muted-foreground' }
      : publicFields.drawPublished || draw
        ? { label: 'Draw published', tone: 'text-muted-foreground' }
        : { label: 'Closed', tone: 'text-status-done' };
  const entrants = entrantsHref !== null && event.entryCount > 0 ? entrantsHref : null;
  return (
    <li className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto] sm:items-center">
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {displayEventName(event.discipline, event.code) || "Tournament event"}{' '}
          <span className="text-xs font-semibold tracking-wide text-muted-foreground">
            ({displayEventCode(event.code)})
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {facts.filter(Boolean).join(' · ')}{event.ageBracketed ? ' · Age-restricted' : ''}
        </p>
        {draw && draw.champions?.length ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Champion · <PersonGroup slug={slug} persons={draw.champions} state="winner" className="font-medium text-foreground" />
          </p>
        ) : null}
      </div>
      {/* One template string, not adjacent JSX expressions: React 19's SSR
          stream separates those with comment nodes, breaking text-level
          assertions and, worse, screen-reader continuity of the phrase. */}
      <p className="text-sm tabular-nums text-muted-foreground">{countLabel}</p>
      <p className={`text-sm font-medium ${state.tone}`}>{state.label}</p>
      {entrants !== null || drawHref !== null ? (
        <div className="flex gap-2">
          {entrants !== null ? (
            <Button asChild variant="outline" size="sm">
              <a href={entrants}>Entrants</a>
            </Button>
          ) : null}
          {drawHref !== null ? (
            <Button asChild variant="outline" size="sm">
              <a href={drawHref} aria-label={`${displayEventName(event.discipline, event.code)} draw`}>Draw</a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
