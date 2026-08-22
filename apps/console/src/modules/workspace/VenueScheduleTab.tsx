/**
 * Venue & schedule — a workspace-level surface for the fields that
 * describe the venue, not either engine: court count, slot duration, and
 * the day's start / end. These were duplicated in both Meet and Bracket
 * Configuration; they live here once now.
 *
 * They read and write the SAME `tournamentStore.config` fields the two
 * engines already use (`courtCount`, `intervalMinutes`, `dayStart`,
 * `dayEnd`) — no data-model change. Edits land in a local draft and Save
 * commits them through `setConfig`, which the AppShell-mounted
 * `useTournamentState` debounces into a PUT — the same explicit-save model,
 * and the same transport, as the engine Configuration forms (R-K).
 *
 * Engine-specific timing (rest between matches / rounds, breaks) stays in
 * each engine's Configuration.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@scheduler/design-system';
import { PAGE_BODY_WIDTH } from '../../components/control-plane';
import { useTournamentStore } from '../../store/tournamentStore';
import type { TournamentConfig } from '../../api/dto';
import { useLockGuard } from '../../hooks/useLockGuard';
import { useTournamentIdOrNull } from '../../hooks/useTournamentId';
import { useMatchStateSync } from '../../hooks/useMatchStateSync';
import { useMeetResultsLock } from '../../hooks/useMeetResultsLock';
import { LockRibbon } from '../../components/status/LockRibbon';
import { LockedFieldset } from '../../platform/engine-config/ConfigSurface';
import {
  Row,
  Section,
  Seg,
  NumberWithSuffix,
  TimeInput,
  UnitSlot,
} from '../../platform/engine-config/SettingsControls';

/** Dirty check for the draft. `TournamentConfig` holds an array (`breaks`) and
 *  a record (`courtOverrides`), so a key-by-key `===` sweep would call an
 *  untouched config dirty on every re-render; a structural compare is both
 *  correct and shorter. The object is a handful of scalars plus those two — it
 *  is not a hot path. */
const configEqual = (a: TournamentConfig, b: TournamentConfig): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

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
  const { confirmUnlock } = useLockGuard();

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

  /**
   * R-K: explicit save, like every other settings and configuration surface.
   *
   * This page used to autosave every field the instant it changed, which made
   * it the one place in the product where a control committed without being
   * asked — and it wrote the SAME config blob the two engine Configuration
   * forms write behind a Save button. So the same fields had two save models
   * depending on which page you reached them from, and this page had to carry
   * a paragraph explaining that it was the odd one out.
   *
   * Edits land in a local draft; Save commits. The schedule-unlock confirm
   * moves with it, from first-keystroke to save-time — the same `guardSave`
   * shape `TournamentSetupPage` passes to `EngineConfigForm`, and the reading
   * the ribbon's own copy ("saving these settings will clear…") always had.
   *
   * The draft is `null` until the operator touches something — NOT seeded from `config` on
   * mount. Seeding looked tidier and was wrong twice over: the store holds a
   * default config before `useTournamentState` hydrates, so the draft captured
   * the DEFAULT, the arriving server config then differed from it, and the
   * page loaded with Save already live over a stale snapshot that would have
   * overwritten the real settings on a single click.
   *
   * Null-until-edited also gives the dirty-check for free: a pending draft is
   * the only thing a poll must not overwrite, and there is no pending draft
   * until there is an edit.
   */
  const [draft, setDraft] = useState<TournamentConfig | null>(null);

  const current = draft ?? config ?? FALLBACK_CONFIG;
  const dirty = draft !== null && !configEqual(draft, config ?? FALLBACK_CONFIG);

  const set = <K extends keyof TournamentConfig>(
    key: K,
    value: TournamentConfig[K],
  ) => {
    setDraft({ ...current, [key]: value });
  };

  const save = () => {
    if (!dirty || draft === null) return;
    void confirmUnlock('save venue and schedule settings').then((ok) => {
      if (!ok) return; // Declined: the draft stays, the edits are not thrown away.
      setConfig(draft);
      // Hand the page back to the server copy, so later polls flow through.
      setDraft(null);
    });
  };

  return (
    <div className="space-y-4">
      {/* Save sits on the page-header row (ACC-1 / WSSET-2) — the position
          every other primary action on every other surface uses. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Venue and schedule</h2>
          <p className={`mt-0.5 text-sm text-muted-foreground ${PAGE_BODY_WIDTH.prose}`}>
            The courts and day window for this workspace. Both Meet and Bracket
            schedule against these.
          </p>
        </div>
        {resultsLocked ? null : (
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty}
            data-testid="venue-save"
            className="shrink-0"
          >
            Save changes
          </Button>
        )}
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

      {/* Defect D15's note is GONE (R-K / COPY-3). It existed to explain that
          this page had no Save while the schedule ribbon above it warned about
          "saving these settings" — an explanation for an inconsistency, which
          is the cheapest kind of copy to delete once the inconsistency is
          fixed. The ribbon's wording is now literally true here, exactly as it
          already was on both engine Configuration surfaces that share it. */}

      <LockedFieldset locked={resultsLocked}>
        <Section title="Venue">
          <Row
            label="Courts"
            control={
              <NumberWithSuffix
                value={current.courtCount ?? 4}
                onChange={(v) => set('courtCount', v)}
                suffix="courts"
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
                value={current.intervalMinutes ?? 30}
                onChange={(v) => set('intervalMinutes', v)}
                suffix="min"
                min={5}
                max={240}
                ariaLabel="Slot duration in minutes"
              />
            }
            last
          />
        </Section>

        <Section title="Court policy">
          {/* SP-COURT-1 (ADR 0015). Court-tied = today's promise-a-court
              timetable. Queue = the solver plans the ORDER under a court-count
              capacity and the desk sends matches to whichever court frees —
              how a real event actually runs. Per-court pins below let a show
              court stay court-tied inside a queue-mode venue. */}
          <Row
            label="Mode"
            control={
              <Seg
                options={[
                  { value: 'pinned', label: 'Court-tied' },
                  { value: 'queue', label: 'Queue' },
                ]}
                value={current.courtPolicy ?? 'pinned'}
                onChange={(v) => set('courtPolicy', v)}
                ariaLabel="Court policy"
              />
            }
            last={current.courtPolicy !== 'queue'}
          />
          {current.courtPolicy === 'queue' ? (
            <>
              <Row
                label="On deck"
                control={
                  <NumberWithSuffix
                    value={current.onDeckCount ?? 3}
                    onChange={(v) => set('onDeckCount', Math.min(5, Math.max(1, v)))}
                    suffix="matches"
                    min={1}
                    max={5}
                    ariaLabel="On deck count"
                  />
                }
              />
              <Row
                label="Court-tied courts"
                control={
                  // One chip per court. A pressed chip is PINNED (kept
                  // court-tied — filmed, rostered, hour-rented); the rest
                  // pool. Stored as exceptions in `courtOverrides`.
                  <div
                    role="group"
                    aria-label="Per-court policy overrides"
                    className="flex flex-wrap gap-1.5"
                  >
                    {Array.from({ length: current.courtCount ?? 4 }, (_, i) => i + 1).map(
                      (c) => {
                        const pinned = current.courtOverrides?.[c] === 'pinned';
                        return (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={pinned}
                            data-testid={`court-override-${c}`}
                            onClick={() => {
                              const next: Record<number, 'pinned' | 'pool'> = {
                                ...(current.courtOverrides ?? {}),
                              };
                              if (pinned) delete next[c];
                              else next[c] = 'pinned';
                              set('courtOverrides', next);
                            }}
                            className={[
                              'border px-2.5 py-1 text-xs font-medium sw-num transition-colors duration-fast ease-brand',
                              pinned
                                ? 'border-accent/40 bg-accent/15 text-accent'
                                : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                            ].join(' ')}
                          >
                            C{c}
                          </button>
                        );
                      },
                    )}
                  </div>
                }
                last
              />
            </>
          ) : null}
        </Section>

        <Section title="Day window">
          <Row
            label="Start time"
            control={
              // Empty unit column: a time field reports a quantity too, so it
              // ends where the Courts and Slot-duration boxes end.
              <span className="inline-flex items-baseline gap-2">
                <TimeInput
                  value={current.dayStart ?? '09:00'}
                  onChange={(v) => set('dayStart', v)}
                  ariaLabel="Day start"
                />
                <UnitSlot />
              </span>
            }
          />
          <Row
            label="End time"
            control={
              <span className="inline-flex items-baseline gap-2">
                <TimeInput
                  value={current.dayEnd ?? '18:00'}
                  onChange={(v) => set('dayEnd', v)}
                  ariaLabel="Day end"
                />
                <UnitSlot />
              </span>
            }
            last
          />
        </Section>
      </LockedFieldset>
    </div>
  );
}
