/**
 * "New workspace" (route `/new`) — ONE form, six controls:
 * name, date, Meet, Bracket, Display, Create.
 *
 * It used to be a four-step wizard (Type → Identity → Venue → Review) whose
 * first question — "team meet, draw tournament, or both?" — was answered again
 * two rows below by the module switches it drove, and whose last two steps
 * asked for a court count that Setup owns and then read the four answers back
 * to the person who had just given them. Creating a workspace is not a
 * decision tree; it is a name and what the event runs.
 *
 * Everything else about the event — venue, courts, sessions, scoring, the
 * public site — is completed in Setup, which is where creation now lands
 * (Setup → Details). The workspace is still created in ONE atomic request.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@scheduler/design-system';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { apiClient } from '../../api/client';
import {
  FieldRow,
  Row,
  Section,
  Seg,
} from '../../platform/engine-config/SettingsControls';
import { landingRoute } from './workspaceCreateFlow';
import { MODULE_LABELS } from '../../platform/domain/moduleModel';
import {
  customSeed,
  kindForSeed,
  DEFAULT_CUSTOM,
  type CustomState,
  type ModuleState,
} from './customModules';
import { TEXT_MUTED_SM } from '../../lib/utils'

const MODULE_IDS: (keyof CustomState)[] = ['meet', 'bracket', 'display'];

/** What each module actually does, in the director's terms. */
const MODULE_HINT: Record<keyof CustomState, string> = {
  meet: 'Roster and a court schedule',
  bracket: 'Draws, seeding, and progression',
  display: 'A public board for the venue',
};

const ON_OFF = [
  { value: 'enabled' as ModuleState, label: 'On' },
  { value: 'off' as ModuleState, label: 'Off' },
];

export function NewWorkspacePage() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<CustomState>(DEFAULT_CUSTOM);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Display is meaningless without something to show. The dependency is the
  // same rule the backend enforces and the Modules catalog states; here it
  // simply disables the switch rather than letting the operator arm an
  // invalid combination and be refused after the fact.
  const hasEngine = modules.meet === 'enabled' || modules.bracket === 'enabled';
  const nameMissing = name.trim().length === 0;

  function setModule(id: keyof CustomState, value: ModuleState) {
    setModules((prev) => {
      const next = { ...prev, [id]: value };
      // Turning off the last engine turns Display off with it, so the form
      // never holds a state the server would reject.
      if (
        (id === 'meet' || id === 'bracket') &&
        next.meet !== 'enabled' &&
        next.bracket !== 'enabled'
      ) {
        next.display = 'off';
      }
      return next;
    });
    // The configuration just changed, so a prior failure may no longer apply.
    setError(null);
  }

  async function handleCreate() {
    if (nameMissing) {
      setError('Give the workspace a name.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await apiClient.createTournament({
        name: name.trim(),
        kind: kindForSeed(modules),
        tournamentDate: date || null,
        modules: customSeed(modules),
      });
      // Open via the RETURNED module state: Setup → Details, unless nothing
      // is enabled at all, in which case Modules is the only useful place.
      navigate(landingRoute(created));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-chrome flex h-12 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <ShuttleWorksMark />
      </header>

      <div className="sw-float-in mx-auto max-w-3xl space-y-4 px-6 py-10">
        <div className="space-y-1 pb-2">
          <h1 className="type-display text-2xl text-foreground">New workspace</h1>
          <p className={TEXT_MUTED_SM}>
            Name it and choose what it runs. Venue, courts and scoring are set up next.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <Section title="Workspace">
          <FieldRow
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Spring Invitational"
            disabled={creating}
            required
          />
          <FieldRow
            last
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={creating}
            hint="Optional. You can set or change it in Setup."
          />
        </Section>

        <Section title="Modules">
          {MODULE_IDS.map((id, i) => (
            <Row
              key={id}
              last={i === MODULE_IDS.length - 1}
              label={
                <span className="inline-flex items-baseline gap-2">
                  {MODULE_LABELS[id]}
                  <span className="text-xs font-normal text-muted-foreground">
                    {MODULE_HINT[id]}
                    {id === 'display' && !hasEngine ? ' · needs Meet or Bracket' : ''}
                  </span>
                </span>
              }
              control={
                <Seg
                  options={ON_OFF}
                  value={modules[id]}
                  onChange={(v) => setModule(id, v)}
                  ariaLabel={MODULE_LABELS[id]}
                  disabled={id === 'display' && !hasEngine}
                />
              }
            />
          ))}
        </Section>

        <div className="flex justify-between border-t border-border pt-4">
          <Button variant="ghost" onClick={() => navigate('/')} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating || nameMissing}>
            {creating ? 'Creating…' : 'Create workspace'}
          </Button>
        </div>
      </div>
    </div>
  );
}
