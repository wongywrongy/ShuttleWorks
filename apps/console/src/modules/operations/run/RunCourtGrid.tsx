/**
 * RunCourtGrid — the Run surface hero as a per-court "now" card grid (the
 * Console mock's board, 2026-08-13, replacing the court×time timeline — the
 * whole-day picture lives on Plan).
 *
 * One card per court, derived from the SAME CourtLane model the rest of the
 * surface reads: a colored header band states the court's condition (LIVE /
 * CALLED / LATE / SCHEDULED / FREE), the body names the sides, the footer
 * carries the match code. Clicking an occupied card selects its Now match
 * (same `run-card-${key}` contract as the old board); a free card offers
 * "Assign next" — the queue head to THIS court.
 *
 * Purity: reads no clock. `currentSlot` is injected; elapsed/late figures are
 * slot arithmetic against the blocks' actual-timing facts.
 */
import { useMemo } from 'react';
import type { OpsBlock } from '../opsBlock';
import type { CourtLane, RunMatch } from '../runtime/runModel';
import { sideNameLines } from '../../../lib/names';
import { STATE_WORD } from '../../../lib/stateWords';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';
import { MODULE_LABELS } from '../../../platform/product-shell/types';
import { formatMatchIdentity } from '../../../platform/domain/matchIdentity';

export interface RunCourtGridProps {
  lanes: CourtLane[];
  /** Same blocks the model derives from — read here for `actualStartSlot`
   *  so a playing card can show minutes played. */
  blocks: OpsBlock[];
  currentSlot?: number;
  /** Minutes per slot; without it the time figures are omitted, never faked. */
  slotMinutes?: number;
  formatSlot?: (slotId: number) => string;
  selectedKey?: string | null;
  onSelect(key: string): void;
  /** Assign the eligible queue head to this court (the free card's CTA).
   *  Hidden when there is nothing eligible to pull. */
  onAssignNext?: (court: number) => void;
  /** Whether the queue currently has an assignable head. */
  hasEligible?: boolean;
}

/** Header-band treatment per court condition. The solid fills are the
 *  muted-solid chip system; words come from the one vocabulary and are
 *  uppercased by the band's own class, never by a second literal.
 *
 *  Timeliness preempts status because a court that is behind is the thing the
 *  desk needs to see — but only from the LATE tier up. DUE (the match's own
 *  slot has just arrived) is not an alarm, so it keeps the status band and
 *  says so in the figure instead. That is the "LATE +0" fix: +0 was always
 *  DUE wearing LATE's clothes. */
function bandFor(now: RunMatch | undefined): {
  cls: string;
  word: string;
} {
  if (!now) return { cls: 'bg-surface-band text-muted-foreground', word: STATE_WORD.free };
  if (now.timeliness === 'overdue')
    return { cls: 'bg-status-overdue-solid text-status-overdue-ink', word: STATE_WORD.overdue };
  if (now.timeliness === 'late')
    return { cls: 'bg-status-late-solid text-status-late-ink', word: STATE_WORD.late };
  if (now.status === 'playing')
    return { cls: 'bg-status-live-solid text-status-live-ink', word: STATE_WORD.live };
  if (now.status === 'called')
    return { cls: 'bg-status-called-solid text-status-called-ink', word: STATE_WORD.called };
  if (now.timeliness === 'due')
    return { cls: 'bg-surface-band text-muted-foreground', word: STATE_WORD.due };
  return { cls: 'bg-surface-band text-muted-foreground', word: STATE_WORD.scheduled };
}

/** One side of the card: each PLAYER on its own line, BWF-formatted
 *  ("NAKAMURA Kei") — the mock's card anatomy. Doubles stack two 13px
 *  lines inside the side's 34px block; singles center one. */
function SideRow({ name }: { name: string }) {
  const lines = sideNameLines(name || 'TBD');
  return (
    <div className="flex min-h-[34px] flex-col justify-center gap-px">
      {lines.map((line, i) => (
        <span
          key={i}
          className="min-w-0 break-words text-[13px] font-semibold leading-tight text-foreground"
        >
          {line}
        </span>
      ))}
    </div>
  );
}

/** Elapsed minutes as the mock's h:mm stamp ("0:32"). */
function hmm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export function RunCourtGrid({
  lanes,
  blocks,
  currentSlot = 0,
  slotMinutes,
  formatSlot,
  selectedKey,
  onSelect,
  onAssignNext,
  hasEligible,
}: RunCourtGridProps) {
  // Viewer read-only vocabulary (audit A2) — assign is a write.
  const canEdit = useCanEdit();
  const startSlotByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of blocks) {
      if (b.actualStartSlot != null) map.set(b.key, b.actualStartSlot);
    }
    return map;
  }, [blocks]);

  /** Right-hand figure on the band, in the mock's dialect: "LIVE · 0:32"
   *  (h:mm played), "LATE +30" (minutes past the planned start), or the
   *  planned start time for a court that is scheduled or merely due.
   *
   *  DUE deliberately shows its planned time rather than a `+0` — the whole
   *  point of the tier is that nothing has slipped yet. */
  const bandFigure = (now: RunMatch | undefined): string | null => {
    if (!now) return null;
    const behind = now.timeliness === 'late' || now.timeliness === 'overdue';
    if (behind && now.plannedSlot != null && slotMinutes != null) {
      return `+${Math.round((currentSlot - now.plannedSlot) * slotMinutes)}`;
    }
    if (now.status === 'playing' && slotMinutes != null) {
      const started = startSlotByKey.get(now.key);
      // Nothing until a slot has actually elapsed. Elapsed time is slot
      // arithmetic, so a match started in the current slot reads 0:00 — and
      // with the default 30-minute slot it reads 0:00 for up to half an hour,
      // which looks like a stopped clock rather than a fresh match (LIVE-6).
      // "Suppress for the first minute", as the brief put it, is not buildable
      // on slot granularity; suppressing for the first SLOT is the same idea
      // at the resolution the data actually has.
      if (started != null && currentSlot > started) {
        return hmm((currentSlot - started) * slotMinutes);
      }
    }
    if (!behind && now.status === 'scheduled' && now.plannedSlot != null && formatSlot) {
      return formatSlot(now.plannedSlot);
    }
    return null;
  };

  return (
    <div
      data-testid="run-court-grid"
      className="grid shrink-0 gap-2.5 border-b border-border p-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
    >
      {lanes.map((lane) => {
        const now = lane.now;
        const identityLabel = now ? formatMatchIdentity(now.identity, now.id) : '';
        const band = bandFor(now);
        const figure = bandFigure(now);
        const head = (
          <div
            className={`flex items-center justify-between gap-2 whitespace-nowrap px-2.5 py-1.5 text-2xs font-extrabold uppercase tracking-[0.06em] ${band.cls}`}
          >
            <span>Court {lane.court}</span>
            <span className="sw-num">
              {band.word}
              {/* Mock dialect: "LATE +30" runs on; "LIVE · 0:32" takes the dot. */}
              {figure
                ? now?.timeliness === 'late' || now?.timeliness === 'overdue'
                  ? ` ${figure}`
                  : ` · ${figure}`
                : ''}
            </span>
          </div>
        );

        if (!now) {
          return (
            <div
              key={lane.court}
              data-testid={`run-court-free-${lane.court}`}
              className="flex flex-col overflow-hidden rounded border border-dashed border-border bg-surface-band/40"
            >
              {head}
              <div className="grid flex-1 place-items-center px-3 py-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">court free</div>
                  {onAssignNext && hasEligible ? (
                    <button
                      type="button"
                      data-testid={`run-assign-next-${lane.court}`}
                      onClick={() => onAssignNext(lane.court)}
                      disabled={!canEdit}
                      title={canEdit ? undefined : READ_ONLY_MESSAGE}
                      className="mt-1.5 rounded-md border border-accent px-3 py-1 text-xs font-bold text-accent transition-colors duration-fast ease-brand hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Assign next
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        }

        const selected = selectedKey === now.key;
        return (
          <button
            key={lane.court}
            type="button"
            data-testid={`run-card-${now.key}`}
            data-source={now.source}
            aria-pressed={selected}
            onClick={() => onSelect(now.key)}
            title={`${MODULE_LABELS[now.source]} · ${identityLabel} [${now.late ? 'late' : now.status}]`}
            className={[
              'flex flex-col overflow-hidden rounded border bg-card text-left shadow-card transition-shadow duration-fast ease-brand',
              selected
                ? 'border-accent ring-1 ring-accent'
                : 'border-border hover:shadow-md',
            ].join(' ')}
          >
            {head}
            <div className="flex flex-col gap-[5px] px-2.5 py-[7px]">
              <SideRow name={now.sideA} />
              <SideRow name={now.sideB} />
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-rule-soft px-2.5 py-[5px] text-3xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
              <span className="min-w-0 break-words sw-num">{identityLabel}</span>
              <span className="shrink-0 text-accent">Open ›</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
