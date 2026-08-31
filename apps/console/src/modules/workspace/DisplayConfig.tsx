/**
 * Display Configuration — the workspace's published board sources, shareable
 * capability URL, layout settings, and an inline preview of that public projection.
 *
 * Built from the shared settings grammar (`Section` + `Row` + `FieldRow`), the
 * same as Meet and Bracket Configuration. It used to run its own third
 * grammar — `<h3 className="text-sm">` headings at the exact weight of the row
 * labels beneath them, rows inside rounded bordered cards, and an explanatory
 * paragraph under every heading — which is why this module looked untouched by
 * the config unification.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { Button } from '@scheduler/design-system';
import { MODULE_LABELS, type WorkspaceModule } from '../../platform/product-shell/types';
import { apiClient } from '../../api/client';
import { FieldRow, Row, Section } from '../../platform/engine-config/SettingsControls';
import { DisplayLayoutEditor } from './displayConfig/DisplayLayoutEditor';

const BOARD_SOURCES = [
  { id: 'meet', label: MODULE_LABELS.meet },
  { id: 'bracket', label: MODULE_LABELS.bracket },
];

export function DisplayConfig({ tid, modules }: { tid: string; modules: WorkspaceModule[] }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
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
  // Settings → Sharing mints from, and the server owns the URL shape (`url`
  // on the DTO) so the two surfaces can't drift.
  //
  // This tab used to advertise `${origin}/display?id=${tid}` under "Anyone with
  // the link can watch, with no sign-in". That route is viewer-gated: a venue TV
  // signed out of the workspace got a 401, and the board then blamed an expired
  // session for a session that never existed. `null` = no link to hand over —
  // say so rather than print one that fails.
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [mintFailed, setMintFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getDisplayToken(tid)
      .then((t) => {
        if (cancelled) return;
        setPublicUrl(`${origin}${t.url}`);
        setMintFailed(false);
      })
      .catch(() => {
        if (!cancelled) setMintFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tid, origin]);

  const copy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <div className="space-y-2">
      <div className="pb-2">
        <h2 className="type-display text-2xl text-foreground">Display</h2>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)]">
        <div className="min-w-0 space-y-2">
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

          {/* Copy and Open act on this section's single value, so they stay in
              the section action rather than becoming two more setting rows. */}
          <Section
            title="Public link"
            action={
              publicUrl ? (
                <span className="inline-flex items-center gap-2">
                  <Button variant="outline" size="xs" onClick={copy}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-border-control bg-card px-3 text-sm text-foreground transition-colors duration-fast ease-brand hover:bg-muted/40"
                  >
                    <ArrowSquareOut aria-hidden className="h-4 w-4" />
                    Open
                  </a>
                </span>
              ) : null
            }
          >
            {mintFailed ? (
              <p className="py-3 text-sm text-muted-foreground" data-testid="display-link-unavailable">
                No public link yet. Only a workspace owner can create one. Ask an owner to
                share it from{' '}
                <Link
                  to={`/tournaments/${tid}/publish/links`}
                  className="text-accent hover:underline"
                >
                  Links and embeds
                </Link>
                .
              </p>
            ) : (
              <FieldRow
                readOnly
                label="Public display URL"
                value={publicUrl ?? 'Creating link…'}
                hint={
                  <>
                    View-only. Anyone with this link can watch, with no sign-in. Rotate it in{' '}
                    <Link
                      to={`/tournaments/${tid}/publish/links`}
                      className="text-accent hover:underline"
                    >
                      Links and embeds
                    </Link>{' '}
                    to revoke it.
                  </>
                }
                inputClassName="font-mono"
                last
              />
            )}
          </Section>

          {/* The tv* fields only drive MeetDisplayPage; bracket boards do not
              consume them. Keep those controls scoped to Meet while the public
              preview remains useful for every enabled board source. */}
          {meetEnabled ? <DisplayLayoutEditor tid={tid} /> : null}
        </div>

        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <Section title="Preview">
            <div
              className="min-h-64 overflow-hidden rounded-sm border border-border bg-card"
              data-testid="display-preview-frame"
              aria-label="Published venue board preview"
            >
              {publicUrl ? (
                <iframe
                  title="Published venue board preview"
                  src={publicUrl}
                  className="h-[30rem] w-full border-0"
                  data-testid="display-preview-iframe"
                  allowFullScreen
                />
              ) : (
                <div className="flex min-h-64 items-center justify-center px-4 text-sm text-muted-foreground">
                  Preview unavailable until a public display link is ready.
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
