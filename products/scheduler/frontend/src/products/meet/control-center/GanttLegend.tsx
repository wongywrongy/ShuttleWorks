/**
 * Gantt color legend — compact, always-visible reference strip for the
 * block fills and ring overlays used by the Gantt chart.
 *
 * Two groups separated by a vertical hairline:
 *   - Status: the block's fill (scheduled / called / started / finished)
 *   - Outline: the inset ring layered over a block (selected / blocked /
 *     impacted / postponed / resting / late)
 *
 * Both groups reproduce the exact Tailwind classes used by GanttChart so
 * the legend swatch always matches the live block.
 */

const FILLS: Array<{ swatchClass: string; label: string; title: string }> = [
  {
    swatchClass: 'bg-status-idle-bg border-status-idle/40',
    label: 'Scheduled',
    title: 'On the plan, not yet called',
  },
  {
    swatchClass: 'bg-status-called-bg border-status-called/60',
    label: 'Called',
    title: 'Players have been called to the court',
  },
  {
    swatchClass: 'bg-status-live-bg border-status-live/60',
    label: 'Started',
    title: 'Match is being played',
  },
  {
    swatchClass: 'bg-status-done-bg border-status-done/30',
    label: 'Finished',
    title: 'Match is complete',
  },
];

const RINGS: Array<{ ringClass: string; label: string; title: string }> = [
  {
    ringClass: 'ring-blue-500',
    label: 'Selected',
    title: 'Currently focused match',
  },
  {
    ringClass: 'ring-red-500',
    label: 'Blocked',
    title: 'A player conflict prevents calling this match',
  },
  {
    ringClass: 'ring-purple-500',
    label: 'Impacted',
    title: 'Shares a player with the selected match',
  },
  {
    ringClass: 'ring-red-400',
    label: 'Postponed',
    title: 'Operator has postponed this match',
  },
  {
    ringClass: 'ring-amber-400',
    label: 'Resting',
    title: 'A player is still resting from a previous match',
  },
  {
    ringClass: 'ring-yellow-400',
    label: 'Late',
    title: 'Past its scheduled slot but not started',
  },
];

export function GanttLegend() {
  return (
    <div
      role="group"
      aria-label="Gantt colour key"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground"
    >
      <span className="font-semibold uppercase tracking-wider">Status</span>
      {FILLS.map((f) => (
        <span key={f.label} className="inline-flex items-center gap-1.5" title={f.title}>
          <span
            aria-hidden="true"
            className={`h-3 w-3 flex-shrink-0 rounded border ${f.swatchClass}`}
          />
          {f.label}
        </span>
      ))}
      <span
        aria-hidden="true"
        className="mx-1 hidden h-3 w-px bg-border/60 sm:inline-block"
      />
      <span className="font-semibold uppercase tracking-wider">Outline</span>
      {RINGS.map((r) => (
        <span key={r.label} className="inline-flex items-center gap-1.5" title={r.title}>
          <span
            aria-hidden="true"
            className={`h-3 w-3 flex-shrink-0 rounded bg-card ring-2 ring-inset ${r.ringClass}`}
          />
          {r.label}
        </span>
      ))}
    </div>
  );
}
