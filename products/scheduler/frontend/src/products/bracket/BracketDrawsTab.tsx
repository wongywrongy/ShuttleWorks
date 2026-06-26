/**
 * Bracket Draws — the list of draws (one per event) the bracket has
 * produced. A thin hub: it shows each draw's discipline, format, size,
 * participant count, and status, and routes onward — a row opens that
 * draw's bracket visualization (the Draw view), and "New draw" / "Manage"
 * goes to the Events surface where draws are created and generated. It
 * does not reimplement creation; it wires to the existing handlers.
 */
import { useNavigate } from 'react-router-dom';
import { useBracket } from '../../hooks/useBracket';
import { useTournamentId } from '../../hooks/useTournamentId';
import { ActionsBar, EmptyState } from '../../components/control-plane';
import { INTERACTIVE_BASE } from '../../lib/utils';

export function BracketDrawsTab() {
  const { data } = useBracket();
  const tid = useTournamentId();
  const navigate = useNavigate();
  const events = data?.events ?? [];

  const goManage = () => navigate(`/tournaments/${tid}/bracket-events`);
  const openDraw = () => navigate(`/tournaments/${tid}/bracket-draw`);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ActionsBar
        title="Draws"
        status={
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {events.length} draw{events.length === 1 ? '' : 's'}
          </span>
        }
      >
        <button
          type="button"
          onClick={goManage}
          data-testid="bracket-new-draw"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
        >
          ＋ New draw
        </button>
      </ActionsBar>

      <div className="min-h-0 flex-1 overflow-auto">
        {events.length === 0 ? (
          <EmptyState
            title="No draws yet"
            body="A draw is one event's bracket. Add an event and generate its draw — they’ll appear here and feed Matches and Operations."
            action={
              <button
                type="button"
                onClick={goManage}
                className={`${INTERACTIVE_BASE} inline-flex h-8 items-center gap-1 rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
              >
                ＋ New draw
              </button>
            }
          />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="w-24">Draw</span>
              <span className="w-24">Discipline</span>
              <span className="w-20">Format</span>
              <span className="w-16 text-right tabular-nums">Size</span>
              <span className="w-24 text-right tabular-nums">Participants</span>
              <span className="min-w-0 flex-1 text-right">Status</span>
            </div>
            {events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={openDraw}
                data-testid={`bracket-draw-row-${ev.id}`}
                title={`Open the ${ev.id} draw`}
                className="flex w-full min-h-[40px] items-center gap-3 border-b border-border px-4 text-left text-sm transition-colors duration-fast ease-brand hover:bg-muted/30"
              >
                <span className="w-24 truncate font-mono text-xs text-foreground">
                  {ev.id}
                </span>
                <span className="w-24 truncate text-foreground">{ev.discipline}</span>
                <span className="w-20 uppercase text-muted-foreground">
                  {ev.format}
                </span>
                <span className="w-16 text-right tabular-nums text-muted-foreground">
                  {ev.bracket_size ?? ev.participant_count ?? 0}
                </span>
                <span className="w-24 text-right tabular-nums text-muted-foreground">
                  {ev.participant_count ?? 0}
                </span>
                <span className="min-w-0 flex-1 text-right text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {ev.status ?? 'draft'}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
