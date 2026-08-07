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
import { buildWorkspaceNav, roleBadge } from '../workspaceNav';

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

/**
 * The Entries section (SP-E1-1). Module presence drives nav — the plan says
 * the module system "should give this for free", and these tests are what
 * make that claim checkable rather than assumed.
 */
describe('buildWorkspaceNav — the Entries section', () => {
  it('renders an Entries section when the module is enabled', () => {
    const nav = buildWorkspaceNav('meet', new Set(['meet', 'entries']));
    const entries = nav.sections.find((s) => s.id === 'entries');
    expect(entries).toBeDefined();
    expect(entries?.label).toBe('Entries');
    expect(entries?.items).toEqual([{ segment: 'entries', label: 'Desk' }]);
  });

  it('omits it entirely when the module is not enabled', () => {
    // NEGATIVE CONTROL, and the one that matters most: in local mode the
    // backend never seeds the row (ruling D2), so a laptop-only director must
    // see no Entries anywhere. If the section rendered unconditionally the
    // test above would pass just as well.
    const nav = buildWorkspaceNav('meet', new Set(['meet', 'bracket', 'display']));
    expect(nav.sections.find((s) => s.id === 'entries')).toBeUndefined();
    expect(nav.sections.flatMap((s) => s.items).map((i) => i.segment)).not.toContain(
      'entries',
    );
  });

  it('badges it Intake — the anatomy is intake → engine → emit', () => {
    // Reusing `shared` would have been a one-word change and would have lied:
    // Operations is shared BETWEEN the engines, Entries feeds them.
    const nav = buildWorkspaceNav('meet', new Set(['meet', 'entries']));
    const entries = nav.sections.find((s) => s.id === 'entries')!;
    expect(entries.role).toBe('intake');
    expect(roleBadge(entries.role)).toBe('Intake');
    expect(roleBadge('shared')).toBe('Shared');
  });

  it('places intake first, ahead of the engines it feeds', () => {
    const nav = buildWorkspaceNav('meet', new Set(['meet', 'display', 'entries']));
    expect(nav.sections.map((s) => s.id)).toEqual([
      'entries',
      'meet',
      'operations',
      'display',
    ]);
  });
});
