import { createContext } from 'react';

/**
 * The mode a `DetailDock` resolved to, published to the pane inside it.
 *
 * The consumer picks `variant="docked"` statically; the dock picks the mode at
 * runtime from the measured container, and below its width threshold it stops
 * docking and starts COVERING the table. Before this seam existed the two
 * disagreed silently: the covering pane still announced `role="complementary"`
 * and still refused to dismiss on an outside click, so the only way out was a
 * close button the operator had no reason to look for. `DetailPanel` reads
 * this and behaves like the dialog it has become.
 *
 * Its own file so both `DetailDock` (provider) and `DetailPanel` (consumer)
 * can reach it without one importing the other.
 *
 * Default `docked`: a pane with no dock above it owns its own variant.
 */
export const DockModeContext = createContext<'docked' | 'overlay'>('docked');
