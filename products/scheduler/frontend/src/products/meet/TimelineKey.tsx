/**
 * Corner "?" key — the legend strips' replacement on both meet timelines
 * (Run's GanttChart, Plan's DragGantt). Split from timelineEncoding so the
 * pure constants file stays fast-refresh-clean.
 */
import { useEffect, useRef, useState } from 'react';
import { Question, Warning, WarningOctagon, PushPin } from '@phosphor-icons/react';

/**
 * Corner "?" key — the legend strips' replacement on both timelines. A
 * lightweight local disclosure (not a general Popover primitive).
 * `variant="plan"` appends the Plan-only entries (pinned / infeasible
 * drop target). Closes on outside click / Escape.
 */
export function TimelineKey({ variant = 'run' }: { variant?: 'run' | 'plan' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="absolute right-1 top-1 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Timeline key"
        title="Timeline key"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Question aria-hidden="true" className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-6 w-56 rounded border border-border bg-card p-3 text-2xs shadow-md">
          <p className="mb-1.5 font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Lifecycle
          </p>
          <ul className="space-y-1">
            <li className="flex items-center gap-2">
              <span className="h-3 w-4 flex-shrink-0 rounded-sm border border-border bg-muted/30" />
              Scheduled
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-4 flex-shrink-0 rounded-sm border border-status-called/40 bg-status-called-bg/60" />
              Called
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-4 flex-shrink-0 rounded-sm border border-accent/70 bg-accent/15" />
              In progress
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-4 flex-shrink-0 rounded-sm border border-border/50 bg-muted/20" />
              Finished
            </li>
          </ul>
          <p className="mb-1.5 mt-2.5 font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Exceptions
          </p>
          <ul className="space-y-1">
            <li className="flex items-center gap-2 text-status-warning">
              <Warning aria-hidden="true" weight="fill" className="h-3 w-3 flex-shrink-0" />
              <span className="text-foreground">Late / overrun</span>
            </li>
            <li className="flex items-center gap-2 text-status-blocked">
              <WarningOctagon aria-hidden="true" weight="fill" className="h-3 w-3 flex-shrink-0" />
              <span className="text-foreground">Blocked</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-4 flex-shrink-0 rounded-sm border border-dashed border-status-idle opacity-70" />
              Postponed
            </li>
            {variant === 'run' && (
              <li className="flex items-center gap-2">
                <span className="h-3 w-4 flex-shrink-0 rounded-sm border-2 border-dashed border-accent" />
                Impacted by a pending fix
              </li>
            )}
            {variant === 'plan' && (
              <>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <PushPin aria-hidden="true" weight="fill" className="h-3 w-3 flex-shrink-0" />
                  <span className="text-foreground">Pinned</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-3 w-4 flex-shrink-0 rounded-sm ring-2 ring-inset ring-destructive bg-destructive/5" />
                  Infeasible drop target
                </li>
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
