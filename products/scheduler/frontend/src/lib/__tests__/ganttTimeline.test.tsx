import { describe, it, expect } from 'vitest';
import { GANTT_GEOMETRY, placementBox } from '@scheduler/design-system/components';
import type { Placement } from '@scheduler/design-system/components';

describe('GANTT_GEOMETRY', () => {
  it('standard tier is 80×40 with a 56px label column', () => {
    expect(GANTT_GEOMETRY.standard).toEqual({ slot: 80, row: 40, label: 56 });
  });
  it('compact tier is 48×32 with a 56px label column', () => {
    expect(GANTT_GEOMETRY.compact).toEqual({ slot: 48, row: 32, label: 56 });
  });
});

describe('placementBox', () => {
  const p = (over: Partial<Placement>): Placement => ({
    courtIndex: 0,
    startSlot: 0,
    span: 1,
    key: 'k',
    ...over,
  });

  it('positions a single-lane block at slot×width, court×row', () => {
    const box = placementBox(
      p({ courtIndex: 2, startSlot: 5, span: 3 }),
      0,
      GANTT_GEOMETRY.standard,
    );
    expect(box).toEqual({ left: 400, top: 80, width: 240, height: 40 });
  });

  it('offsets left by the visible window minSlot', () => {
    const box = placementBox(
      p({ startSlot: 5, span: 2 }),
      4,
      GANTT_GEOMETRY.standard,
    );
    expect(box.left).toBe(80); // (5 - 4) * 80
    expect(box.width).toBe(160);
  });

  it('halves width and offsets a 2-lane (lane 1) block', () => {
    const box = placementBox(
      p({ startSlot: 0, span: 2, laneIndex: 1, laneCount: 2 }),
      0,
      GANTT_GEOMETRY.standard,
    );
    expect(box.width).toBe(80); // (2*80)/2
    expect(box.left).toBe(80); // baseLeft 0 + lane 1 * 80
  });

  it('keeps full slot width for a 1-lane block', () => {
    const box = placementBox(
      p({ startSlot: 0, span: 2, laneIndex: 0, laneCount: 1 }),
      0,
      GANTT_GEOMETRY.compact,
    );
    expect(box.width).toBe(96); // 2 * 48
    expect(box.left).toBe(0);
  });

  it('clamps span to >= 1 so a zero span still renders', () => {
    const box = placementBox(
      p({ span: 0 }),
      0,
      GANTT_GEOMETRY.standard,
    );
    expect(box.width).toBe(80);
  });

  it('clamps laneIndex into [0, laneCount - 1]', () => {
    const box = placementBox(
      p({ span: 1, laneIndex: 9, laneCount: 2 }),
      0,
      GANTT_GEOMETRY.standard,
    );
    expect(box.left).toBe(40); // clamped to lane 1: 0 + 1 * 40
  });
});

// ─── Rendering tests ────────────────────────────────────────────────
//
// Regression test for the bracket court-grid duplicate-render bug.
// The math in placementBox was already correct (top = courtIndex *
// row, absolute-from-grid-origin) — but the consumer was nesting
// each PositionedBlock inside a per-court row container that was
// already offset by the same amount, doubling the y for courts 1+.
// Audit finding: docs/audits/2026-05-15_user-audit_meet-vs-bracket.md §2.5
import { render, screen } from '@testing-library/react';
import { GanttTimeline, type Placement as PlacementType } from '@scheduler/design-system/components';

function makePlacement(courtIndex: number): PlacementType {
  return {
    courtIndex,
    startSlot: 0,
    span: 1,
    key: `block-c${courtIndex}`,
  };
}

describe('<GanttTimeline /> block positioning', () => {
  it('renders one block per court inside a single absolute-positioned overlay parent', () => {
    const placements: PlacementType[] = [0, 1, 2, 3].map(makePlacement);
    render(
      <GanttTimeline
        courts={[1, 2, 3, 4]}
        minSlot={0}
        slotCount={4}
        density="standard"
        placements={placements}
        renderBlock={(p) => <div data-testid={`b-${p.courtIndex}`}>{p.key}</div>}
      />,
    );

    // Structural guard: all four block wrappers share the same parent.
    // Before the fix each block lived inside its court-row container,
    // so the four wrappers had four different parents.
    const wrappers = [0, 1, 2, 3].map(
      (i) => screen.getByTestId(`b-${i}`).parentElement!,
    );
    const parents = new Set(wrappers.map((w) => w.parentElement));
    expect(parents.size).toBe(1);

    // Each wrapper carries its absolute top (math is unchanged).
    // Standard tier: row = 40px. Court i lives at top = i * 40.
    for (let i = 0; i < 4; i++) {
      expect(wrappers[i].style.position).toBe('absolute');
      expect(wrappers[i].style.top).toBe(`${i * 40}px`);
    }
  });

  it('renders all four placements (regression guard against vanishing blocks)', () => {
    const placements: PlacementType[] = [0, 1, 2, 3].map(makePlacement);
    render(
      <GanttTimeline
        courts={[1, 2, 3, 4]}
        minSlot={0}
        slotCount={4}
        density="standard"
        placements={placements}
        renderBlock={(p) => <div data-testid={`b-${p.courtIndex}`}>{p.key}</div>}
      />,
    );
    expect(screen.getAllByTestId(/^b-/)).toHaveLength(4);
  });
});
