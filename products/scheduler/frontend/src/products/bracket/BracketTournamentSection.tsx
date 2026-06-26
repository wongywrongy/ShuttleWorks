/**
 * BracketTournamentSection — the Tournament section of bracket Setup.
 *
 * Engine timing only. Tournament identity (name / date) lives in workspace
 * settings, and the venue fields (courts, slot duration, day start / end)
 * live in the workspace Venue & schedule surface — both were duplicated
 * across Meet and Bracket Configuration and have been extracted up. The
 * only field that stays here is the bracket-specific "rest between rounds".
 *
 * Persist path: the field writes through `setConfig` on blur (only when
 * changed); `useTournamentState`'s debounce coalesces the PUT.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournamentStore } from '../../store/tournamentStore';
import { useTournamentId } from '../../hooks/useTournamentId';
import type { TournamentConfig } from '../../api/dto';
import { Row, SectionHeader } from '../../platform/settings/SettingsControls';

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
  const tid = useTournamentId();

  const [restDraft, setRestDraft] = useState(
    String(config?.restBetweenRounds ?? 1),
  );

  // Resync draft when store config changes (hydrate, another tab, etc.).
  useEffect(() => {
    setRestDraft(String(config?.restBetweenRounds ?? 1));
  }, [config?.restBetweenRounds]);

  const update = (patch: Partial<TournamentConfig>) => {
    setConfig({ ...(config ?? FALLBACK_CONFIG), ...patch });
  };

  return (
    <div>
      <SectionHeader>Schedule</SectionHeader>
      <p className="pb-1 text-xs text-muted-foreground">
        Tournament name and date live in{' '}
        <Link
          to={`/tournaments/${tid}/ws-settings`}
          className="text-accent hover:underline"
        >
          workspace settings
        </Link>
        ; courts and schedule timing live in{' '}
        <Link
          to={`/tournaments/${tid}/ws-venue`}
          className="text-accent hover:underline"
        >
          Venue &amp; schedule
        </Link>
        .
      </p>
      <Row
        label="Rest between rounds (slots)"
        control={
          <input
            type="number"
            min={0}
            max={32}
            aria-label="Rest between rounds (slots)"
            value={restDraft}
            onChange={(e) => setRestDraft(e.target.value)}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== (config?.restBetweenRounds ?? 1)) {
                update({ restBetweenRounds: next });
              }
            }}
            className={`${TEXT_INPUT_CLASSES} w-20 tabular-nums`}
          />
        }
        last
      />
    </div>
  );
}
