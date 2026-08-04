import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../api/client';
import type { TournamentMemberDTO, TournamentSummaryDTO } from '../../api/dto';
import { shortId, initialFor } from './memberIdentity';

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

/** People & Access: the roles legend + the workspace's members (read-only —
 *  there is no role-change endpoint yet). */
export function PeopleAccessTab({
  tid,
  summary,
}: {
  tid: string;
  /** Pre-fetched workspace summary from the parent (avoids a duplicate
   *  getTournament call). Only `ownerName` is consumed here. */
  summary: TournamentSummaryDTO | null;
}) {
  const [members, setMembers] = useState<TournamentMemberDTO[] | null>(null);

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
              const name =
                m.displayName?.trim() ||
                m.email ||
                (m.role === 'owner' && summary?.ownerName ? summary.ownerName : null);
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
                        {name ?? shortId(m.userId)}
                      </span>
                      <span className="text-2xs capitalize text-muted-foreground">{m.role}</span>
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Joined {fmtDate(m.joinedAt)}
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
    </div>
  );
}
