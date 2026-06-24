/**
 * Dedicated "New workspace" surface (route `/new`).
 *
 * Each template carries an explicit module seed (sent as `modules[]`) plus a
 * legacy `kind` (compatibility/fallback identity). On create the backend
 * persists the seed and echoes it back; we open the workspace via
 * `primaryModuleForOpen` / `defaultTabForModule` on the returned modules.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@scheduler/design-system';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { ThemeToggle } from '../../components/ThemeToggle';
import { apiClient } from '../../api/client';
import type { WorkspaceModuleDTO } from '../../api/dto';
import {
  modulesFromDto,
  modulesForWorkspace,
  primaryModuleForOpen,
  defaultTabForModule,
} from '../../platform/domain/moduleModel';

type TemplateId = 'meet-day' | 'bracket-tournament' | 'hybrid' | 'blank';

const MODULE_LABELS: Record<WorkspaceModuleDTO['moduleId'], string> = {
  meet: 'Meet',
  bracket: 'Bracket',
  display: 'Display',
};

interface Template {
  id: TemplateId;
  title: string;
  blurb: string;
  kind: 'meet' | 'bracket';
  /** Explicit module seed persisted on create (sent as `modules[]`). The
   *  landing route is derived from the returned modules, not stored here. */
  seed: WorkspaceModuleDTO[];
}

const seed = (
  moduleId: WorkspaceModuleDTO['moduleId'],
  status: WorkspaceModuleDTO['status'],
): WorkspaceModuleDTO => ({ moduleId, status, config: null });

const TEMPLATES: Template[] = [
  {
    id: 'meet-day',
    title: 'Meet Day',
    blurb: 'Roster, CP-SAT schedule, live cockpit, and a venue display.',
    kind: 'meet',
    seed: [seed('meet', 'enabled'), seed('bracket', 'available'), seed('display', 'enabled')],
  },
  {
    id: 'bracket-tournament',
    title: 'Bracket Tournament',
    blurb: 'Events, seeding, draw generation, advancement, and results.',
    kind: 'bracket',
    seed: [seed('bracket', 'enabled'), seed('meet', 'available'), seed('display', 'available')],
  },
  {
    id: 'hybrid',
    title: 'Hybrid Event',
    blurb: 'Meet and Bracket modules together in one workspace, plus a display.',
    kind: 'meet',
    seed: [seed('meet', 'enabled'), seed('bracket', 'enabled'), seed('display', 'enabled')],
  },
  {
    id: 'blank',
    title: 'Blank Workspace',
    blurb: 'Start empty and enable modules as you go.',
    kind: 'meet',
    seed: [seed('meet', 'available'), seed('bracket', 'available'), seed('display', 'disabled')],
  },
];

/** The module labels a template surfaces as chips — its enabled/available set. */
function templateModuleLabels(t: Template): string[] {
  return t.seed
    .filter((m) => m.status === 'enabled' || m.status === 'available')
    .map((m) => MODULE_LABELS[m.moduleId]);
}

export function NewWorkspacePage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<TemplateId>('meet-day');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = TEMPLATES.find((t) => t.id === selected)!;
  const canCreate = !creating;

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const created = await apiClient.createTournament({
        name: name.trim() || null,
        kind: template.kind,
        tournamentDate: date || null,
        modules: template.seed,
      });
      // Open via the RETURNED module state — primaryModuleForOpen picks the
      // landing module (first enabled, else first available) and
      // defaultTabForModule maps it to a route. No hardcoded destinations.
      const mods = created.modules
        ? modulesFromDto(created.modules)
        : modulesForWorkspace(created.kind);
      const segment = defaultTabForModule(primaryModuleForOpen(mods));
      navigate(`/tournaments/${created.id}/${segment}`);
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

      <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div className="space-y-1">
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            CONTROL PLANE
          </div>
          <h1 className="text-2xl font-semibold">New workspace</h1>
          <p className="text-sm text-muted-foreground">
            A workspace is your event control plane. Pick a template to enable its
            modules — you can add more modules later.
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => {
            const isSelected = t.id === selected;
            const labels = templateModuleLabels(t);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={isSelected}
                data-testid={`template-${t.id}`}
                onClick={() => setSelected(t.id)}
                className={[
                  'border p-4 text-left transition-colors',
                  isSelected
                    ? 'border-foreground bg-muted/30 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-foreground">{t.title}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t.blurb}</div>
                {labels.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {labels.map((m) => (
                      <span
                        key={m}
                        className="rounded-sm border border-border px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-muted-foreground">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring Invitational"
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              disabled={creating}
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              disabled={creating}
            />
          </label>
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => navigate('/')} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            {creating ? 'Creating…' : 'Create workspace'}
          </Button>
        </div>
      </div>
    </div>
  );
}
