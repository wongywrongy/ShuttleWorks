/**
 * BracketStructureSection — the Structure tab of bracket Configuration.
 *
 * Read-only summary of the bracket's draw structure: the active
 * disciplines, and per draw its type (single elimination / round robin),
 * size, and seeded count. Seeding and the draw structure itself are owned
 * by the Draw surface (Edit seeding) and the Draws spreadsheet — this tab
 * surfaces the facts and routes there, it does not re-model them (the
 * draw / seeding data model is off-limits for SP-E4).
 *
 * Links are id-qualified (``/tournaments/:id/<segment>``) exactly like the
 * WorkspaceSidebar — never the bare ``/<segment>`` form.
 */
import { useNavigate } from 'react-router-dom';
import { useBracket } from '../../hooks/useBracket';
import { useTournamentId } from '../../hooks/useTournamentId';
import { Row, SectionHeader } from '../../platform/settings/SettingsControls';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { disciplineLabel, formatLabel } from './bracketLabels';

const LINK_CLASSES =
  'inline-flex items-center rounded-sm border border-border bg-card px-3 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40';

export function BracketStructureSection() {
  const tid = useTournamentId();
  const navigate = useNavigate();
  const { data } = useBracket();
  const go = (segment: string) =>
    navigate(`/tournaments/${tid}/${segment}`, { replace: true });

  const events = data?.events ?? [];
  const disciplines = Array.from(
    new Set(events.map((e) => disciplineLabel(e.discipline)).filter(Boolean)),
  );

  return (
    <div>
      <SectionHeader>Structure</SectionHeader>
      <p className="pb-2 text-xs leading-5 text-muted-foreground">
        Each draw is one event. Draw type, size, and seeding are set per
        draw — open a draw to edit its seeding.
      </p>

      <Row
        label="Active disciplines"
        control={
          <span className="text-sm text-foreground">
            {disciplines.length > 0 ? disciplines.join(', ') : 'None yet'}
          </span>
        }
        last={events.length === 0}
      />

      {events.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-sm border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Discipline</th>
                <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Draw type</th>
                <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Draw size</th>
                <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Seeding</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">{disciplineLabel(ev.discipline)}</td>
                  <td className="px-3 py-2">{formatLabel(ev.format)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {ev.bracket_size ?? ev.participant_count}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {ev.participant_count} seeded
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          No draws yet. Create a draw to set its type, size, and seeding.
        </p>
      )}

      <SectionHeader>Manage</SectionHeader>
      <Row
        label="Draws"
        control={
          <button
            type="button"
            data-testid="bracket-open-draws"
            onClick={() => go('bracket-draws')}
            className={`${INTERACTIVE_BASE} ${LINK_CLASSES}`}
          >
            Manage draws
          </button>
        }
      />
      <Row
        label="Participant pool"
        control={
          <button
            type="button"
            data-testid="bracket-open-roster"
            onClick={() => go('bracket-roster')}
            className={`${INTERACTIVE_BASE} ${LINK_CLASSES}`}
          >
            Manage participants
          </button>
        }
        last
      />
    </div>
  );
}
