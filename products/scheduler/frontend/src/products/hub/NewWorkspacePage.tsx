/**
 * Dedicated "New workspace" surface (route `/new`) — a workspace *system builder*.
 *
 * Pick a preset template (each carries an explicit `modules[]` seed + a legacy
 * `kind`) or build a Custom one by toggling each module. On create the backend
 * persists the seed and echoes it back; `landingRoute` opens the workspace on its
 * primary module — or, when nothing is enabled, on Modules setup. Name and date
 * are secondary details.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@scheduler/design-system';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { ThemeToggle } from '../../components/ThemeToggle';
import { apiClient } from '../../api/client';
import { TEMPLATES, type TemplateId } from './newWorkspaceTemplates';
import { landingRoute } from './workspaceCreateFlow';
import { TemplateCard } from './TemplateCard';
import { CustomModulesBuilder } from './CustomModulesBuilder';
import { customSeed, kindForSeed, DEFAULT_CUSTOM, type CustomState } from './customModules';

export function NewWorkspacePage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<TemplateId>('meet-day');
  const [custom, setCustom] = useState<CustomState>(DEFAULT_CUSTOM);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Select a template (or 'custom') and clear any stale create error, since the
  // configuration just changed and a prior failure may no longer apply.
  function pick(id: TemplateId) {
    setSelected(id);
    setError(null);
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const isCustom = selected === 'custom';
      const tpl = TEMPLATES.find((t) => t.id === selected);
      // Guard the non-null assertions below: a non-custom selection must match a
      // TEMPLATES entry. (Defends against a future TemplateId added without a seed.)
      if (!isCustom && !tpl) {
        setError('Unknown template — please refresh and try again.');
        return;
      }
      const modules = isCustom ? customSeed(custom) : tpl!.seed;
      const kind = isCustom ? kindForSeed(custom) : tpl!.kind;
      const created = await apiClient.createTournament({
        name: name.trim() || null,
        kind,
        tournamentDate: date || null,
        modules,
      });
      // Open via the RETURNED module state. landingRoute sends a workspace with
      // nothing enabled (Blank / available-only Custom) to Modules setup, else to
      // its primary module tab. No hardcoded destinations.
      navigate(landingRoute(created));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-chrome flex h-12 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <ShuttleWorksMark />
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div className="space-y-1">
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            CONTROL PLANE
          </div>
          <h1 className="text-2xl font-semibold">New workspace</h1>
          <p className="text-sm text-muted-foreground">
            Choose a system — or build a custom one. Modules can be turned on now or
            left available to enable later.
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

        <section className="space-y-3">
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            SYSTEM
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={selected === t.id}
                onSelect={() => pick(t.id)}
              />
            ))}
            <button
              type="button"
              aria-pressed={selected === 'custom'}
              data-testid="template-custom"
              onClick={() => pick('custom')}
              className={[
                'flex flex-col gap-2 rounded-md border p-4 text-left transition-colors sm:col-span-2',
                selected === 'custom'
                  ? 'border-foreground bg-muted/30'
                  : 'border-dashed border-border hover:bg-muted/40',
              ].join(' ')}
            >
              <div className="text-sm font-semibold text-foreground">Custom</div>
              <div className="text-xs text-muted-foreground">
                Choose exactly which modules to enable, make available, or leave off.
              </div>
            </button>
          </div>
          {selected === 'custom' ? (
            <CustomModulesBuilder state={custom} onChange={setCustom} />
          ) : null}
        </section>

        <section className="space-y-2">
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            DETAILS (OPTIONAL)
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring Invitational"
                className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                disabled={creating}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                disabled={creating}
              />
            </label>
          </div>
        </section>

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
