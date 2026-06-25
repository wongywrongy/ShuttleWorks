/**
 * SourceChip — the Phase B engine-provenance badge for the Operations
 * layer (Courts + Live).
 *
 * It names which engine the operational data on a surface comes from
 * (Meet vs Bracket). In the single-engine case shipping today the
 * source is a per-SURFACE constant — every row on a meet Operations
 * surface is `meet`, every row on a bracket one is `bracket` — so the
 * chip lives in each surface's header strip.
 *
 * TODO (hybrid merge, NOT this increment): once a hybrid Operations
 * view concatenates `meetMatchesToOperational()` + `bracketToOperational()`
 * into one interleaved list, move this chip from the header onto each
 * row, fed by `OperationalMatch.source`.
 */
import type { OperationalSource } from '../../lib/operations/operationalMatch';

const LABEL: Record<OperationalSource, string> = {
  meet: 'Meet',
  bracket: 'Bracket',
};

// Engine-tinted so the two read apart at a glance once they interleave.
// Uses the same dimensions as the surrounding eyebrow labels.
const TONE: Record<OperationalSource, string> = {
  meet: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  bracket: 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300',
};

export function SourceChip({
  source,
  className = '',
}: {
  source: OperationalSource;
  className?: string;
}) {
  return (
    <span
      data-testid={`source-chip-${source}`}
      title={`Operational data from the ${LABEL[source]} engine`}
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.18em] ${TONE[source]} ${className}`}
    >
      {LABEL[source]}
    </span>
  );
}
