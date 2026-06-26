/**
 * Events & participants section of bracket Setup (Configuration).
 *
 * The bracket sidebar ships exactly two items — Draw and Configuration —
 * so the Events spreadsheet (``bracket-events``) and the participant pool
 * / roster (``bracket-roster``) have no sidebar entry of their own. They
 * stay valid segments; this section is how an operator reaches them from
 * within the Configuration surface, mirroring how DataSection keeps the
 * export / reset actions one click away.
 *
 * Links are id-qualified (``/tournaments/:id/<segment>``) exactly like the
 * WorkspaceSidebar — never the bare ``/<segment>`` form.
 */
import { useNavigate } from 'react-router-dom';
import { useTournamentId } from '../../hooks/useTournamentId';
import { Row, SectionHeader } from '../../platform/settings/SettingsControls';
import { INTERACTIVE_BASE } from '../../lib/utils';

const LINK_CLASSES =
  'inline-flex items-center rounded-sm border border-border bg-card px-3 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40';

export function BracketStructureSection() {
  const tid = useTournamentId();
  const navigate = useNavigate();
  const go = (segment: string) =>
    navigate(`/tournaments/${tid}/${segment}`, { replace: true });

  return (
    <div>
      <SectionHeader>Draws and participants</SectionHeader>
      <p className="pb-3 text-xs leading-5 text-muted-foreground">
        Draws and the participant pool live on their own surfaces. Open them
        here, then return to Draw to seed and run the bracket.
      </p>
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
