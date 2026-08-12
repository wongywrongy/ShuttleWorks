/**
 * Public Display Page — the kind-router for the standalone `/display` route
 * and the in-shell `tv` surface. Resolves the board kind from the enabled
 * modules (see `useDisplayKind`) and renders the meet display or the bracket
 * display. Defaults to the meet display while the kind is loading, so every
 * existing meet workspace is unchanged.
 *
 * HYBRID workspaces (both operator modules enabled) run TWO engines, and the
 * board shows ONE at a time, selected by `?board=meet|bracket` and switchable
 * from either header. It is deliberately not a merged board: Meet and Bracket
 * match records are non-merged by design (ADR 0006), the two boards read
 * different projections, and the meet board's whole layout vocabulary (court
 * order, hidden courts, presets, standings placement) is meet-only. A merged
 * court plan would need a server-side union projection and a config language
 * that does not exist — and would read as *less* legible across a hall, which
 * is what this surface is for. Meet is primary because it owns the venue's
 * court plan; a bracket-only workspace is unaffected either way.
 */
import { useSearchParams } from 'react-router-dom';
import { useDisplayKind } from './useDisplayKind';
import { MeetDisplayPage } from './MeetDisplayPage';
import { BracketDisplayPage } from './bracketDisplay/BracketDisplayPage';

export function PublicDisplayPage() {
  const kind = useDisplayKind();
  const [searchParams] = useSearchParams();
  const hybrid = kind === 'hybrid';
  const showBracket =
    kind === 'bracket' || (hybrid && searchParams.get('board') === 'bracket');
  if (showBracket) return <BracketDisplayPage hybrid={hybrid} />;
  return <MeetDisplayPage hybrid={hybrid} />;
}
