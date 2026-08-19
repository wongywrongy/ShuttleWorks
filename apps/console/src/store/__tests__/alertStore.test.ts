import { describe, it, expect, beforeEach } from 'vitest';
import { useAlertStore } from '../alertStore';
import { classifyAdvisory, advisoryToEntry, sortPanel } from '../../platform/domain/alertModel';
import type { Advisory } from '../../api/dto';

function adv(partial: Partial<Advisory> & Pick<Advisory, 'id' | 'severity'>): Advisory {
  return {
    kind: 'running_behind',
    summary: `${partial.id} summary`,
    detail: null,
    matchId: null,
    courtId: null,
    suggestedAction: null,
    suggestionId: null,
    detectedAt: '2026-07-10T09:00:00.000Z',
    ...partial,
  };
}

describe('alertModel.classifyAdvisory', () => {
  it('maps severity to placement bucket', () => {
    expect(classifyAdvisory(adv({ id: 'a', severity: 'critical' }))).toBe('decision');
    expect(classifyAdvisory(adv({ id: 'b', severity: 'warn' }))).toBe('warning');
    expect(classifyAdvisory(adv({ id: 'c', severity: 'info' }))).toBe('info');
  });

  it('advisoryToEntry carries the advisory + timestamp', () => {
    const a = adv({ id: 'x', severity: 'warn', detail: 'running 12m late' });
    const e = advisoryToEntry(a);
    expect(e).toMatchObject({ id: 'x', severity: 'warning', ts: a.detectedAt, advisory: a });
    expect(e.message).toBe('running 12m late');
  });
});

describe('alertModel.sortPanel', () => {
  it('orders newest first by ts', () => {
    const older = advisoryToEntry(adv({ id: 'o', severity: 'warn', detectedAt: '2026-07-10T09:00:00Z' }));
    const newer = advisoryToEntry(adv({ id: 'n', severity: 'warn', detectedAt: '2026-07-10T10:00:00Z' }));
    expect(sortPanel([older, newer]).map((e) => e.id)).toEqual(['n', 'o']);
  });
});

describe('alertStore.syncAdvisories', () => {
  beforeEach(() => useAlertStore.getState().reset());

  it('keeps warning/info as conditions and excludes decisions', () => {
    useAlertStore.getState().syncAdvisories([
      adv({ id: 'w', severity: 'warn' }),
      adv({ id: 'i', severity: 'info' }),
      adv({ id: 'd', severity: 'critical' }), // decision → banner, not the rail
    ]);
    const conds = useAlertStore.getState().conditions;
    expect(Object.keys(conds).sort()).toEqual(['i', 'w']);
  });

  it('records a resolution in the activity trail when a warning drops out', () => {
    useAlertStore.getState().syncAdvisories([adv({ id: 'late', severity: 'warn' })]);
    expect(Object.keys(useAlertStore.getState().conditions)).toEqual(['late']);
    // Next poll no longer includes it → resolved, not deleted.
    useAlertStore.getState().syncAdvisories([]);
    expect(useAlertStore.getState().conditions).toEqual({});
    const activity = useAlertStore.getState().activity;
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ id: 'resolved:late', severity: 'info', message: 'condition cleared' });
  });

  it('does not log a resolution for an info advisory dropping out', () => {
    useAlertStore.getState().syncAdvisories([adv({ id: 'note', severity: 'info' })]);
    useAlertStore.getState().syncAdvisories([]);
    expect(useAlertStore.getState().activity).toHaveLength(0);
  });
});

describe('alertStore.logActivity', () => {
  beforeEach(() => useAlertStore.getState().reset());

  it('prepends newest and ring-buffers to 100', () => {
    for (let i = 0; i < 105; i++) {
      useAlertStore.getState().logActivity({
        id: `activity:${i}`,
        severity: 'info',
        ts: '2026-07-10T09:00:00Z',
        title: `Match ${i}`,
        source: 'activity',
      });
    }
    const activity = useAlertStore.getState().activity;
    expect(activity).toHaveLength(100);
    expect(activity[0].id).toBe('activity:104'); // newest first
  });
});
