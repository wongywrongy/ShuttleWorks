import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { Select, TextField } from '@scheduler/design-system/components';
import { SectionCard, PAGE_BODY_WIDTH } from '../../components/control-plane';
import { useConfirmClick } from '../../hooks/useConfirmClick';
import { apiClient } from '../../api/client';
import type { InviteRole, InviteSummaryDTO, DisplayTokenStatusDTO } from '../../api/dto';
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

export function SharingTab({ tid, scope = 'all', onDisplayLinkChange }: { tid: string; scope?: SharingScope; onDisplayLinkChange?: (issued: { tid: string; url: string } | null) => void }) {
  const showDisplay = scope === 'all' || scope === 'links';
  const showSite = scope === 'all' || scope === 'site';
  // Collaborator invitations are an Administration > Team and access job.
  // They remain in the legacy all-in-one surface only for compatibility;
  // canonical Publish > Links contains public/display links, not permissions.
  const showInvites = scope === 'all' || scope === 'team';
  const origin = window.location.origin;

  // V3-OC25.1 / package 18: offer "send by email" only where the server can
  // actually deliver one. Local mode's console backend skips delivery
  // (no operator ever receives it); cloud mode without SMTP
  // configured is the same situation. Link mode always works — it is the
  // fallback in both branches below.
  const { authMode, user } = useAuth();
  const canEmailInvite = authMode === 'cloud' && !!user?.emailConfigured;

  // Public display link is a CAPABILITY link (SP-CLOUD-2): minted server-side,
  // owner-gated, revocable by rotation. Non-owners get a 404 from the mint
  // endpoint — hide the section rather than showing a link we can't produce.
  const [displayToken, setDisplayToken] = useState<{ tid: string; token: string } | null>(null);
  const [displayStatus, setDisplayStatus] = useState<DisplayTokenStatusDTO | null>(null);
  const [displayExpiry, setDisplayExpiry] = useState('');
  const displayGeneration = useRef(0);
  const [displayTokenDenied, setDisplayTokenDenied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [displayLoadError, setDisplayLoadError] = useState(false);
  const [displayAttempt, setDisplayAttempt] = useState(0);
  const displayLink = displayToken?.tid === tid ? `${origin}/display?token=${displayToken.token}` : null;
  const displayWindowEnded = !!displayStatus?.defaultExpiresAt
    && new Date(displayStatus.defaultExpiresAt).getTime() <= Date.now();

  const [invites, setInvites] = useState<InviteSummaryDTO[] | null>(null);
  // Issued links live only in this mounted view, never browser storage.
  const [issuedInvite, setIssuedInvite] = useState<{ tid: string; id: string; url: string } | null>(null);
  const inviteGeneration = useRef(0);
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
    displayGeneration.current += 1;
    setDisplayToken(null);
    setDisplayStatus(null);
    setDisplayExpiry('');
    setRotating(false);
    onDisplayLinkChange?.(null);
    if (!showDisplay) return;
    setDisplayLoadError(false);
    setDisplayTokenDenied(false);
    setDisplayToken(null);
    let cancelled = false;
    apiClient
      .getDisplayToken(tid)
      .then((t) => {
        if (cancelled) return;
        setDisplayStatus(t);
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
      displayGeneration.current += 1;
    };
  }, [showDisplay, tid, displayAttempt, onDisplayLinkChange]);

  // A no-cancel reload used after a create/revoke mutation (user-initiated).
  const refresh = useCallback(() => {
    const generation = inviteGeneration.current;
    apiClient
      .listInvites(tid)
      .then((r) => {
        if (generation !== inviteGeneration.current) return;
        setInvites(r);
        setInvitesFailed(false);
      })
      .catch(() => { if (generation === inviteGeneration.current) setInvitesFailed(true); });
  }, [tid]);

  // Initial / tid-change load, guarded so a late response can't overwrite newer state.
  useEffect(() => {
    inviteGeneration.current += 1;
    setIssuedInvite(null);
    setBusy(false);
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
      inviteGeneration.current += 1;
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

  async function changeDisplay(revoke = false) {
    if (!online || rotating || !displayStatus) return;
    const generation = displayGeneration.current;
    setActionError(null);
    setRotating(true);
    setDisplayToken(null);
    onDisplayLinkChange?.(null);
    try {
      if (revoke) {
        await apiClient.revokeDisplayToken(tid);
        if (generation !== displayGeneration.current) return;
        setDisplayStatus({ ...displayStatus, active: false, expiresAt: null });
      } else {
        const expiry = displayExpiry ? new Date(displayExpiry).toISOString() : undefined;
        const issued = await apiClient.rotateDisplayToken(tid, expiry);
        if (generation !== displayGeneration.current) return;
        setDisplayToken({ tid, token: issued.token });
        setDisplayStatus({ ...displayStatus, active: true, expiresAt: issued.expiresAt });
        onDisplayLinkChange?.({ tid, url: `${origin}${issued.url}` });
      }
    } catch {
      if (generation === displayGeneration.current) {
        setActionError('The board link change could not be confirmed. Reload its status before trying again.');
        setDisplayLoadError(true);
      }
    } finally {
      if (generation === displayGeneration.current) setRotating(false);
    }
  }

  const confirmRotate = useConfirmClick(() => void changeDisplay());
  const confirmRevoke = useConfirmClick(() => void changeDisplay(true));
  const resetRotate = confirmRotate.reset;
  const resetRevoke = confirmRevoke.reset;
  useEffect(() => {
    resetRotate();
    resetRevoke();
  }, [tid, displayAttempt, showDisplay, resetRotate, resetRevoke]);

  async function create() {
    if (!online || (inviteMode === 'email' && !email.trim())) return;
    const generation = inviteGeneration.current;
    setActionError(null);
    setBusy(true);
    try {
      const trimmed = inviteMode === 'email' ? email.trim() : '';
      const issued = await apiClient.createInvite(tid, trimmed ? { role, email: trimmed } : { role });
      if (generation !== inviteGeneration.current) return;
      setIssuedInvite({ tid, id: issued.id, url: `${origin}${issued.url}` });
      setEmail('');
      refresh();
    } catch {
      if (generation === inviteGeneration.current) setActionError('The invite could not be created. Check the email and connection, then retry.');
    } finally {
      if (generation === inviteGeneration.current) setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!online) return;
    const generation = inviteGeneration.current;
    try {
      await apiClient.revokeInvite(id);
      if (generation !== inviteGeneration.current) return;
      setIssuedInvite((issued) => issued?.id === id ? null : issued);
      refresh();
    }
    catch {
      if (generation === inviteGeneration.current) setActionError('The invite could not be revoked. Retry when connected.');
    }
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
        {issuedInvite?.tid === tid && (
          <div role="status" className="mb-4 space-y-2 rounded border border-border p-3">
            <p className="text-sm">Copy this invitation now. It cannot be retrieved after leaving this page or creating another link.</p>
            <TextField label="New invitation link" value={issuedInvite.url} readOnly />
            <Button size="xs" variant="outline" onClick={() => copy(issuedInvite.url, issuedInvite.id)}>
              {copied === issuedInvite.id ? 'Copied' : 'Copy invitation link'}
            </Button>
          </div>
        )}
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
              return (
                <li
                  key={inv.id}
                  data-testid={`invite-${inv.id}`}
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
                    {status === 'active' && (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={!online}
                        onClick={() => void revoke(inv.id)}
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

      {/* Reads expose status only. The issued link lives in this view. */}
      {showDisplay && displayLoadError && <div role="alert" className="mb-4 text-sm"><p>The board link status could not be loaded.</p><Button variant="outline" size="sm" onClick={() => setDisplayAttempt((value) => value + 1)}>Retry board link</Button></div>}
      {showDisplay && !displayTokenDenied && !displayLoadError && (
        <SectionCard eyebrow="BOARD LINK" testId="sharing-public">
          <p className="mb-2 text-xs text-muted-foreground">Anyone with this link can view the board until it expires or you revoke it.</p>
          <p data-testid="display-link-label" title={displayLink ?? undefined} className="mb-2 text-sm">
            {!displayStatus ? 'Loading…' : displayStatus.active ? `Venue board · ${fmtExpiry(displayStatus.expiresAt)}` : 'No active board link.'}
          </p>
          {displayLink ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Copy this link now. It cannot be retrieved after leaving this page.</p>
              <TextField label="New venue board link" value={displayLink} readOnly />
              <div className="flex gap-2">
                <Button size="xs" variant="ghost" onClick={() => copy(displayLink, 'display')}>{copied === 'display' ? 'Copied' : 'Copy'}</Button>
                <Button size="xs" variant="ghost" onClick={() => window.open(displayLink, '_blank', 'noopener,noreferrer')}>Open fullscreen</Button>
              </div>
            </div>
          ) : displayStatus?.active ? (
            <p className="text-xs text-muted-foreground">The existing link still works. To share it again, use your saved copy or replace it below.</p>
          ) : null}
          {displayStatus && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <TextField label="Link expiry (your local time)" type="datetime-local" value={displayExpiry}
                onChange={(event) => setDisplayExpiry(event.target.value)} disabled={rotating || !online || displayWindowEnded} />
              <p className={TEXT_MUTED_XS}>
                {displayWindowEnded ? 'The event’s link window has ended. Update its dates before issuing another link.' : displayStatus.defaultExpiresAt
                  ? `Leave blank for ${new Date(displayStatus.defaultExpiresAt).toLocaleString()}, seven days after the event ends. You may choose an earlier expiry.`
                  : 'This event has no usable end date. Choose a future expiry before creating a link.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="xs" variant={confirmRotate.armed ? 'destructive' : 'outline'}
                  disabled={rotating || !online || displayWindowEnded || (!displayExpiry && !displayStatus.defaultExpiresAt)}
                  onClick={displayStatus.active ? confirmRotate.press : () => void changeDisplay()}
                  onBlur={confirmRotate.reset}
                  aria-label={displayStatus.active ? (confirmRotate.armed ? 'Confirm replacing the venue board link' : 'Replace the venue board link') : 'Create venue board link'}>
                  {rotating ? 'Saving…' : displayStatus.active ? (confirmRotate.armed ? 'Confirm: replace link' : 'Replace link') : 'Create link'}
                </Button>
                {displayStatus.active && <Button size="xs" variant={confirmRevoke.armed ? 'destructive' : 'outline'}
                  disabled={rotating || !online} onClick={confirmRevoke.press} onBlur={confirmRevoke.reset}
                  aria-label={confirmRevoke.armed ? 'Confirm revoking the venue board link' : 'Revoke the venue board link'}>
                  {confirmRevoke.armed ? 'Confirm: revoke link' : 'Revoke link'}
                </Button>}
              <p className={TEXT_MUTED_XS}>Replacing the link stops the old link from working.
                {confirmRotate.armed || confirmRevoke.armed ? ' Every venue display goes blank until you re-share a new link. Press Escape to cancel.' : ''}
              </p>
              </div>
            </div>
          )}
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
