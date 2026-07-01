/**
 * Controls strip above the bracket Schedule grid. Mirrors the shape
 * of the meet's Schedule header (left-aligned status, right-aligned
 * actions) but with no Generate / Re-optimize buttons — bracket draws
 * are generated per-event from the Events tab, and the Schedule is
 * post-generation read-only.
 */
import type { BracketTournamentDTO } from '../../api/bracketDto';

interface Props {
  data: BracketTournamentDTO;
}

export function BracketScheduleHeader({ data }: Props) {
  const count = data.assignments.length;

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 py-2">
      <p className="text-2xs text-muted-foreground">
        {count} play unit{count === 1 ? '' : 's'} scheduled across {data.courts} court{data.courts === 1 ? '' : 's'}
      </p>
    </div>
  );
}
