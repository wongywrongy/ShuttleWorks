/**
 * "New workspace" (route `/new`) — the director states what they are running.
 *
 * NO PRESETS. This used to lead with four template cards (Meet Day / Bracket
 * Tournament / Hybrid Event / Blank) plus a Custom escape hatch, so the first
 * decision was "which of our bundles is closest to my event?" — a question
 * about ShuttleWorks' packaging, answerable only by someone who already knows
 * what the bundles contain. A tournament director knows what they are running.
 * They pick the modules and say how many courts they have.
 *
 * The tri-state module picker that used to hide behind "Custom" IS the form
 * now. Courts moved here because it is the one venue fact needed before
 * anything can be scheduled, and it was previously buried in Venue & schedule
 * after creation.
 *
 * Built on the shared settings grammar (`Section` + `Row` + `FieldRow`) so
 * creating a workspace and configuring one look like the same product.
 *
 * Creation is one atomic request: identity, module seed, and the essential
 * venue scale are committed together before the Setup checklist opens.
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
  NumberWithSuffix,
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
import { TEXT_MUTED_SM, TEXT_MUTED_XS } from '../../lib/utils'

const MODULE_IDS: (keyof CustomState)[] = ['meet', 'bracket', 'display'];

const MODULE_STATES: { value: ModuleState; label: string }[] = [
  { value: 'enabled', label: 'On' },
  { value: 'off', label: 'Off' },
];

/** What each module actually does, in the director's terms — the one thing
 *  the preset cards did carry that a bare module name does not. */
const MODULE_HINT: Record<keyof CustomState, string> = {
  meet: 'Roster and a solved schedule',
  bracket: 'Draws, seeding, and advancement',
  display: 'A public board for the venue',
};

type TournamentType = 'meet' | 'bracket' | 'hybrid';

const TOURNAMENT_TYPES: { value: TournamentType; label: string }[] = [
  { value: 'meet', label: MODULE_LABELS.meet },
  { value: 'bracket', label: MODULE_LABELS.bracket },
  { value: 'hybrid', label: 'Hybrid' },
];

const TYPE_HINT: Record<TournamentType, string> = {
  meet: 'Court-based event with a planned day',
  bracket: 'Draws, seeding, and bracket advancement',
  hybrid: 'Run a meet and bracket in one workspace',
};

export function NewWorkspacePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [tournamentType, setTournamentType] = useState<TournamentType>('meet');
  const [modules, setModules] = useState<CustomState>(DEFAULT_CUSTOM);
  const [courts, setCourts] = useState(4);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nothingOn = MODULE_IDS.every((m) => modules[m] !== 'enabled');
  const displayOrphaned =
    modules.display !== 'off' &&
    modules.meet !== 'enabled' &&
    modules.bracket !== 'enabled';

  function setModule(id: keyof CustomState, value: ModuleState) {
    const next = { ...modules, [id]: value };
    setModules(next);
    if (id === 'meet' || id === 'bracket') {
      setTournamentType(
        next.meet === 'enabled' && next.bracket === 'enabled'
          ? 'hybrid'
          : next.bracket === 'enabled'
            ? 'bracket'
            : 'meet',
      );
    }
    // The configuration just changed, so a prior failure may no longer apply.
    setError(null);
  }

  function setType(value: TournamentType) {
    setTournamentType(value);
    setModules((prev) => ({
      ...prev,
      meet: value === 'bracket' ? 'off' : 'enabled',
      bracket: value === 'meet' ? 'off' : 'enabled',
    }));
    setError(null);
  }

  function handleContinue() {
    if (step === 1 && displayOrphaned) {
      setError('Turn on Meet or Bracket before enabling Display.');
      return;
    }
    setError(null);
    setStep((current) => Math.min(4, current + 1));
  }

  function handleBack() {
    setError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const created = await apiClient.createTournament({
        name: name.trim() || null,
        kind: kindForSeed(modules),
        tournamentDate: date || null,
        courtCount: courts,
        modules: customSeed(modules),
      });

      // Open via the RETURNED module state. `landingRoute` sends a workspace
      // with nothing enabled to Modules setup, else to its primary module.
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

      <div className="sw-float-in mx-auto max-w-3xl space-y-2 px-6 py-10">
        <div className="space-y-1 pb-2">
          <h1 className="type-display text-2xl text-foreground">New workspace</h1>
          <p className={TEXT_MUTED_SM}>Set up the essentials now. You can complete the rest from Setup.</p>
        </div>

        <ol aria-label="Workspace creation steps" className="mb-6 grid grid-cols-4 gap-2 border-y border-border py-3">
          {['Type', 'Identity', 'Venue', 'Review'].map((label, index) => {
            const number = index + 1;
            return (
              <li key={label} className={number === step ? 'text-sm font-semibold text-accent' : number < step ? 'text-sm text-foreground' : 'text-sm text-muted-foreground'}>
                <span aria-current={number === step ? 'step' : undefined}>{number}. {label}</span>
              </li>
            );
          })}
        </ol>

        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {step === 1 ? (
          <div className="space-y-4">
            <Section title="Tournament type">
              <Row
                last
                label={<span>{TOURNAMENT_TYPES.find((item) => item.value === tournamentType)?.label}<span className="ml-2 text-xs font-normal text-muted-foreground">{TYPE_HINT[tournamentType]}</span></span>}
                control={<Seg options={TOURNAMENT_TYPES} value={tournamentType} onChange={setType} ariaLabel="Tournament type" />}
              />
            </Section>
            <Section title="Modules">
              {MODULE_IDS.map((id, i) => (
                <Row
                  key={id}
                  last={i === MODULE_IDS.length - 1}
                  label={<span className="inline-flex items-baseline gap-2">{MODULE_LABELS[id]}<span className="text-xs font-normal text-muted-foreground">{MODULE_HINT[id]}</span></span>}
                  control={<Seg options={MODULE_STATES} value={modules[id]} onChange={(v) => setModule(id, v)} ariaLabel={MODULE_LABELS[id]} />}
                />
              ))}
            </Section>
            {displayOrphaned || nothingOn ? (
              <p data-testid="modules-hint" className="pt-1 text-xs text-status-warning">
                {nothingOn ? 'Nothing is on yet, so this workspace opens on Modules.' : 'Display needs Meet or Bracket on to show anything.'}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <Section title="Essential identity">
            <FieldRow label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Invitational" disabled={creating} hint="Optional. You can name it later." />
            <FieldRow last label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={creating} hint="The tournament date can be changed later in Setup." />
          </Section>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <Section title="Venue scale">
              <Row last label="Courts" control={<NumberWithSuffix value={courts} onChange={setCourts} suffix="courts" min={1} max={64} ariaLabel="Courts" />} />
            </Section>
            <p className={TEXT_MUTED_XS}>This seeds the first schedule shape. Slot length and daily hours default to 30 minutes and 9:00 AM–6:00 PM and can be refined in Setup.</p>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <Section title="Review">
              <Row label="Tournament type" control={<span className={TEXT_MUTED_SM}>{tournamentType[0].toUpperCase() + tournamentType.slice(1)}</span>} />
              <Row label="Modules" control={<span className={TEXT_MUTED_SM}>{MODULE_IDS.filter((id) => modules[id] === 'enabled').map((id) => MODULE_LABELS[id]).join(', ') || 'None yet'}</span>} />
              <Row label="Name" control={<span className={TEXT_MUTED_SM}>{name.trim() || 'Untitled'}</span>} />
              <Row label="Date" control={<span className={TEXT_MUTED_SM}>{date || 'Not set'}</span>} />
              <Row last label="Venue scale" control={<span className={TEXT_MUTED_SM}>{courts} courts</span>} />
            </Section>
            <p className={TEXT_MUTED_XS}>Creating saves these essentials together. Afterward, Overview will point you to the remaining Setup checklist.</p>
          </div>
        ) : null}

        <div className="flex justify-between border-t border-border pt-4">
          <Button variant="ghost" onClick={step === 1 ? () => navigate('/') : handleBack} disabled={creating}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button onClick={step === 4 ? handleCreate : handleContinue} disabled={creating || (step === 1 && displayOrphaned)}>
            {step === 4 ? (creating ? 'Creating…' : 'Create workspace') : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
