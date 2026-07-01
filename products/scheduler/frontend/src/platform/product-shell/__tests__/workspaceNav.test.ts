/**
 * Unit tests for buildWorkspaceNav — Operations section labels (Task 17).
 *
 * Verifies that both the meet-only arm (segment: 'schedule'/'live') and the
 * bracket-only arm (segment: 'bracket-schedule'/'bracket-live') render with
 * the renamed labels 'Plan' and 'Run' — not the old 'Courts'/'Live'.
 *
 * The segment ids are intentionally unchanged; only the labels are renamed.
 */
import { describe, it, expect } from 'vitest';
import { buildWorkspaceNav } from '../workspaceNav';

describe('buildWorkspaceNav — Operations nav labels (Task 17)', () => {
  it('meet-only arm: Operations items are Plan + Run with correct segments', () => {
    const nav = buildWorkspaceNav(null, new Set(['meet']));
    const ops = nav.sections.find((s) => s.id === 'operations');
    expect(ops).toBeDefined();
    expect(ops?.items).toEqual([
      { segment: 'schedule', label: 'Plan' },
      { segment: 'live', label: 'Run' },
    ]);
  });

  it('bracket-only arm: Operations items are Plan + Run with correct segments', () => {
    const nav = buildWorkspaceNav('bracket', new Set(['bracket']));
    const ops = nav.sections.find((s) => s.id === 'operations');
    expect(ops).toBeDefined();
    expect(ops?.items).toEqual([
      { segment: 'bracket-schedule', label: 'Plan' },
      { segment: 'bracket-live', label: 'Run' },
    ]);
  });

  it('both-engines arm (meet kind): falls through to the meet arm labels', () => {
    const nav = buildWorkspaceNav('meet', new Set(['meet', 'bracket']));
    const ops = nav.sections.find((s) => s.id === 'operations');
    expect(ops).toBeDefined();
    expect(ops?.items).toEqual([
      { segment: 'schedule', label: 'Plan' },
      { segment: 'live', label: 'Run' },
    ]);
  });

  it('labels are NOT Courts or Live (regression guard)', () => {
    const meetNav = buildWorkspaceNav(null, new Set(['meet']));
    const bracketNav = buildWorkspaceNav('bracket', new Set(['bracket']));
    const allLabels = [
      ...(meetNav.sections.find((s) => s.id === 'operations')?.items ?? []),
      ...(bracketNav.sections.find((s) => s.id === 'operations')?.items ?? []),
    ].map((i) => i.label);
    expect(allLabels).not.toContain('Courts');
    expect(allLabels).not.toContain('Live');
  });
});
