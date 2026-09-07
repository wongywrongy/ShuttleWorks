/**
 * PlanSettings — the plan's own scheduling settings, in the Plan.
 *
 * Minimum rest between a player's matches used to be a Setup · Rules field,
 * sitting between "points per game" and "draw size". It is neither: it is a
 * constraint the planner solves against, and the person who changes it is
 * looking at a plan while they do. It lives here, one popover off the Plan
 * toolbar, and writes the same stored value (`rules.defaultRestMinutes`)
 * every engine already reads — no second owner, no migration.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../api/client';
import type { SetupSectionData, TournamentSetupDTO } from '../../../api/dto';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { useTournamentId } from '../../../hooks/useTournamentId';
import { PickerPopover } from '../../../components/control-plane';
import { NumberWithSuffix, Row } from '../../../platform/engine-config/SettingsControls';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';
import { UTILITY_BUTTON } from '../../../lib/utils';

const triggerBtn = UTILITY_BUTTON;

function restOf(data: SetupSectionData | undefined): number {
  const value = Number(data?.defaultRestMinutes);
  return Number.isFinite(value) ? value : 0;
}

export function PlanSettings() {
  const tid = useTournamentId();
  const canEdit = useCanEdit();
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<SetupSectionData | null>(null);
  const [rest, setRest] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const adopt = useCallback((setup: TournamentSetupDTO) => {
    const next = setup.sections.find((section) => section.key === 'rules')?.data ?? {};
    setRules(next);
    setRest(restOf(next));
  }, []);

  useEffect(() => {
    if (!tid || !open || rules) return;
    let alive = true;
    apiClient
      .getTournamentSetup(tid)
      .then((setup) => { if (alive) adopt(setup); })
      .catch(() => { if (alive) setError('Plan settings could not be loaded.'); });
    return () => { alive = false; };
  }, [adopt, open, rules, tid]);

  const save = async () => {
    if (!tid || !rules || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await apiClient.patchTournamentSetup(tid, 'rules', {
        ...rules,
        defaultRestMinutes: rest >= 0 ? rest : null,
      });
      adopt(next);
      setSaved(true);
    } catch {
      setError('Plan settings were not saved. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const dirty = rules != null && rest !== restOf(rules);

  return (
    <PickerPopover open={open} onOpenChange={setOpen}>
      <PickerPopover.Anchor asChild>
        <div ref={anchor}>
          <button
            type="button"
            className={triggerBtn}
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-testid="ops-plan-settings"
          >
            Plan settings
          </button>
        </div>
      </PickerPopover.Anchor>
      <PickerPopover.Panel aria-label="Plan settings" align="end" className="w-80" guardRef={anchor}>
        <div className="p-3">
          <Row
            label="Minimum rest between matches"
            control={
              <NumberWithSuffix
                value={rest}
                onChange={(value) => { setRest(value); setSaved(false); }}
                suffix="min"
                min={0}
                max={240}
                ariaLabel="Minimum rest between matches"
              />
            }
            last
          />
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {error ?? (saving ? 'Saving…' : dirty ? 'Unsaved change' : saved ? 'Saved' : 'Applies to the next plan you generate.')}
          </p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className={triggerBtn}
              disabled={!dirty || saving || !canEdit}
              title={canEdit ? undefined : READ_ONLY_MESSAGE}
              onClick={() => void save()}
              data-testid="ops-plan-settings-save"
            >
              Save
            </button>
          </div>
        </div>
      </PickerPopover.Panel>
    </PickerPopover>
  );
}
