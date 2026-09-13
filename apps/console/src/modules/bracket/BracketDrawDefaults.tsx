/**
 * BracketDrawDefaults — the workspace's default draw format and draw size.
 *
 * These used to live in Setup, next to scoring. They are structural
 * properties of a DRAW, so they belong to the module that owns draws: a
 * director changing "single elimination" is describing this bracket, not the
 * tournament's scoring rules.
 *
 * They are DEFAULTS. A draw that has already been generated keeps the format
 * and size it was generated with; changing it is a regeneration, offered
 * where regeneration actually happens (Draws). This section states that once,
 * in the sentence the product uses everywhere for a generated draw, instead
 * of showing an Edit control that cannot do what it says.
 *
 * Storage is the shared Setup document (`rules.format`, `rules.drawSize`), so
 * nothing else has to learn a new home for a value it already reads.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FormActions } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { SetupSectionData, TournamentSetupDTO } from '../../api/dto';
import { useBracket } from '../../hooks/useBracket';
import { useTournamentId } from '../../hooks/useTournamentId';
import {
  NumberWithSuffix,
  Row,
  Section,
  SelectInput,
} from '../../platform/engine-config/SettingsControls';
import {
  effectiveRulesSentence,
  type ScoringValue,
} from '../../platform/engine-config/ScoringFields';

/** The one sentence the product uses for a generated draw's structure. */
export const GENERATED_DRAW_LOCK =
  'This draw has been generated. Regenerate it to change format or size.';

const FORMAT_OPTIONS = [
  { value: 'none', label: 'Not configured' },
  { value: 'mixed', label: 'Mixed / by event' },
  { value: 'se', label: 'Single elimination' },
  { value: 'de', label: 'Double elimination' },
  { value: 'rr', label: 'Round robin' },
  { value: 'swiss', label: 'Swiss' },
  { value: 'monrad', label: 'Monrad' },
  { value: 'compass', label: 'Compass' },
];

function textOf(data: SetupSectionData | null | undefined, field: string): string {
  const value = data?.[field];
  return value == null ? '' : String(value);
}

function numberOf(data: SetupSectionData | null | undefined, field: string): number {
  const value = Number(data?.[field]);
  return Number.isFinite(value) ? value : 0;
}

export function BracketDrawDefaults() {
  const tid = useTournamentId();
  const { data } = useBracket();
  const [draft, setDraft] = useState<SetupSectionData | null>(null);
  const [stored, setStored] = useState<SetupSectionData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adopt = useCallback((setup: TournamentSetupDTO) => {
    const rules = setup.sections.find((section) => section.key === 'rules')?.data ?? {};
    setStored(rules);
    setDraft(rules);
  }, []);

  useEffect(() => {
    if (!tid) return;
    let alive = true;
    apiClient
      .getTournamentSetup(tid)
      .then((setup) => { if (alive) adopt(setup); })
      .catch(() => { if (alive) setError('Draw defaults could not be loaded.'); });
    return () => { alive = false; };
  }, [adopt, tid]);

  const generated = (data?.events ?? []).some((event) => event.status && event.status !== 'draft');

  // Scoring is Setup's, not a per-draw setting: the engine stores one set of
  // rules per workspace and has no per-draw override to offer. Stating the
  // effective defaults here — read-only, with a route to their one editor —
  // answers "what will this draw be played to?" without inventing a second
  // owner for the value.
  const scoring: ScoringValue = {
    scoringFormat: textOf(draft, 'scoring') === 'simple' ? 'simple' : 'badminton',
    pointsPerSet: numberOf(draft, 'pointsPerSet') || 21,
    setsToWin: numberOf(draft, 'setsToWin') || 2,
    deuceEnabled: draft?.deuceEnabled !== false,
    pointCap: numberOf(draft, 'pointCap') || null,
  };

  const update = (field: string, value: unknown) => {
    setSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...(current ?? {}), [field]: value }));
  };

  const save = async () => {
    if (!tid || !draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await apiClient.patchTournamentSetup(tid, 'rules', draft);
      adopt(next);
      setDirty(false);
      setSaved(true);
    } catch {
      setError('Draw defaults were not saved. Your changes are still here; check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Draw defaults">
      <Row
        label="Format"
        control={
          <SelectInput
            value={textOf(draft, 'format') || 'none'}
            onChange={(value) => update('format', value === 'none' ? null : value)}
            options={FORMAT_OPTIONS}
            ariaLabel="Default draw format"
          />
        }
      />
      <Row
        label="Draw size"
        control={
          <NumberWithSuffix
            value={numberOf(draft, 'drawSize')}
            onChange={(value) => update('drawSize', value > 0 ? value : null)}
            suffix="entrants"
            min={2}
            max={4096}
            ariaLabel="Default draw size"
          />
        }
        last={!generated}
      />
      {generated ? (
        <Row
          label="Generated draws"
          readOnly
          control={
            <span className="text-xs text-muted-foreground">
              {GENERATED_DRAW_LOCK}{' '}
              <Link
                to={`/tournaments/${tid}/bracket/draws`}
                className="font-medium text-accent underline underline-offset-2"
              >
                Open draws
              </Link>
            </span>
          }
          last
        />
      ) : null}
      <Row
        label="Scoring"
        readOnly
        control={
          <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <span className="text-muted-foreground">{effectiveRulesSentence(scoring)}</span>
            <Link
              to={`/tournaments/${tid}/setup/scoring`}
              className="border border-border px-2 py-1 font-medium text-foreground hover:bg-muted"
            >
              Edit defaults
            </Link>
          </span>
        }
        last
      />
      <div className="flex justify-end pt-4">
        <FormActions
          dirty={dirty}
          saving={saving}
          error={error ?? undefined}
          cleanReason={saved ? 'Saved' : 'No changes'}
          onDiscard={() => { setDraft(stored); setDirty(false); setSaved(false); setError(null); }}
          onSave={() => void save()}
          saveLabel="Save"
        />
      </div>
    </Section>
  );
}
