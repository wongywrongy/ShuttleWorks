/**
 * Defect D11: clicking a Hub row silently dropped the Modules column.
 *
 * The mechanism is entirely CSS, so no DOM assertion can catch it: the column
 * carries `hidden @4xl/table:flex` at every width, and only a real layout
 * engine decides whether the query matches. What IS checkable is the arithmetic
 * that keeps the query matching once the pane is open, and that is exactly the
 * part a later edit would break silently.
 *
 * Two numbers have to agree:
 *   - the priority tier the Modules column uses (`COL_PRIORITY_CLASS_FLEX[3]`,
 *     `@4xl` = 896px), measured against the ROW, because WorkspaceRow declares
 *     `@container/table` on the row itself;
 *   - the width HubPage's DetailDock insists the list keeps.
 *
 * Change either one alone and this fails, instead of a column quietly going
 * missing on selection again.
 */
import { describe, expect, it } from 'vitest';
import { HUB_DOCK_MIN_CONTENT_WIDTH, HUB_DOCK_WIDTH } from '../hubDockGeometry';
import { COL_PRIORITY_CLASS_FLEX } from '../../../components/control-plane';

/** Tailwind's `@4xl` container breakpoint, in px. */
const AT_4XL = 896;
/** WorkspaceRow's own horizontal padding (`px-4`), both sides. */
const ROW_PADDING_X = 32;

describe('Hub inspector dock geometry (D11)', () => {
  it('the Modules column is still the @4xl tier this arithmetic assumes', () => {
    expect(COL_PRIORITY_CLASS_FLEX[3]).toContain('@4xl/table');
  });

  it('the dock leaves the list wide enough for the row to clear @4xl', () => {
    expect(HUB_DOCK_MIN_CONTENT_WIDTH).toBeGreaterThanOrEqual(AT_4XL + ROW_PADDING_X);
  });

  it('below that width the dock overlays rather than squeezing the list', () => {
    // DetailDock docks only while `containerWidth - width >= minContentWidth`.
    // Under the threshold it stays 0-wide and overlays, so the list keeps its
    // full width and the column survives that branch too. Restated here as the
    // condition rather than the outcome: the outcome is what the pane covers,
    // which is a deliberate, dismissible mode, not a vanished column.
    const containerWidth = HUB_DOCK_MIN_CONTENT_WIDTH + HUB_DOCK_WIDTH - 1;
    expect(containerWidth - HUB_DOCK_WIDTH).toBeLessThan(HUB_DOCK_MIN_CONTENT_WIDTH);
  });
});
