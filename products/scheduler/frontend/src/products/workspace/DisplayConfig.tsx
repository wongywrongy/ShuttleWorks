/**
 * Display Configuration — the workspace's public-display settings: which engines
 * feed the display (follows the enabled modules) and the shareable public URL.
 * The live preview itself is the Display · Preview surface.
 *
 * Built from the shared settings grammar (`Section` + `Row` + `FieldRow`), the
 * same as Meet and Bracket Configuration. It used to run its own third
 * grammar — `<h3 className="text-sm">` headings at the exact weight of the row
 * labels beneath them, rows inside rounded bordered cards, and an explanatory
 * paragraph under every heading — which is why this module looked untouched by
 * the config unification.
 */
import { useEffect, useState } from 'react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { Button } from '@scheduler/design-system';
import type { WorkspaceModule } from '../../platform/product-shell/types';
import { apiClient } from '../../api/client';
import { useTournamentStore } from '../../store/tournamentStore';
import { FieldRow, Row, Section } from '../../platform/settings/SettingsControls';
import { DisplayLayoutEditor } from './displayConfig/DisplayLayoutEditor';
import { DisplayPreview } from './displayConfig/DisplayPreview';

const FEEDS = [
  { id: 'meet', label: 'Meet' },
  { id: 'bracket', label: 'Bracket' },
];

export function DisplayConfig({ tid, modules }: { tid: string; modules: WorkspaceModule[] }) {
  const [copied, setCopied] = useState(false);
  const config = useTournamentStore((s) => s.config);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const isOn = (id: string) => modules.some((m) => m.id === id && m.status === 'enabled');

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
    <div className="max-w-3xl space-y-2 p-6">
      <div className="pb-2">
        <h2 className="type-display text-2xl text-foreground">Display</h2>
      </div>

      {/* A feed is on because its module is on — this section reports state,
          it does not set it. The rows are labelled with the module name and
          the control slot carries the state, so nothing here needs a
          sentence explaining what "Meet" means. */}
      <Section title="Feeds">
        {FEEDS.map((f, i) => (
          <Row
            key={f.id}
            label={f.label}
            last={i === FEEDS.length - 1}
            control={
              <span
                className={[
                  'rounded-sm px-1.5 py-0.5 text-2xs font-medium',
                  isOn(f.id)
                    ? 'bg-accent/10 text-accent'
                    : 'border border-border text-muted-foreground',
                ].join(' ')}
              >
                {isOn(f.id) ? 'On' : 'Off'}
              </span>
            }
          />
        ))}
      </Section>

      {/* Copy / Open ride the heading rule: they act on the section's one
          value, and a full row each would have read as two more settings. */}
      <Section
        title="Public link"
        action={
          publicUrl ? (
            <span className="inline-flex items-center gap-2">
              {/* xs (28px) both — the anchor can't be a `Button`, so it mirrors
                  the variant="outline" chrome by hand. Two controls side by
                  side at different heights is the kind of near-miss the
                  grammar exists to stop. */}
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
            No public link yet. Only a workspace owner can create one — ask an owner to
            share it from Settings → Sharing.
          </p>
        ) : (
          <FieldRow
            readOnly
            label="Public display URL"
            value={publicUrl ?? 'Creating link…'}
            hint="View-only. Anyone with this link can watch, with no sign-in. Rotate it in Settings → Sharing to revoke it."
            inputClassName="font-mono"
            last
          />
        )}
      </Section>

      {/* tv* fields only drive MeetDisplayPage (the bracket board never
          reads them) — scope the editor + preview to Meet-enabled
          workspaces so a bracket-only workspace isn't shown controls
          that would have no visible effect. The editor brings its own
          Board layout / Court order sections. */}
      {isOn('meet') && (
        <>
          <DisplayLayoutEditor tid={tid} />
          <Section title="Preview">
            <div className="py-3">
              <DisplayPreview config={config} />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
