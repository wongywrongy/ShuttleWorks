/**
 * DisplayLayoutEditor — the "Board layout" controls of Display Configuration.
 *
 * Drives the `tv*` family + `standingsMode` that `MeetDisplayPage` already
 * reads off the tournament config (see MeetDisplayPage.tsx:264-276) but that,
 * until now, had no UI. Same persist path as BracketEngineSection/
 * ScoringFields: reads `config` off `useTournamentStore` and writes patches
 * through `setConfig` immediately — `useTournamentState`'s subscribe+debounce
 * coalesces the PUT. No Save button; no new endpoint.
 *
 * `tvGridColumns` (`1|2|3|4|null`) and `standingsMode`
 * (`'off'|'side'|'rotate'|null`) both use `null` for "auto" — surfaced here
 * as an explicit "Auto" option that maps back to `null` on write.
 *
 * All-Seg by choice: this repo has no existing test coverage (or jsdom
 * pointer-capture/scrollIntoView shims) for interacting with the Radix-based
 * `Select`, so a dropdown control for `tvGridColumns` would be the first of
 * its kind here. Every field in this editor is a small, short-label
 * enumeration (<=5 options) that reads fine as a `Seg`, so `Seg` is used
 * throughout and `Toggle` for the one boolean — no natives, all
 * design-system primitives, without taking on unproven test infra as part
 * of this task. See task-6-report.md.
 *
 * `standingsMode` is written here but not yet CONSUMED by any board —
 * `MeetDisplayPage` doesn't read it and `BracketDisplayPage` never will
 * (courts view is meet-only). Task 9 wires the panel-vs-rotate rendering.
 */
import { useTournamentStore } from '../../../store/tournamentStore';
import type { TournamentConfig } from '../../../api/dto';
import { Row, Seg, Toggle } from '../../../platform/settings/SettingsControls';

// Same required-field shape as BracketEngineSection's FALLBACK_CONFIG — the
// TournamentConfig fields with no `?` in the DTO.
const FALLBACK_CONFIG: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
};

const DISPLAY_MODE_OPTIONS = [
  { value: 'strip' as const, label: 'Strip' },
  { value: 'grid' as const, label: 'Grid' },
  { value: 'list' as const, label: 'List' },
];

// 0 is the "Auto" sentinel — Seg needs string|number, and `null` isn't one.
const GRID_COLUMNS_OPTIONS = [
  { value: 0, label: 'Auto' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

const CARD_SIZE_OPTIONS = [
  { value: 'auto' as const, label: 'Auto' },
  { value: 'compact' as const, label: 'Compact' },
  { value: 'comfortable' as const, label: 'Comfortable' },
  { value: 'large' as const, label: 'Large' },
];

// 'auto' is the "Auto" sentinel for standingsMode's `null`.
const STANDINGS_MODE_OPTIONS = [
  { value: 'auto' as const, label: 'Auto' },
  { value: 'off' as const, label: 'Off' },
  { value: 'side' as const, label: 'Side' },
  { value: 'rotate' as const, label: 'Rotate' },
];

export function DisplayLayoutEditor() {
  const config = useTournamentStore((s) => s.config);
  const setConfig = useTournamentStore((s) => s.setConfig);

  const update = (patch: Partial<TournamentConfig>) => {
    setConfig({ ...(config ?? FALLBACK_CONFIG), ...patch });
  };

  // Mirror MeetDisplayPage's own defaulting (MeetDisplayPage.tsx:264-276) so
  // the editor's "current value" always matches what the board is actually
  // showing.
  const tvDisplayMode = config?.tvDisplayMode ?? 'strip';
  const tvGridColumns = config?.tvGridColumns ?? 0;
  const tvCardSize = config?.tvCardSize ?? 'auto';
  const tvShowScores = config?.tvShowScores !== false;
  const standingsMode = config?.standingsMode ?? 'auto';

  return (
    <div className="divide-y divide-border rounded-md border border-border px-3">
      <Row
        label="Display mode"
        control={
          <Seg
            options={DISPLAY_MODE_OPTIONS}
            value={tvDisplayMode}
            onChange={(v) => update({ tvDisplayMode: v })}
            ariaLabel="Display mode"
          />
        }
      />
      <Row
        label="Grid columns"
        control={
          <Seg
            options={GRID_COLUMNS_OPTIONS}
            value={tvGridColumns}
            onChange={(v) =>
              update({ tvGridColumns: v === 0 ? null : (v as 1 | 2 | 3 | 4) })
            }
            ariaLabel="Grid columns"
          />
        }
      />
      <Row
        label="Card size"
        control={
          <Seg
            options={CARD_SIZE_OPTIONS}
            value={tvCardSize}
            onChange={(v) => update({ tvCardSize: v })}
            ariaLabel="Card size"
          />
        }
      />
      <Row
        label="Show scores"
        control={
          <Toggle
            value={tvShowScores}
            onChange={(v) => update({ tvShowScores: v })}
            ariaLabel="Show scores"
          />
        }
      />
      <Row
        label="Standings mode"
        control={
          <Seg
            options={STANDINGS_MODE_OPTIONS}
            value={standingsMode}
            onChange={(v) => update({ standingsMode: v === 'auto' ? null : v })}
            ariaLabel="Standings mode"
          />
        }
        last
      />
    </div>
  );
}
