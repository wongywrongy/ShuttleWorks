import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { Select } from '@scheduler/design-system/components';
import { SectionCard } from '../../components/control-plane';
import { apiClient } from '../../api/client';
import type { InviteRole, InviteSummaryDTO } from '../../api/dto';
import { inviteStatus, type InviteStatus } from './inviteStatus';

const ROLE_OPTIONS = [
  { value: 'operator', label: 'Operator' },
  { value: 'viewer', label: 'Viewer' },
] as const;

const STATUS_LABEL: Record<InviteStatus, string> = {
  active: 'Active',
  revoked: 'Revoked',
  expired: 'Expired',
  inactive: 'Inactive',
};

function fmtExpiry(iso: string | null): string {
  if (!iso) return 'No expiry';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `Expires ${d.toLocaleDateString()}`;
}

/** Writes `text` to the clipboard. Returns false (rather than throwing) when the
 *  Clipboard API is unavailable — non-secure context (no HTTPS/localhost) or a
 *  denied permission — so callers can no-op gracefully. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

/** Sharing: the public display link (its own primitive) + invite-link
 *  management (create with role, list with status/expiry, copy, revoke). */
export function SharingTab({ tid }: { tid: string }) {
  const origin = window.location.origin;

  // Public display link is a CAPABILITY link (SP-CLOUD-2): minted server-side,
  // owner-gated, revocable by rotation. Non-owners get a 404 from the mint
  // endpoint — hide the section rather than showing a link we can't produce.
  const [displayToken, setDisplayToken] = useState<string | null>(null);
  const [displayTokenDenied, setDisplayTokenDenied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const displayLink = displayToken ? `${origin}/display?token=${displayToken}` : null;

  const [invites, setInvites] = useState<InviteSummaryDTO[] | null>(null);
  const [role, setRole] = useState<InviteRole>('operator');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getDisplayToken(tid)
      .then((t) => {
        if (cancelled) return;
        setDisplayToken(t.token);
        setDisplayTokenDenied(false);
      })
      .catch(() => {
        if (!cancelled) setDisplayTokenDenied(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tid]);

  // A no-cancel reload used after a create/revoke mutation (user-initiated).
  const refresh = useCallback(() => {
    apiClient
      .listInvites(tid)
      .then(setInvites)
      .catch(() => setInvites([]));
  }, [tid]);

  // Initial / tid-change load, guarded so a late response can't overwrite newer state.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .listInvites(tid)
      .then((r) => !cancelled && setInvites(r))
      .catch(() => !cancelled && setInvites([]));
    return () => {
      cancelled = true;
    };
  }, [tid]);

  // Clear the "Copied" flash timer on unmount.
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  async function copy(text: string, key: string) {
    if (await copyToClipboard(text)) {
      setCopied(key);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 1500);
    }
  }

  async function rotate() {
    setRotating(true);
    try {
      const t = await apiClient.rotateDisplayToken(tid);
      setDisplayToken(t.token);
    } finally {
      setRotating(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const trimmed = email.trim();
      await apiClient.createInvite(tid, trimmed ? { role, email: trimmed } : { role });
      setEmail('');
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    await apiClient.revokeInvite(token);
    refresh();
  }

  const now = Date.now();

  return (
    <div className="max-w-2xl p-6">
      <div className="pb-4">
        <h2 className="text-lg font-semibold text-foreground">Links &amp; access</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The public display link is view-only; collaborator invites let people sign in
          and operate this workspace. They are separate — share each deliberately.
        </p>
      </div>

      {/* Public display link — read-only, separate from collaborator invites.
          Hidden entirely when the caller isn't the owner (mint 404s). */}
      {!displayTokenDenied && (
        <SectionCard eyebrow="PUBLIC DISPLAY LINK" testId="sharing-public">
          <p className="mb-2 text-xs text-muted-foreground">
            Anyone with this link can view the read-only venue display — no sign-in required.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={displayLink ?? 'Loading…'}
              aria-label="Public display link"
              className="min-w-0 flex-1 rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-xs text-foreground"
            />
            {/* xs (28px) matches the row's input + the app's control scale —
                the default 40px Button towered over its neighbors. */}
            <Button
              size="xs"
              variant="ghost"
              disabled={!displayLink}
              onClick={() => displayLink && copy(displayLink, 'display')}
            >
              {copied === 'display' ? 'Copied' : 'Copy'}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={!displayLink}
              onClick={() => displayLink && window.open(displayLink, '_blank')}
            >
              Open fullscreen
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={!displayLink || rotating}
              onClick={() => void rotate()}
            >
              {rotating ? 'Rotating…' : 'Rotate link'}
            </Button>
          </div>
          <p className="mt-2 text-2xs text-muted-foreground">
            Rotating the link revokes the old one immediately — re-share the new link with
            any venue displays.
          </p>
        </SectionCard>
      )}

      {/* Collaborator invite links. */}
      <SectionCard eyebrow="COLLABORATOR INVITES" testId="sharing-invites">
        <p className="mb-3 text-xs text-muted-foreground">
          Invited people can sign in and operate this workspace. Revoke a link any time.
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={role}
            onValueChange={(v) => setRole(v as InviteRole)}
            options={ROLE_OPTIONS}
            ariaLabel="Invite role"
            size="sm"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            aria-label="Invite email (optional)"
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <Button size="xs" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create invite'}
          </Button>
        </div>

        <ul className="divide-y divide-border rounded border border-border">
          {invites === null ? (
            <li className="p-3 text-sm text-muted-foreground">Loading…</li>
          ) : invites.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">No invite links yet.</li>
          ) : (
            invites.map((inv) => {
              const status = inviteStatus(inv, now);
              const link = `${origin}/invite/${inv.token}`;
              return (
                <li
                  key={inv.token}
                  data-testid={`invite-${inv.token}`}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-sm border border-border px-1.5 py-0.5 text-2xs font-medium capitalize text-muted-foreground">
                        {inv.role}
                      </span>
                      <span
                        className={[
                          'text-xs font-medium',
                          status === 'active' ? 'text-accent' : 'text-muted-foreground',
                        ].join(' ')}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-2xs text-muted-foreground">
                      {inv.email ? <>{inv.email} · </> : null}
                      {fmtExpiry(inv.expiresAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="xs" variant="ghost" onClick={() => copy(link, inv.token)}>
                      {copied === inv.token ? 'Copied' : 'Copy'}
                    </Button>
                    {status === 'active' && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void revoke(inv.token)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </SectionCard>
    </div>
  );
}
