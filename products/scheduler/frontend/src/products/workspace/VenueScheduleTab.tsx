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
import { Link } from 'react-router-dom';
import { useTournamentStore } from '../../store/tournamentStore';
import type { TournamentConfig } from '../../api/dto';
import { useLockGuard } from '../../hooks/useLockGuard';
import { useTournamentIdOrNull } from '../../hooks/useTournamentId';
import { useMatchStateSync } from '../../hooks/useMatchStateSync';
import { useMeetResultsLock } from '../../hooks/useMeetResultsLock';
import { LockRibbon } from '../../components/status/LockRibbon';
import { LockedFieldset } from '../../platform/settings/ConfigSurface';
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
  const { isLocked, confirmUnlock } = useLockGuard();

  // Defect D5, found from the other end. Meet Configuration announces
  // "Settings are read-only while matches are in play" and means it: it wraps
  // its whole form in a disabled fieldset keyed off `useMeetResultsLock`. This
  // surface holds court count, slot duration and the day window — by this
  // file's own reckoning the MOST scheduling-structural fields in the product,
  // and settings by any reading an operator would give the word — and it
  // carried only the SCHEDULE lock. So with scores already recorded, a
  // director who had just been told settings were read-only could move the day
  // window one nav item away, autosaving, with nothing to stop them.
  // The engine surfaces' own lock, on the fields that deserve it most.
  const tid = useTournamentIdOrNull();
  // The store is only hydrated by surfaces that mount a match-state loader,
  // and this is not one of them; without this the hook silently answers false
  // (see useMeetResultsLock's note). Same lightweight loader Meet
  // Configuration mounts for exactly this reason.
  useMatchStateSync(tid);
  const resultsLocked = useMeetResultsLock();

  // These fields autosave per edit — no Save step to guard — so the FIRST
  // edit under a meet schedule lock routes through the confirm-unlock modal
  // (same flow as the engine Configuration forms; on confirm the schedule
  // clears and later edits flow freely). Without this, the ribbon promised
  // a confirmation the surface never gave.
  const set = <K extends keyof TournamentConfig>(
    key: K,
    value: TournamentConfig[K],
  ) => {
    void confirmUnlock('change venue or day-window settings').then((ok) => {
      if (ok) setConfig({ ...(config ?? FALLBACK_CONFIG), [key]: value });
    });
  };

  return (
    <div className="max-w-2xl space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Venue and schedule</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The courts and day window for this workspace. Both Meet and Bracket
          schedule against these.
        </p>
      </div>

      {/* These are the MOST scheduling-structural fields in the product —
          the same CONFIG_LOCKED contract that guards the engine forms
          guards them. Same ribbons as Configuration, in the same precedence:
          once scores exist the surface is read-only, so "saving will clear the
          schedule" is no longer a thing that can happen and stacking both
          would state two different answers at once. */}
      {resultsLocked ? (
        <LockRibbon
          tier="results"
          locked
          variant="inline"
          action={
            tid ? (
              <Link
                to={`/tournaments/${tid}/matches`}
                className="ml-1 font-medium text-accent hover:underline"
              >
                View matches →
              </Link>
            ) : null
          }
        />
      ) : (
        <LockRibbon tier="schedule" variant="inline" />
      )}

      {/* Defect D15: this surface has NO Save button, and the schedule ribbon
          warns that "saving these settings will clear" the committed schedule.
          It names an action that does not exist here, so an operator reading it
          looks for a Save to avoid pressing and concludes the fields are safe
          to touch. They are not: each one autosaves, and under the lock the
          FIRST change opens the confirm-unlock modal whose OK clears the
          schedule.
          Saying when it actually fires is the fix. The ribbon copy itself is
          shared with both engine Configuration surfaces, which DO have a Save,
          so it stays right for them and gets its local caveat here. */}
      <p className="text-xs text-muted-foreground" data-testid="venue-save-note">
        {resultsLocked
          ? 'These are read-only while matches are in play. Nothing on this page can be changed until the event is done.'
          : isLocked
            ? 'There is no Save on this page: each field applies as you change it. Because a schedule is committed, the next change asks you to confirm first, and confirming clears that schedule.'
            : 'There is no Save on this page: each field applies as you change it.'}
      </p>

      <LockedFieldset locked={resultsLocked}>
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
      </LockedFieldset>
    </div>
  );
}
