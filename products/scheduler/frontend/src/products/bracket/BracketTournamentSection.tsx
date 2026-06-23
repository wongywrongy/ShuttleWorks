/**
 * BracketTournamentSection — the Tournament section of bracket Setup.
 *
 * Replaces the prior `SetupTab.tsx` flat form. Same fields, same
 * controlled-draft + onBlur dirty-check semantics — but laid out in
 * meet's SettingsPrimitives chrome (SectionHeader + Row) so bracket
 * Setup visually matches meet Setup once the SettingsShell wraps it.
 *
 * Persist path: every field writes through `setConfig` on blur (only
 * when changed). `useTournamentState`'s 500ms debounce coalesces the
 * subsequent PUT.
 */
import { useEffect, useState } from 'react';
import { useTournamentStore } from '../../store/tournamentStore';
import type { TournamentConfig } from '../../api/dto';
import { Row, SectionHeader } from '../../features/settings/SettingsControls';

interface DraftState {
  tournamentName: string;
  tournamentDate: string;
  courtCount: string;
  intervalMinutes: string;
  dayStart: string;
  dayEnd: string;
  restBetweenRounds: string;
}

function configToDraft(config: TournamentConfig | null): DraftState {
  return {
    tournamentName: config?.tournamentName ?? '',
    tournamentDate: config?.tournamentDate ?? '',
    courtCount: String(config?.courtCount ?? 4),
    intervalMinutes: String(config?.intervalMinutes ?? 30),
    dayStart: config?.dayStart ?? '09:00',
    dayEnd: config?.dayEnd ?? '18:00',
    restBetweenRounds: String(config?.restBetweenRounds ?? 1),
  };
}

const FALLBACK_CONFIG: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
  restBetweenRounds: 1,
};

const TEXT_INPUT_CLASSES =
  'h-7 rounded-sm border border-border bg-bg-elev px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export function BracketTournamentSection() {
  const config = useTournamentStore((s) => s.config);
  const setConfig = useTournamentStore((s) => s.setConfig);

  const [draft, setDraft] = useState<DraftState>(() => configToDraft(config));

  // Resync draft when store config changes (hydrate, another tab, etc.).
  useEffect(() => {
    setDraft(configToDraft(config));
  }, [config]);

  const update = (patch: Partial<TournamentConfig>) => {
    setConfig({ ...(config ?? FALLBACK_CONFIG), ...patch });
  };

  return (
    <div>
      <SectionHeader>Identity</SectionHeader>
      <Row
        label="Tournament name"
        control={
          <input
            type="text"
            aria-label="Tournament name"
            value={draft.tournamentName}
            onChange={(e) => setDraft((d) => ({ ...d, tournamentName: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== (config?.tournamentName ?? '')) {
                update({ tournamentName: e.target.value });
              }
            }}
            className={`${TEXT_INPUT_CLASSES} w-64`}
          />
        }
      />
      <Row
        label="Tournament date"
        control={
          <input
            type="date"
            aria-label="Tournament date"
            value={draft.tournamentDate}
            onChange={(e) => setDraft((d) => ({ ...d, tournamentDate: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== (config?.tournamentDate ?? '')) {
                update({ tournamentDate: e.target.value || undefined });
              }
            }}
            className={`${TEXT_INPUT_CLASSES} w-44`}
          />
        }
        last
      />

      <SectionHeader>Schedule &amp; venue</SectionHeader>
      <Row
        label="Courts"
        control={
          <input
            type="number"
            min={1}
            max={32}
            aria-label="Courts"
            value={draft.courtCount}
            onChange={(e) => setDraft((d) => ({ ...d, courtCount: e.target.value }))}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== (config?.courtCount ?? 4)) update({ courtCount: next });
            }}
            className={`${TEXT_INPUT_CLASSES} w-20 tabular-nums`}
          />
        }
      />
      <Row
        label="Slot duration (minutes)"
        control={
          <input
            type="number"
            min={5}
            max={240}
            aria-label="Slot duration (minutes)"
            value={draft.intervalMinutes}
            onChange={(e) => setDraft((d) => ({ ...d, intervalMinutes: e.target.value }))}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== (config?.intervalMinutes ?? 30)) update({ intervalMinutes: next });
            }}
            className={`${TEXT_INPUT_CLASSES} w-20 tabular-nums`}
          />
        }
      />
      <Row
        label="Start time"
        control={
          <input
            type="time"
            aria-label="Start time"
            value={draft.dayStart}
            onChange={(e) => setDraft((d) => ({ ...d, dayStart: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== (config?.dayStart ?? '09:00')) update({ dayStart: e.target.value });
            }}
            className={`${TEXT_INPUT_CLASSES} w-32`}
          />
        }
      />
      <Row
        label="End time"
        control={
          <input
            type="time"
            aria-label="End time"
            value={draft.dayEnd}
            onChange={(e) => setDraft((d) => ({ ...d, dayEnd: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== (config?.dayEnd ?? '18:00')) update({ dayEnd: e.target.value });
            }}
            className={`${TEXT_INPUT_CLASSES} w-32`}
          />
        }
      />
      <Row
        label="Rest between rounds (slots)"
        control={
          <input
            type="number"
            min={0}
            max={32}
            aria-label="Rest between rounds (slots)"
            value={draft.restBetweenRounds}
            onChange={(e) => setDraft((d) => ({ ...d, restBetweenRounds: e.target.value }))}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== (config?.restBetweenRounds ?? 1)) update({ restBetweenRounds: next });
            }}
            className={`${TEXT_INPUT_CLASSES} w-20 tabular-nums`}
          />
        }
        last
      />
    </div>
  );
}
