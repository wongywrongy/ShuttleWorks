/**
 * Venue board configuration — the workspace's published board sources, an
 * explicit fullscreen preview of the real published board, and (when Meet is
 * enabled) the board's layout controls.
 *
 * Built from the shared settings grammar (`Section` + `Row` + `FieldRow`), the
 * same as Meet and Bracket Configuration. It used to run its own third
 * grammar — `<h3 className="text-sm">` headings at the exact weight of the row
 * labels beneath them, rows inside rounded bordered cards, and an explanatory
 * paragraph under every heading — which is why this module looked untouched by
 * the config unification.
 *
 * Package 16 (v3 consolidated plan, superseding V3-OC22.1): the narrow inline
 * iframe preview that used to sit here is gone. Widening it only ever fixed
 * the symptom — a genuinely useful preview has to be full board size, which
 * this settings column cannot offer next to the layout controls. "Preview
 * fullscreen" opens the SAME published board (the minted capability URL) in
 * a new window instead; the configuration page underneath is untouched, so
 * returning to it is not a separate code path to get right. Link/rotate
 * management for that same token lives in `SharingTab` (scope="links"),
 * composed alongside this component on the canonical `/publish/displays`
 * page — this component no longer duplicates that surface's own heading or
 * link controls (V3-OC22.2's "one board name" ruling).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { MODULE_LABELS, type WorkspaceModule } from '../../platform/product-shell/types';
import { apiClient } from '../../api/client';
import { Row, Section } from '../../platform/engine-config/SettingsControls';
import { DisplayLayoutEditor } from './displayConfig/DisplayLayoutEditor';

const BOARD_SOURCES = [
  { id: 'meet', label: MODULE_LABELS.meet },
  { id: 'bracket', label: MODULE_LABELS.bracket },
];

export function DisplayConfig({ tid, modules }: { tid: string; modules: WorkspaceModule[] }) {
  const moduleById = (id: string) => modules.find((m) => m.id === id);
  const sourceState = (id: string): 'Enabled' | 'Available' | 'Off' => {
    const source = moduleById(id);
    if (source?.status === 'enabled') return 'Enabled';
    if (source?.status === 'disabled') return 'Off';
    return 'Available';
  };
  const meetEnabled = sourceState('meet') === 'Enabled';

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

      <div className="max-w-2xl space-y-2">
        {/* Board availability follows module state. A switch here would create
            a second owner for module enablement, so these are deliberately
            plain readouts with a link to the owning settings surface. */}
        <Section title="Board sources">
          {BOARD_SOURCES.map((source, index) => {
            const state = sourceState(source.id);
            return (
              <Row
                key={source.id}
                readOnly
                label={source.label}
                last={index === BOARD_SOURCES.length - 1}
                control={
                  <span className="inline-flex items-baseline gap-2">
                    <span className={state === 'Enabled' ? 'text-foreground' : 'text-muted-foreground'}>
                      {state}
                    </span>
                    {state !== 'Enabled' ? (
                      <Link
                        to={`/tournaments/${tid}/administration/modules`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Modules →
                      </Link>
                    ) : null}
                  </span>
                }
              />
            );
          })}
        </Section>

        {/* One explicit action, not an embedded frame: opens the real
            published board (the same minted token every other surface
            reads) in its own window. The configuration page here never
            unmounts, so there is nothing to "restore" on return. */}
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

        {/* The tv* fields only drive MeetDisplayPage; bracket boards do not
            consume them. Keep those controls scoped to Meet while the
            fullscreen preview above remains useful for every enabled board
            source. */}
        {meetEnabled ? <DisplayLayoutEditor tid={tid} /> : null}
      </div>
    </div>
  );
}
