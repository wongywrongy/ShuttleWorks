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
 * Two writes on create: `POST /tournaments` seeds name/kind/date/modules (its
 * DTO is strict and carries no config), then `PUT /state` seeds courtCount.
 * The second is best-effort — if it fails the workspace still exists with the
 * default court count and Venue & schedule can fix it, which is a better
 * outcome than failing the creation the director already committed to.
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

export function NewWorkspacePage() {
  const navigate = useNavigate();
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
    setModules((prev) => ({ ...prev, [id]: value }));
    // The configuration just changed, so a prior failure may no longer apply.
    setError(null);
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const created = await apiClient.createTournament({
        name: name.trim() || null,
        kind: kindForSeed(modules),
        tournamentDate: date || null,
        modules: customSeed(modules),
      });

      // Seed the court count. Best-effort: see the module docstring.
      if (courts !== 4) {
        try {
          const state = await apiClient.getTournamentState(created.id);
          if (state?.config) {
            await apiClient.putTournamentState(created.id, {
              ...state,
              config: { ...state.config, courtCount: courts },
            });
          }
        } catch {
          /* keep the workspace; Venue & schedule owns the fix */
        }
      }

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
        {/* No eyebrow: "CONTROL PLANE" named the product category, not this
            page, and the H1 below already says where you are (NEW-1). */}
        <div className="space-y-1 pb-2">
          <h1 className="type-display text-2xl text-foreground">New workspace</h1>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

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
                  </span>
                </span>
              }
              control={
                <Seg
                  options={MODULE_STATES}
                  value={modules[id]}
                  onChange={(v) => setModule(id, v)}
                  ariaLabel={MODULE_LABELS[id]}
                />
              }
            />
          ))}
        </Section>

        {/* Warn, never block: both states are recoverable from Modules after
            creation, and a director mid-setup should not be argued with. */}
        {displayOrphaned || nothingOn ? (
          <p
            data-testid="modules-hint"
            className="pt-1 text-xs text-status-warning"
          >
            {nothingOn
              ? 'Nothing is on yet, so this workspace opens on Modules.'
              : 'Display needs Meet or Bracket on to show anything.'}
          </p>
        ) : null}

        <Section title="Venue">
          <Row
            last
            label="Courts"
            control={
              <NumberWithSuffix
                value={courts}
                onChange={setCourts}
                suffix="courts"
                min={1}
                max={64}
                ariaLabel="Courts"
              />
            }
          />
        </Section>
        {/* Venue and schedule owns venue configuration; this form seeds the one
            number that shapes everything downstream and names where the rest
            lives (NEW-4 / WSV-2). It cannot link there — the workspace does not
            exist yet — so it names the destination instead. */}
        <p className="pt-1 text-xs text-muted-foreground">
          Slot length and the day window default to 30 minutes and 9:00 AM to
          6:00 PM. Change them in Venue and schedule once the workspace exists.
        </p>

        <Section title="Details">
          <FieldRow
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Spring Invitational"
            disabled={creating}
            hint="Optional. You can name it later."
          />
          <FieldRow
            last
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={creating}
          />
        </Section>

        <div className="flex justify-between border-t border-border pt-4">
          <Button variant="ghost" onClick={() => navigate('/')} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create workspace'}
          </Button>
        </div>
      </div>
    </div>
  );
}
