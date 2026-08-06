/**
 * BracketStructureSection — the "Events" section of bracket Configuration.
 *
 * Read-only summary of the bracket's draw structure: the active
 * disciplines, and per draw its type (single elimination / round robin),
 * size, and seeded count — rendered as the same Row-stack "Events"
 * grammar Meet Configuration uses, not a table. Seeding and the draw
 * structure itself are owned by the Draw surface (Edit seeding) and the
 * Draws spreadsheet — this section surfaces the facts and routes there, it
 * does not re-model them (the draw / seeding data model is off-limits for
 * SP-E4).
 *
 * It used to be a separate TAB behind an Engine/Events switcher. It is now
 * passed to `EngineConfigForm` as `leadingSections`, so bracket Configuration
 * is ONE surface — the same merge Meet got. Nothing here writes
 * `TournamentConfig`, which is what makes sharing a page with that form safe:
 * two writers each spreading the whole config would clobber each other.
 *
 * The two routing rows used to be their own "Manage" section. A section
 * heading over two links, on a surface whose other headings introduce runs of
 * settings, was a heading doing decoration — they sit in Events now.
 *
 * Links are id-qualified (``/tournaments/:id/<segment>``) exactly like the
 * WorkspaceSidebar — never the bare ``/<segment>`` form.
 */
import { useNavigate } from 'react-router-dom';
import { useBracket } from '../../hooks/useBracket';
import { useTournamentId } from '../../hooks/useTournamentId';
import { Row, Section } from '../../platform/settings/SettingsControls';
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
    <Section title="Events">
      <Row
        label="Active disciplines"
        control={
          <span className="text-sm text-foreground">
            {disciplines.length > 0 ? disciplines.join(', ') : 'None yet'}
          </span>
        }
      />

      {events.map((ev) => (
        <Row
          key={ev.id}
          label={
            <span className="inline-flex items-baseline gap-2">
              {disciplineLabel(ev.discipline)}
              <span className="text-xs font-semibold text-accent sw-num">
                {ev.id}
              </span>
            </span>
          }
          control={
            <span className="text-xs text-muted-foreground sw-num">
              {formatLabel(ev.format)} · {ev.bracket_size ?? ev.participant_count} ·{' '}
              {ev.participant_count} seeded
            </span>
          }
        />
      ))}

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
    </Section>
  );
}
