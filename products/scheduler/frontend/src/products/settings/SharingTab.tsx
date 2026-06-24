import { useCallback, useEffect, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { InviteRole, InviteSummaryDTO } from '../../api/dto';
import { inviteStatus, type InviteStatus } from './inviteStatus';

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
  const displayLink = `${origin}/display?id=${tid}`;

  const [invites, setInvites] = useState<InviteSummaryDTO[] | null>(null);
  const [role, setRole] = useState<InviteRole>('operator');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(() => {
    apiClient
      .listInvites(tid)
      .then(setInvites)
      .catch(() => setInvites([]));
  }, [tid]);

  useEffect(() => refresh(), [refresh]);

  async function copy(text: string, key: string) {
    if (await copyToClipboard(text)) {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  async function create() {
    setBusy(true);
    try {
      await apiClient.createInvite(tid, { role });
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
    <div className="max-w-2xl space-y-6 p-6">
      <div>
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          SHARING
        </div>
        <h2 className="mt-1 text-base font-semibold text-foreground">Links &amp; access</h2>
      </div>

      {/* Public display link — its own primitive, separate from invites. */}
      <section className="space-y-2">
        <div className="text-sm font-medium text-foreground">Public display link</div>
        <p className="text-xs text-muted-foreground">
          Anyone with this link can view the read-only venue display.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={displayLink}
            aria-label="Public display link"
            className="min-w-0 flex-1 rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-xs text-foreground"
          />
          <Button variant="ghost" onClick={() => copy(displayLink, 'display')}>
            {copied === 'display' ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="ghost" onClick={() => window.open(displayLink, '_blank')}>
            Open fullscreen
          </Button>
        </div>
      </section>

      {/* Collaborator invite links. */}
      <section className="space-y-3">
        <div className="text-sm font-medium text-foreground">Invite links</div>
        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as InviteRole)}
            aria-label="Invite role"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button onClick={create} disabled={busy}>
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
                          status === 'active' ? 'text-accent' : 'text-muted-foreground/70',
                        ].join(' ')}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-2xs text-muted-foreground">
                      {fmtExpiry(inv.expiresAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" onClick={() => copy(link, inv.token)}>
                      {copied === inv.token ? 'Copied' : 'Copy'}
                    </Button>
                    {status === 'active' && (
                      <Button
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
      </section>
    </div>
  );
}
