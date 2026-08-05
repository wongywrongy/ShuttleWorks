import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Modal } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { TournamentMemberDTO, TournamentSummaryDTO } from '../../api/dto';
import { useAuth } from '../../context/AuthContext';
import { OverflowMenu, type OverflowItem } from '../../components/control-plane/OverflowMenu';
import { shortId, initialFor } from './memberIdentity';
import {
  LAST_OWNER_REASON,
  memberActionsFor,
  roleOptionsFor,
  type MemberRole,
} from './memberActions';

const ROLE_LEGEND: { role: string; desc: string }[] = [
  { role: 'Owner', desc: 'Full control — modules, sharing, delete.' },
  { role: 'Operator', desc: 'Run event operations.' },
  { role: 'Viewer', desc: 'Read-only / display support.' },
];

/** Same date grammar as the workspace header ("Oct 1, 2026") — one format
 *  everywhere, never the locale-default numeric soup. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function displayNameFor(
  m: TournamentMemberDTO,
  summary: TournamentSummaryDTO | null,
): string | null {
  return (
    m.displayName?.trim() ||
    m.email ||
    (m.role === 'owner' && summary?.ownerName ? summary.ownerName : null)
  );
}

/** What a confirmation dialog is currently asking about. */
type Pending =
  | { kind: 'remove'; member: TournamentMemberDTO }
  | { kind: 'leave'; member: TournamentMemberDTO }
  | { kind: 'transfer'; member: TournamentMemberDTO }
  | null;

/**
 * People & Access — the roles legend, the workspace's members, and (for
 * owners) the actions that let a tenancy be *exited* as well as entered.
 *
 * Mutations here are deliberately **pessimistic**: the row shows a
 * pending state, then the list is refetched once from the server on
 * success. Optimistic updates suit high-success low-risk interactions;
 * access control is neither, and briefly showing someone as removed when
 * they were not is worse than a moment of latency. The server is the
 * authority — this surface just narrates it.
 */
export function PeopleAccessTab({
  tid,
  summary,
}: {
  tid: string;
  /** Pre-fetched workspace summary from the parent (avoids a duplicate
   *  getTournament call). Only `ownerName` is consumed here. */
  summary: TournamentSummaryDTO | null;
}) {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const titleId = useId();

  const [members, setMembers] = useState<TournamentMemberDTO[] | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await apiClient.listMembers(tid));
    } catch {
      setMembers([]);
    }
  }, [tid]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listMembers(tid)
      .then((m) => !cancelled && setMembers(m))
      .catch(() => !cancelled && setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [tid]);

  const currentUserRole = useMemo<MemberRole | null>(() => {
    if (!members || !currentUserId) return null;
    const me = members.find((m) => m.userId === currentUserId);
    return (me?.role as MemberRole) ?? null;
  }, [members, currentUserId]);

  /**
   * Run a membership mutation, then reconcile against the server.
   *
   * Every failure path ends in a refetch, because every one of them means
   * this tab's picture of the workspace is out of date: 409 says another
   * owner changed underneath us, 404 says the workspace or member is no
   * longer ours to see (the uniform-404 seam), 403 says our own role
   * moved. Refetching is both the fix and the explanation.
   *
   * The row is never mutated locally, so a failure leaves it exactly as
   * it was — there is no optimistic residue to roll back.
   */
  /** Returns true when the operation actually succeeded.
   *
   *  Callers MUST branch on this rather than on `run` resolving: it
   *  swallows every error to render it inline, so `await run(...)`
   *  resolves on failure too. The "leave workspace" path used to treat
   *  resolution as success and fired a session-expired redirect
   *  unconditionally — a rejected leave (409 last-owner, 403, or a
   *  network blip) logged the user out while showing them the error.
   */
  const run = useCallback(
    async (userId: string, op: () => Promise<unknown>, success: string): Promise<boolean> => {
      setBusyUserId(userId);
      setError(null);
      setNotice(null);
      try {
        await op();
        await load();
        setNotice(success);
        return true;
      } catch (err) {
        const e = err as { code?: string; status?: number; message?: string };
        if (e.code === 'MEMBER_LAST_OWNER') {
          setError(LAST_OWNER_REASON);
        } else if (e.status === 404) {
          setError('That member is no longer part of this workspace.');
        } else if (e.status === 403) {
          setError('Your role in this workspace changed — you can no longer do that.');
        } else {
          setError(e.message || 'Could not complete that change. Please try again.');
        }
        // Stale in every branch above; the list is the source of truth.
        await load();
        return false;
      } finally {
        setBusyUserId(null);
      }
    },
    [load],
  );

  const changeRole = (m: TournamentMemberDTO, role: MemberRole) =>
    run(
      m.userId,
      () => apiClient.changeMemberRole(tid, m.userId, role),
      `Role updated to ${role}.`,
    );

  const confirmPending = async () => {
    if (!pending) return;
    const { kind, member } = pending;
    setPending(null);
    if (kind === 'remove') {
      await run(
        member.userId,
        () => apiClient.removeMember(tid, member.userId),
        'Member removed.',
      );
    } else if (kind === 'leave') {
      // Self-removal: once it lands this user has no access, so let the
      // existing session/permission machinery do the redirect rather
      // than inventing a second mechanism for the same situation.
      //
      // Only on SUCCESS. If the leave was refused the user still has
      // access, and redirecting them would both discard the inline
      // explanation and log them out of a workspace they remain a
      // member of.
      const left = await run(
        member.userId,
        () => apiClient.leaveTournament(tid),
        'You left the workspace.',
      );
      if (left) window.dispatchEvent(new CustomEvent('sw:session-expired'));
    } else {
      await run(
        member.userId,
        () => apiClient.transferOwnership(tid, member.userId),
        'Ownership transferred.',
      );
    }
  };

  return (
    <div className="max-w-2xl space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Members &amp; roles</h2>
        {summary?.ownerName && (
          <p className="mt-1 text-xs text-muted-foreground">Owner: {summary.ownerName}</p>
        )}
      </div>

      <ul className="space-y-1.5">
        {ROLE_LEGEND.map((r) => (
          <li key={r.role} className="flex gap-2 text-xs">
            <span className="w-16 shrink-0 font-medium text-foreground">{r.role}</span>
            <span className="text-muted-foreground">{r.desc}</span>
          </li>
        ))}
      </ul>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Members</h3>

        {/* Errors sit with the list that produced them, not in a toast
            detached from the row the user was acting on. */}
        {error && (
          <div
            role="alert"
            data-testid="member-error"
            className="mb-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}
        {notice && !error && (
          <div
            role="status"
            data-testid="member-notice"
            className="mb-2 rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground"
          >
            {notice}
          </div>
        )}

        <ul className="divide-y divide-border rounded border border-border">
          {members === null ? (
            <li className="p-3 text-sm text-muted-foreground">Loading…</li>
          ) : members.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">
              No members yet — invite collaborators from the Sharing tab.
            </li>
          ) : (
            members.map((m) => {
              // SP-CLOUD-2: member rows now carry real identity (displayName /
              // email) from the users table. Prefer that; fall back to the
              // owner's name off the summary for the owner row; and keep the
              // short-id chip for pre-account placeholder identities (null
              // email — unmigrated rows).
              const name = displayNameFor(m, summary);
              const label = name ?? shortId(m.userId);
              const actions = memberActionsFor(members, m, currentUserId, currentUserRole);
              const roleOpts = roleOptionsFor(members, m);
              const busy = busyUserId === m.userId;

              const items: OverflowItem[] = [];
              if (actions.changeRole.shown) {
                for (const opt of roleOpts) {
                  if (opt.role === m.role) continue;
                  items.push({
                    key: `role-${opt.role}`,
                    label: `Make ${opt.role}`,
                    testId: `role-${opt.role}-${m.userId}`,
                    disabled: opt.disabled,
                    disabledReason: opt.reason,
                    onSelect: () => changeRole(m, opt.role),
                  });
                }
              }
              if (actions.transfer.shown) {
                items.push({
                  key: 'transfer',
                  label: 'Transfer ownership…',
                  testId: `transfer-${m.userId}`,
                  disabled: actions.transfer.disabled,
                  disabledReason: actions.transfer.reason,
                  onSelect: () => setPending({ kind: 'transfer', member: m }),
                });
              }
              if (actions.remove.shown) {
                items.push({
                  key: 'remove',
                  label: 'Remove from workspace…',
                  testId: `remove-${m.userId}`,
                  destructive: true,
                  disabled: actions.remove.disabled,
                  disabledReason: actions.remove.reason,
                  onSelect: () => setPending({ kind: 'remove', member: m }),
                });
              }
              if (actions.leave.shown) {
                items.push({
                  key: 'leave',
                  label: 'Leave workspace…',
                  testId: `leave-${m.userId}`,
                  destructive: true,
                  disabled: actions.leave.disabled,
                  disabledReason: actions.leave.reason,
                  onSelect: () => setPending({ kind: 'leave', member: m }),
                });
              }

              // The reason a control is unavailable belongs next to the
              // control, visibly. A hover tooltip is not enough: nobody
              // hovers a thing they have no reason to believe is
              // interactive, and the menu has to be opened to see it at
              // all. Stable, knowable-in-advance reasons get inline text.
              const blockedReason = [actions.remove, actions.leave, actions.changeRole].find(
                (a) => a.shown && a.disabled,
              )?.reason;

              return (
                <li
                  key={m.userId}
                  data-testid={`member-${m.userId}`}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-muted-foreground"
                    >
                      {name ? name[0].toUpperCase() : initialFor(m.userId)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-medium text-foreground">
                        {label}
                        {currentUserId === m.userId && (
                          <span className="ml-1 text-2xs text-muted-foreground">(you)</span>
                        )}
                      </span>
                      <span className="text-2xs capitalize text-muted-foreground">{m.role}</span>
                      {blockedReason && (
                        <span
                          data-testid={`member-reason-${m.userId}`}
                          className="mt-0.5 text-2xs text-muted-foreground"
                        >
                          {blockedReason}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {busy ? 'Working…' : `Joined ${fmtDate(m.joinedAt)}`}
                    </span>
                    {/* Rendered whenever any action *applies* to this
                        row, including when all of them are currently
                        blocked. Blocked-with-a-reason is not a dead
                        affordance: the last-owner rule is something the
                        user can clear (by promoting someone), so the
                        control has to stay visible to say so. Only
                        actions the user could NEVER perform are absent
                        entirely — a viewer sees no menu at all. */}
                    {items.length > 0 && (
                      <OverflowMenu label={`Actions for ${label}`} items={items} />
                    )}
                  </span>
                </li>
              );
            })
          )}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Invite people from{' '}
          <Link to={`/tournaments/${tid}/ws-sharing`} className="text-accent hover:underline">
            Sharing
          </Link>
          {' '}— collaborator invite links carry a role.
        </p>
      </div>

      {pending && (
        <Modal onClose={() => setPending(null)} titleId={titleId}>
          <div className="space-y-4 p-5">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {pending.kind === 'remove'
                ? 'Remove member'
                : pending.kind === 'leave'
                  ? 'Leave workspace'
                  : 'Transfer ownership'}
            </h2>

            <div className="space-y-2 text-sm text-muted-foreground">
              {pending.kind === 'remove' && (
                <p data-testid="confirm-body">
                  <span className="font-medium text-foreground">
                    {displayNameFor(pending.member, summary) ?? shortId(pending.member.userId)}
                  </span>{' '}
                  will immediately lose access to this workspace. You can invite them again
                  later.
                </p>
              )}
              {pending.kind === 'leave' && (
                <p data-testid="confirm-body">
                  You will immediately lose access to this workspace, and you will not be able
                  to rejoin without a new invite from an owner.
                </p>
              )}
              {pending.kind === 'transfer' && (
                <p data-testid="confirm-body">
                  <span className="font-medium text-foreground">
                    {displayNameFor(pending.member, summary) ?? shortId(pending.member.userId)}
                  </span>{' '}
                  will become the owner of this workspace. You will become an operator, and
                  you will not be able to reverse this on your own — only the new owner can
                  transfer it back.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                variant={pending.kind === 'transfer' ? 'default' : 'destructive'}
                data-testid="confirm-action"
                onClick={confirmPending}
              >
                {pending.kind === 'remove'
                  ? 'Remove member'
                  : pending.kind === 'leave'
                    ? 'Leave workspace'
                    : 'Transfer ownership'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
