/**
 * Unit tests for buildWorkspaceNav — Operations section labels (Task 17).
 *
 * Verifies that both the meet-only arm (segment: 'schedule'/'live') and the
 * bracket-only arm (segment: 'bracket-schedule'/'bracket-live') render with
 * the renamed labels 'Plan' and 'Live day' — not the old 'Courts'/'Live'
 * (or the since-retired 'Run', SP-CONSOLE-REFINE G1).
 *
 * The segment ids are intentionally unchanged; only the labels are renamed.
 */
import { describe, it, expect } from 'vitest';
import { buildWorkspaceNav } from '../workspaceNav';

describe('buildWorkspaceNav — Operations nav labels (Task 17)', () => {
  it('meet-only arm: Operations items are Plan + Live day with correct segments', () => {
    const nav = buildWorkspaceNav(null, new Set(['meet']));
    const ops = nav.sections.find((s) => s.id === 'operations');
    expect(ops).toBeDefined();
    expect(ops?.items).toEqual([
      { segment: 'schedule', label: 'Plan' },
      { segment: 'live', label: 'Live day' },
    ]);
  });

  it('bracket-only arm: Operations items are Plan + Live day with correct segments', () => {
    const nav = buildWorkspaceNav('bracket', new Set(['bracket']));
    const ops = nav.sections.find((s) => s.id === 'operations');
    expect(ops).toBeDefined();
    expect(ops?.items).toEqual([
      { segment: 'bracket-schedule', label: 'Plan' },
      { segment: 'bracket-live', label: 'Live day' },
    ]);
  });

  it('both-engines arm (meet kind): falls through to the meet arm labels', () => {
    const nav = buildWorkspaceNav('meet', new Set(['meet', 'bracket']));
    const ops = nav.sections.find((s) => s.id === 'operations');
    expect(ops).toBeDefined();
    expect(ops?.items).toEqual([
      { segment: 'schedule', label: 'Plan' },
      { segment: 'live', label: 'Live day' },
    ]);
  });

  it('labels are NOT Courts, Live, or Run (regression guard)', () => {
    const meetNav = buildWorkspaceNav(null, new Set(['meet']));
    const bracketNav = buildWorkspaceNav('bracket', new Set(['bracket']));
    const allLabels = [
      ...(meetNav.sections.find((s) => s.id === 'operations')?.items ?? []),
      ...(bracketNav.sections.find((s) => s.id === 'operations')?.items ?? []),
    ].map((i) => i.label);
    expect(allLabels).not.toContain('Courts');
    expect(allLabels).not.toContain('Live');
    expect(allLabels).not.toContain('Run');
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

  it('models it as intake — the anatomy is intake → engine → emit', () => {
    // Reusing `shared` would have been a one-word change and would have lied:
    // Operations is shared BETWEEN the engines, Entries feeds them. (The role
    // is model-only since SP-CONSOLE-REFINE G2 — the sidebar badge is gone;
    // the taxonomy reads out in the Modules catalog descriptions instead.)
    const nav = buildWorkspaceNav('meet', new Set(['meet', 'entries']));
    const entries = nav.sections.find((s) => s.id === 'entries')!;
    expect(entries.role).toBe('intake');
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
