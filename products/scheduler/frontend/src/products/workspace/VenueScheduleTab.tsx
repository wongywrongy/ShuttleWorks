/**
 * Venue & schedule — a workspace-level surface for the fields that
 * describe the venue, not either engine: court count, slot duration, and
 * the day's start / end. These were duplicated in both Meet and Bracket
 * Configuration; they live here once now.
 *
 * They read and write the SAME `tournamentStore.config` fields the two
 * engines already use (`courtCount`, `intervalMinutes`, `dayStart`,
 * `dayEnd`) — no data-model change. Writes go through `setConfig`, which
 * the AppShell-mounted `useTournamentState` debounces into a PUT, so this
 * surface persists exactly like the engine Configuration forms.
 *
 * Engine-specific timing (rest between matches / rounds, breaks) stays in
 * each engine's Configuration.
 */
import { useTournamentStore } from '../../store/tournamentStore';
import type { TournamentConfig } from '../../api/dto';
import {
  Row,
  SectionHeader,
  NumberInput,
  NumberWithSuffix,
  TimeInput,
} from '../../platform/settings/SettingsControls';

const FALLBACK_CONFIG: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 30,
  freezeHorizonSlots: 0,
};

export function VenueScheduleTab() {
  const config = useTournamentStore((s) => s.config);
  const setConfig = useTournamentStore((s) => s.setConfig);

  const set = <K extends keyof TournamentConfig>(
    key: K,
    value: TournamentConfig[K],
  ) => {
    setConfig({ ...(config ?? FALLBACK_CONFIG), [key]: value });
  };

  return (
    <div className="max-w-2xl space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Venue &amp; schedule</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The courts and day window for this workspace. Both Meet and Bracket
          schedule against these.
        </p>
      </div>

      <section>
        <SectionHeader>Venue</SectionHeader>
        <Row
          label="Courts"
          control={
            <NumberInput
              value={config?.courtCount ?? 4}
              onChange={(v) => set('courtCount', v)}
              min={1}
              max={32}
              ariaLabel="Court count"
            />
          }
        />
        <Row
          label="Slot duration"
          control={
            <NumberWithSuffix
              value={config?.intervalMinutes ?? 30}
              onChange={(v) => set('intervalMinutes', v)}
              suffix="min"
              min={5}
              max={240}
              ariaLabel="Slot duration in minutes"
            />
          }
          last
        />
      </section>

      <section>
        <SectionHeader>Day window</SectionHeader>
        <Row
          label="Start time"
          control={
            <TimeInput
              value={config?.dayStart ?? '09:00'}
              onChange={(v) => set('dayStart', v)}
              ariaLabel="Day start"
            />
          }
        />
        <Row
          label="End time"
          control={
            <TimeInput
              value={config?.dayEnd ?? '18:00'}
              onChange={(v) => set('dayEnd', v)}
              ariaLabel="Day end"
            />
          }
          last
        />
      </section>
    </div>
  );
}
