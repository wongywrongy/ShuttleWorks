/**
 * Geometry for the Hub's workspace-inspector dock, and the reason it is these
 * numbers and not others.
 *
 * Defect D11: the inspector used to be a fixed 344px `<aside>` sibling of the
 * list, so opening it narrowed the list — and `WorkspaceRow` declares
 * `@container/table` on the ROW, which makes the row itself the box the
 * Modules column queries. Modules is priority 3 (`@4xl`, 896px), so selecting a
 * row pushed the container under the threshold and the column vanished. Nobody
 * asked for that, and nothing said it had happened.
 *
 * `DetailDock` docks only while `containerWidth - width >= minContentWidth`.
 * Setting that floor to the width the row needs means selecting a row either
 * keeps all four columns (docked) or leaves the list at full width under a
 * dismissible overlay (narrow fallback). Neither branch deletes a column.
 *
 * Held to the priority class it is derived from by `hubDockWidth.test.ts`.
 */

/** Pane width when docked, and the overlay-fallback width. */
export const HUB_DOCK_WIDTH = 344;

/** `@4xl` (896px, the Modules column's tier) + WorkspaceRow's `px-4` pair. */
export const HUB_DOCK_MIN_CONTENT_WIDTH = 896 + 32;
