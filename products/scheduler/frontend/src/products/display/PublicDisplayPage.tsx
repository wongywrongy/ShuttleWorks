/**
 * Public Display Page — the kind-router for the standalone `/display` route
 * and the in-shell `tv` surface. Resolves the workspace kind from `?id=` and
 * renders the meet display or the bracket display. Defaults to the meet
 * display while the kind is loading, so every existing meet workspace is
 * unchanged.
 */
import { useDisplayKind } from './useDisplayKind';
import { MeetDisplayPage } from './MeetDisplayPage';
import { BracketDisplayPage } from './bracketDisplay/BracketDisplayPage';

export function PublicDisplayPage() {
  const kind = useDisplayKind();
  if (kind === 'bracket') return <BracketDisplayPage />;
  return <MeetDisplayPage />;
}
