/**
 * Venue board configuration — the settings half of Display · Board.
 *
 * The page answers, in this order (operator-visual-fixes P4): **is the board
 * on**, **what is its link** (owned by `SharingTab`, composed alongside this
 * component), **which courts does it show**, **does it show Next**, then its
 * appearance, then a fullscreen preview of the real published board.
 *
 * Two things it deliberately does NOT do:
 *
 *  - **No "Board sources" catalog.** It used to list Meet and Bracket with a
 *    status word and a link to Modules — a second, read-only rendering of
 *    module state that answered nothing an operator could act on here. Board
 *    availability is module state, so this page drives the ONE existing
 *    module command (`useWorkspaceModules`) for the Display module itself
 *    and shows nothing else about the other modules.
 *  - **No embedded preview frame.** A useful preview is full board size,
 *    which this settings column cannot offer; "Preview fullscreen" opens the
 *    same published capability URL in its own window, and the configuration
 *    page underneath is never unmounted.
 *
 * Built from the shared settings grammar (`Section` + `Row`), the same as
 * Meet and Bracket Configuration.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import type { WorkspaceModule } from '../../platform/product-shell/types';
import { useWorkspaceModules } from '../../platform/domain/useWorkspaceModules';
import { useAction } from '../../hooks/useAction';
import { apiClient } from '../../api/client';
import { Row, Seg, Section } from '../../platform/engine-config/SettingsControls';
import { DisplayLayoutEditor } from './displayConfig/DisplayLayoutEditor';
import { BoardAppearance } from './displayConfig/BoardAppearance';

const ON_OFF = [
  { value: 'on' as const, label: 'On' },
  { value: 'off' as const, label: 'Off' },
];

export function DisplayConfig({
  tid,
  modules,
  linkSlot,
}: {
  tid: string;
  modules: WorkspaceModule[];
  /** The board's LINK controls (copy / open / replace), composed in by the
   *  page so this component takes no dependency on the settings module that
   *  owns them. Rendered directly under the on/off switch, which is the
   *  order the page's questions come in. */
  linkSlot?: ReactNode;
}) {
  const meetEnabled = modules.some((m) => m.id === 'meet' && m.status === 'enabled');
  const engineOn = modules.some(
    (m) => (m.id === 'meet' || m.id === 'bracket') && m.status === 'enabled',
  );
  const displayModule = modules.find((m) => m.id === 'display');
  const boardOn = displayModule?.status === 'enabled';

  // The ONE module command — the same seam Administration · Modules uses, so
  // this switch cannot become a second owner of module state. A server-side
  // refusal (Display needs an engine, and the other backend guards) surfaces
  // as a toast through `useAction`.
  const { enable, disable } = useWorkspaceModules(tid);
  const toggleBoard = useAction(
    useCallback(
      async (next: boolean) => (next ? enable('display') : disable('display')),
      [enable, disable],
    ),
  );

  // The public link is a CAPABILITY link, minted server-side and revocable by
  // rotation (SP-CLOUD-2) — the same `/tournaments/{id}/display-token` seam
  // `SharingTab` mints from, so the two surfaces can't drift on the URL shape.
  // Owner-only: a non-owner's mint 403s, which reads as `mintDenied` below —
  // distinguished from a genuine load failure so the reason line never tells
  // a non-owner to "retry" an action they cannot take.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [mintDenied, setMintDenied] = useState(false);
  const [mintErrored, setMintErrored] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setMintDenied(false);
    setMintErrored(false);
    apiClient
      .getDisplayToken(tid)
      .then((t) => {
        if (cancelled) return;
        setPublicUrl(`${origin}${t.url}`);
      })
      .catch((error: { status?: number; response?: { status?: number } }) => {
        if (cancelled) return;
        const status = error?.response?.status ?? error?.status;
        if (status === 401 || status === 403 || status === 404) setMintDenied(true);
        else setMintErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tid, origin, attempt]);

  return (
    <div className="space-y-2">
      <div className="pb-2">
        <h2 className="type-display text-2xl text-foreground">Venue board</h2>
      </div>

      {/* No second width bound here: the `form` PageBody above already sets
          the column, and a narrower inner cap left the controls' right edge
          10rem short of the heading and the save row they belong to. */}
      <div className="space-y-2">
        <Section title="Board">
          <Row
            label="Show this board"
            last
            control={
              <Seg
                options={ON_OFF}
                value={boardOn ? 'on' : 'off'}
                onChange={(next) => {
                  const wanted = next === 'on';
                  if (wanted !== boardOn) void toggleBoard.run(wanted);
                }}
                ariaLabel="Show this board"
                disabled={toggleBoard.pending || (!boardOn && !engineOn)}
              />
            }
          />
          {!boardOn && !engineOn ? (
            <p className="pb-3 text-xs text-muted-foreground">Needs Meet or Bracket on.</p>
          ) : null}
        </Section>

        {linkSlot}

        {/* Court order and visibility + the meet grid layout. These read the
            meet config, which the bracket board does not consume — the
            controls that DO apply to every board (Show next, Show scores,
            branding) live in `BoardAppearance` below and are always shown. */}
        {meetEnabled ? <DisplayLayoutEditor tid={tid} /> : null}

        <BoardAppearance tid={tid} />

        {/* One explicit action, not an embedded frame: opens the real
            published board (the same minted token every other surface
            reads) in its own window. */}
        <Section title="Preview">
          {publicUrl ? (
            <Row
              readOnly
              last
              label="See the board as the venue will"
              control={
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded border border-border-control bg-card px-3 text-sm text-foreground"
                >
                  <ArrowSquareOut aria-hidden className="h-4 w-4" />
                  Preview fullscreen
                </a>
              }
            />
          ) : mintDenied ? (
            <p className="py-3 text-sm text-muted-foreground" data-testid="display-link-unavailable">
              No venue board link yet. Only a workspace owner can create one.
            </p>
          ) : mintErrored ? (
            <div className="flex items-center justify-between gap-3 py-3" data-testid="display-link-error">
              <p className="text-sm text-muted-foreground">The venue board link could not be loaded.</p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="inline-flex h-7 items-center rounded border border-border-control bg-card px-3 text-sm text-foreground"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">Preparing the board link…</p>
          )}
        </Section>
      </div>
    </div>
  );
}
