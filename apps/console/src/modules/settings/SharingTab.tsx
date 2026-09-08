import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { Select, TextField } from '@scheduler/design-system/components';
import { SectionCard, PAGE_BODY_WIDTH } from '../../components/control-plane';
import { useConfirmClick } from '../../hooks/useConfirmClick';
import { apiClient } from '../../api/client';
import type { InviteRole, InviteSummaryDTO } from '../../api/dto';
import { useAuth } from '../../context/AuthContext';
import { inviteStatus, type InviteStatus } from './inviteStatus';
import { PublicationSettings } from '../../components/PublicationSettings';
import { TEXT_MUTED_XS } from '../../lib/utils'

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
 *  management (create with role, list with status/expiry, copy, revoke).
 *  `scope` lets the workflow Publish surface expose the same stateful
 *  controls under their actual jobs without cloning token/invite logic. */
export type SharingScope = 'all' | 'site' | 'links' | 'team';

export function SharingTab({ tid, scope = 'all' }: { tid: string; scope?: SharingScope }) {
  const showDisplay = scope === 'all' || scope === 'links';
  const showSite = scope === 'all' || scope === 'site';
  // Collaborator invitations are an Administration > Team and access job.
  // They remain in the legacy all-in-one surface only for compatibility;
  // canonical Publish > Links contains public/display links, not permissions.
  const showInvites = scope === 'all' || scope === 'team';
  const origin = window.location.origin;

  // V3-OC25.1 / package 18: offer "send by email" only where the server can
  // actually deliver one. Local mode's console backend only logs the
  // message (no operator ever receives it); cloud mode without SMTP
  // configured is the same situation. Link mode always works — it is the
  // fallback in both branches below.
  const { authMode, user } = useAuth();
  const canEmailInvite = authMode === 'cloud' && !!user?.emailConfigured;

  // Public display link is a CAPABILITY link (SP-CLOUD-2): minted server-side,
  // owner-gated, revocable by rotation. Non-owners get a 404 from the mint
  // endpoint — hide the section rather than showing a link we can't produce.
  const [displayToken, setDisplayToken] = useState<string | null>(null);
  const [displayTokenDenied, setDisplayTokenDenied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [displayLoadError, setDisplayLoadError] = useState(false);
  const [displayAttempt, setDisplayAttempt] = useState(0);
  const displayLink = displayToken ? `${origin}/display?token=${displayToken}` : null;

  const [invites, setInvites] = useState<InviteSummaryDTO[] | null>(null);
  // Same class as the Entries desk (2026-08-10 browser pass): a rejected read
  // became `[]` and rendered as an empty list. An owner reading that mints a
  // second invite for someone who already has one.
  const [invitesFailed, setInvitesFailed] = useState(false);
  const [role, setRole] = useState<InviteRole>('operator');
  const [email, setEmail] = useState('');
  const [inviteMode, setInviteMode] = useState<'email' | 'link'>(
    canEmailInvite ? 'email' : 'link',
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!showDisplay) return;
    setDisplayLoadError(false);
    setDisplayTokenDenied(false);
    setDisplayToken(null);
    let cancelled = false;
    apiClient
      .getDisplayToken(tid)
      .then((t) => {
        if (cancelled) return;
        setDisplayToken(t.token);
        setDisplayTokenDenied(false);
      })
      .catch((error: { status?: number; response?: { status?: number } }) => {
        if (cancelled) return;
        const status = error?.response?.status ?? error?.status;
        if (status === 401 || status === 403 || status === 404) setDisplayTokenDenied(true);
        else setDisplayLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showDisplay, tid, displayAttempt]);

  // A no-cancel reload used after a create/revoke mutation (user-initiated).
  const refresh = useCallback(() => {
    apiClient
      .listInvites(tid)
      .then((r) => {
        setInvites(r);
        setInvitesFailed(false);
      })
      .catch(() => setInvitesFailed(true));
  }, [tid]);

  // Initial / tid-change load, guarded so a late response can't overwrite newer state.
  useEffect(() => {
    if (!showInvites) {
      setInvites([]);
      setInvitesFailed(false);
      return;
    }
    let cancelled = false;
    setInvites(null);
    setInvitesFailed(false);
    apiClient
      .listInvites(tid)
      .then((r) => !cancelled && setInvites(r))
      .catch(() => !cancelled && setInvitesFailed(true));
    return () => {
      cancelled = true;
    };
  }, [showInvites, tid]);

  // Clear the "Copied" flash timer on unmount.
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  async function copy(text: string, key: string) {
    if (await copyToClipboard(text)) {
      setCopied(key);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 1500);
    } else {
      setActionError('Copy was unavailable. Select and copy the displayed link manually.');
    }
  }

  async function rotate() {
    if (!online) return;
    setActionError(null);
    setRotating(true);
    try {
      const t = await apiClient.rotateDisplayToken(tid);
      setDisplayToken(t.token);
    } catch {
      setActionError('The venue board link could not be replaced. Retry when connected.');
    } finally {
      setRotating(false);
    }
  }

  // Rotate sat 24px from Copy and Open fullscreen, in the same row, at the same
  // size and variant: three controls that looked like one family, of which two
  // are read-only and the third revokes the live venue link on the first click.
  // Mid-event that is the hall's screen going blank. It now ARMS (the canon
  // two-click guard, disarming on Escape and on blur) and sits below the rule,
  // out of the safe controls' row. A Modal is reserved for the catastrophic;
  // this is merely irreversible: the operator can always re-share the new link.
  const confirmRotate = useConfirmClick(() => void rotate());

  async function create() {
    if (!online || (inviteMode === 'email' && !email.trim())) return;
    setActionError(null);
    setBusy(true);
    try {
      const trimmed = inviteMode === 'email' ? email.trim() : '';
      await apiClient.createInvite(tid, trimmed ? { role, email: trimmed } : { role });
      setEmail('');
      refresh();
    } catch {
      setActionError('The invite could not be created. Check the email and connection, then retry.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    if (!online) return;
    try { await apiClient.revokeInvite(token); refresh(); }
    catch { setActionError('The invite could not be revoked. Retry when connected.'); }
  }

  const now = Date.now();
  // Package 16: one board name everywhere — "Venue board". The PAGE owns
  // that title: `DisplayBoardSettings` (`WorkspaceShellSurface`) names it
  // once in its `ActionsBar`, so neither this scope nor `DisplayConfig`
  // renders a heading/intro for the same page (V3-OC22.2 — no repeated
  // "public display link" headings; OPR-0908-4 — one heading owner).
  const heading = scope === 'site'
    ? 'Public site'
    : scope === 'team'
      ? 'Team access'
      : 'Links and access';
  const intro = scope === 'site'
    ? 'Choose which tournament information is public.'
    : scope === 'team'
      ? 'Invite operators and control their workspace access.'
      : 'Public links and collaborator access are separate.';

  if (scope === 'site') return <PublicationSettings key={tid} tid={tid} />;

  const inviteControls = (
    <>
        {canEmailInvite ? (
          <fieldset className="mb-4 space-y-2 text-sm">
            <legend className="mb-2 font-medium">Invitation delivery</legend>
            <label className="flex items-center gap-2"><input type="radio" name="invite-mode" checked={inviteMode === 'email'} onChange={() => setInviteMode('email')} />Send by email</label>
            <label className="flex items-center gap-2"><input type="radio" name="invite-mode" checked={inviteMode === 'link'} onChange={() => setInviteMode('link')} />Create a link to share</label>
            <p className="text-muted-foreground">{inviteMode === 'email' ? 'The invitation is emailed to this address. The link grants the selected role to a signed-in person who accepts it.' : 'Anyone who receives this link can sign in and accept the selected role. Share it only with people you intend to give access.'}</p>
          </fieldset>
        ) : (
          <p className="mb-4 text-xs text-muted-foreground">
            Anyone who receives this link can sign in and accept the selected role. Share it only with people you intend to give access.
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">Role</span>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as InviteRole)}
            options={ROLE_OPTIONS}
            ariaLabel="Invite role"
            size="sm"
          />
          {inviteMode === 'email' && (
            // OPR-0908-5: the chrome comes from `TextField` (control border
            // token, focus ring, disabled treatment) instead of a local class
            // string. The label stays beside the field on this one action row,
            // so the word is rendered beside it exactly as "Role" is beside
            // the Select above (a <span>, not a second <label> — TextField
            // brings its own, sr-only, and labels cannot nest).
            <span className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-foreground">
              <span>Email</span>
              <TextField
                label="Invite email"
                labelHidden
                size="sm"
                className="min-w-0 flex-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                aria-label="Invite email"
              />
            </span>
          )}
          <Button size="sm" onClick={create} disabled={busy || !online || (inviteMode === 'email' && !email.trim())}>
            {busy ? (inviteMode === 'email' ? 'Sending…' : 'Creating…') : inviteMode === 'email' ? 'Send invitation' : 'Create share link'}
          </Button>
        </div>

        {/* Same internal anatomy as the public-link card (WSS-1):
            description, one action row, a rule, then the body. */}
        <ul className="mt-3 divide-y divide-border rounded border border-border">
          {invitesFailed ? (
            <li
              role="alert"
              data-testid="invites-load-error"
              className="flex items-center justify-between gap-3 p-3 text-sm text-muted-foreground"
            >
              <span>
                The invite list didn&rsquo;t load. Whether any exist is unknown.
                Creating one here may duplicate an invite someone already holds.
              </span>
              <Button size="xs" variant="ghost" onClick={refresh}>
                Retry
              </Button>
            </li>
          ) : invites === null ? (
            <li className="p-3 text-sm text-muted-foreground">Loading…</li>
          ) : invites.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">
              {inviteMode === 'email' ? 'No invitations sent yet.' : 'No invitation links created yet.'}
            </li>
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
                      <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
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
                    <div className="mt-0.5 break-words text-xs text-muted-foreground">
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
                        disabled={!online}
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
    </>
  );

  return (
    <div>
      {!online && <p role="status" className="mb-4 text-sm text-muted-foreground">Offline. Link and invitation changes require a connection and are not queued.</p>}
      {actionError && <p role="alert" className="mb-4 text-sm text-destructive">{actionError}</p>}
      {scope !== 'links' && scope !== 'team' && (
        <div className="pb-4">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{heading}</h2>
          <p className={`mt-1 text-xs text-muted-foreground ${PAGE_BODY_WIDTH.prose}`}>
            {intro}
          </p>
        </div>
      )}

      {/* Public display link — read-only, separate from collaborator invites.
          Hidden entirely when the caller isn't the owner (mint 404s). */}
      {showDisplay && displayLoadError && <div role="alert" className="mb-4 text-sm"><p>The board link could not be loaded.</p><Button variant="outline" size="sm" onClick={() => setDisplayAttempt((value) => value + 1)}>Retry board link</Button></div>}
      {showDisplay && !displayTokenDenied && !displayLoadError && (
        <SectionCard eyebrow="BOARD LINK" testId="sharing-public">
          <p className="mb-2 text-xs text-muted-foreground">
            Anyone with this link can view the board.
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {/* A READABLE label, not the raw capability URL. The old field
                printed `http://192.168.1.5:8080/display?token=<32 opaque
                chars>` in monospace — nothing anyone reads, types or checks,
                and the token is the one part that must not be read aloud.
                The real URL is what Copy puts on the clipboard and what Open
                fullscreen loads (no invented hostname: it is this origin, so
                a local-network board keeps working); it stays available to
                assistive tech and on hover via `title`. */}
            <span
              data-testid="display-link-label"
              title={displayLink ?? undefined}
              className="min-w-0 flex-1 break-words rounded border border-border bg-muted/30 px-2 py-1.5 text-xs text-foreground"
            >
              {displayLink ? (
                <>
                  <span className="font-medium">Venue board</span>
                  <span className="text-muted-foreground"> · {origin.replace(/^https?:\/\//, '')}</span>
                </>
              ) : (
                'Loading…'
              )}
            </span>
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
              onClick={() => displayLink && window.open(displayLink, '_blank', 'noopener,noreferrer')}
            >
              Open fullscreen
            </Button>
          </div>

          {/* Below the rule, apart from the two safe controls above it. */}
          <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
            <Button
              size="xs"
              variant={confirmRotate.armed ? 'destructive' : 'outline'}
              disabled={!displayLink || rotating || !online}
              onClick={confirmRotate.press}
              onBlur={confirmRotate.reset}
              aria-label={
                confirmRotate.armed
                  ? 'Confirm replacing the venue board link'
                  : 'Replace the venue board link'
              }
            >
              {rotating
                ? 'Replacing…'
                : confirmRotate.armed
                  ? 'Confirm: replace link'
                  : 'Replace link'}
            </Button>
            {/* Package 16 (V3-OC22.2): the consequence next to the control is
                the plan's exact sentence, always visible — not conditional
                resting-state reassurance. The armed state adds only the
                cancel affordance, never a second, different claim about what
                Replace does. */}
            <p className={TEXT_MUTED_XS}>
              Replacing the link stops the old link from working.
              {confirmRotate.armed ? ' Every venue display goes blank until you re-share the new one. Press Escape to cancel.' : ''}
            </p>
          </div>
        </SectionCard>
      )}

      {showSite && <PublicationSettings key={tid} tid={tid} />}

      {/* Invitations. Under Administration · Team this renders WITHOUT a
          heading of its own: the page is already called Team, and it used to
          carry "Team access" over "INVITATIONS" over a paragraph over a
          fieldset legend — four labels above one role dropdown and a button.
          The delivery choice is only offered where the server can act on it
          (see `canEmailInvite` above). */}
      {showInvites && (scope === 'team' ? (
        <div data-testid="sharing-invites" className="pt-2">
          {inviteControls}
        </div>
      ) : (
      <SectionCard eyebrow="INVITATIONS" testId="sharing-invites">
        <p className="mb-2 text-xs text-muted-foreground">
          Invite people to view or operate this workspace with the selected role. Revoke a link any time.
        </p>
        {inviteControls}
      </SectionCard>
      ))}
    </div>
  );
}
