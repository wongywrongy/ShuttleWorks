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
 * The hybrid Operations view interleaves meet + bracket matches, so the chip
 * is fed by `Match.source` per row.
 *
 * Lives in `components/` (not a single product) because it is consumed by
 * the meet, bracket, and operations surfaces alike — a shared cross-feature
 * component per the boundary rules enforced by dependency-cruiser.
 */
import type { MatchSource } from '../platform/domain/match';
import { MODULE_LABELS } from '../platform/product-shell/types';
import { EYEBROW_CLASS } from '../lib/utils';

const LABEL: Record<MatchSource, string> = {
  meet: MODULE_LABELS.meet,
  bracket: MODULE_LABELS.bracket,
};

// Color budget (2026-07): the chip TEXT names the engine — the sky/violet
// tints were decoration on top of it. Neutral outlined chip; if provenance
// ever needs a stronger glance-read, differentiate with an icon, not a hue.
const TONE: Record<MatchSource, string> = {
  meet: 'border-border bg-surface-chip text-text-secondary',
  bracket: 'border-border bg-surface-chip text-text-secondary',
};

export function SourceChip({
  source,
  className = '',
}: {
  source: MatchSource;
  className?: string;
}) {
  return (
    <span
      data-testid={`source-chip-${source}`}
      title={`Operational data from the ${LABEL[source]} engine`}
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 ${EYEBROW_CLASS} ${TONE[source]} ${className}`}
    >
      {LABEL[source]}
    </span>
  );
}
