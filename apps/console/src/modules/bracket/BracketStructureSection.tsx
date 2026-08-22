/**
 * BracketStructureSection — the "Events" section of bracket Configuration.
 *
 * Read-only summary of the bracket's draw structure: per draw its type
 * (single elimination / round robin),
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
import { Row, Section } from '../../platform/engine-config/SettingsControls';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { disciplineLabel, formatLabel } from './bracketLabels';

const NAV_LINK_CLASSES =
  'inline-flex items-center gap-1 rounded-sm text-xs font-medium text-accent hover:underline';

export function BracketStructureSection() {
  const tid = useTournamentId();
  const navigate = useNavigate();
  const { data } = useBracket();
  const go = (segment: string) =>
    navigate(`/tournaments/${tid}/${segment}`, { replace: true });

  const events = data?.events ?? [];

  return (
    <Section title="Events">
      {/* COPY-3: the "Active disciplines" row was a wrapped comma list of
          exactly the disciplines named on the rows beneath it — a summary of
          the nine lines it sat on top of, which is a second reading of the
          same data and the first thing to go stale if one ever drifted. The
          rows are the list. */}
      {events.length === 0 ? <Row readOnly label="Events" control="None yet" /> : null}

      {events.map((ev) => (
        <Row
          key={ev.id}
          readOnly
          label={
            <span className="inline-flex items-baseline gap-2">
              {disciplineLabel(ev.discipline)}
              <span className="text-xs font-semibold text-foreground sw-num">
                {ev.id}
              </span>
            </span>
          }
          control={
            <span className="sw-num text-xs">
              {formatLabel(ev.format)} · {ev.bracket_size ?? ev.participant_count} ·{' '}
              {ev.participant_count} seeded
            </span>
          }
        />
      ))}

      {/* These leave the page; the rows above and below them change it. A
          bordered button says "this acts on what you are looking at", which
          is the one thing these do not do, so they read as links with the
          direction of travel shown (BCFG-2). */}
      <Row
        label="Draws"
        control={
          <button
            type="button"
            data-testid="bracket-open-draws"
            onClick={() => go('bracket-draws')}
            className={`${INTERACTIVE_BASE} ${NAV_LINK_CLASSES}`}
          >
            Manage draws →
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
            className={`${INTERACTIVE_BASE} ${NAV_LINK_CLASSES}`}
          >
            Manage participants →
          </button>
        }
        last
      />
    </Section>
  );
}
