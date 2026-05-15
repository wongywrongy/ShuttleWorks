/**
 * Setup tab — bracket Identity + Schedule&Venue configuration.
 * Hand-rolled h2 + grid sections (matches meet's TournamentConfigForm
 * pattern). Auto-persists per field on blur with the 500ms debounce
 * provided by useTournamentState.
 */
import type { ReactNode } from 'react';
import { useTournamentStore } from '../../store/tournamentStore';
import type { TournamentConfig } from '../../api/dto';

export function SetupTab() {
  const config = useTournamentStore((s) => s.config);
  const setConfig = useTournamentStore((s) => s.setConfig);

  const update = (patch: Partial<TournamentConfig>) => {
    const merged: TournamentConfig = {
      ...(config ?? {
        intervalMinutes: 30,
        dayStart: '09:00',
        dayEnd: '18:00',
        breaks: [],
        courtCount: 4,
        defaultRestMinutes: 0,
        freezeHorizonSlots: 0,
        restBetweenRounds: 1,
      }),
      ...patch,
    };
    setConfig(merged);
  };

  return (
    <div className="min-h-full bg-background">
      <main className="mx-auto max-w-4xl px-6 py-8 space-y-10">
        <section>
          <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Identity
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tournament name">
              <input
                type="text"
                defaultValue={config?.tournamentName ?? ''}
                onBlur={(e) => {
                  if (e.target.value !== (config?.tournamentName ?? '')) update({ tournamentName: e.target.value });
                }}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Tournament date">
              <input
                type="date"
                defaultValue={config?.tournamentDate ?? ''}
                onBlur={(e) => {
                  if (e.target.value !== (config?.tournamentDate ?? '')) update({ tournamentDate: e.target.value || undefined });
                }}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>
        </section>

        <section>
          <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Schedule &amp; venue
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Courts">
              <input
                type="number"
                min={1}
                max={32}
                defaultValue={config?.courtCount ?? 4}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (next !== (config?.courtCount ?? 4)) update({ courtCount: next });
                }}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Slot duration (minutes)">
              <input
                type="number"
                min={5}
                max={240}
                defaultValue={config?.intervalMinutes ?? 30}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (next !== (config?.intervalMinutes ?? 30)) update({ intervalMinutes: next });
                }}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                defaultValue={config?.dayStart ?? '09:00'}
                onBlur={(e) => {
                  if (e.target.value !== (config?.dayStart ?? '09:00')) update({ dayStart: e.target.value });
                }}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                defaultValue={config?.dayEnd ?? '18:00'}
                onBlur={(e) => {
                  if (e.target.value !== (config?.dayEnd ?? '18:00')) update({ dayEnd: e.target.value });
                }}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Rest between rounds (slots)">
              <input
                type="number"
                min={0}
                max={32}
                defaultValue={config?.restBetweenRounds ?? 1}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (next !== (config?.restBetweenRounds ?? 1)) update({ restBetweenRounds: next });
                }}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
