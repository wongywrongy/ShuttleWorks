/**
 * Settings → Share section.
 *
 * Three blocks:
 *  1. **Members** — visible to any member. Name (user id today; will be
 *     email once Supabase lookup is wired) + role + joined date.
 *  2. **Generate link** — owner-only. Picks operator/viewer → POSTs an
 *     invite → reveals the URL with a copy button.
 *  3. **Active links** — owner-only. Lists every invite with a Revoke
 *     button per active row.
 *
 * The owner-only blocks are hidden from non-owners by branching on the
 * caller's role for the active tournament — fetched once via
 * ``GET /tournaments/{id}`` so the UI never shows controls the API
 * would reject.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../api/client';
import type {
  InviteRole,
  InviteSummaryDTO,
  TournamentMemberDTO,
  TournamentSummaryDTO,
} from '../../api/dto';
import { useTournamentId } from '../../hooks/useTournamentId';
import { Button, Card } from '@scheduler/design-system';
import { SectionHeader } from './SettingsControls';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

export function ShareSettings() {
  const tid = useTournamentId();

  const [summary, setSummary] = useState<TournamentSummaryDTO | null>(null);
  const [members, setMembers] = useState<TournamentMemberDTO[]>([]);
  const [invites, setInvites] = useState<InviteSummaryDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Generate form state.
  const [newRole, setNewRole] = useState<InviteRole>('operator');
  const [creating, setCreating] = useState(false);
  const [generated, setGenerated] = useState<{
    token: string;
    fullUrl: string;
  } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const isOwner = summary?.role === 'owner';

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, m] = await Promise.all([
        apiClient.getTournament(tid),
        apiClient.listMembers(tid),
      ]);
      setSummary(s);
      setMembers(m);
      // Invites are owner-only — branch off the role we just fetched.
      if (s.role === 'owner') {
        const i = await apiClient.listInvites(tid);
        setInvites(i);
      } else {
        setInvites([]);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load share settings');
    }
  }, [tid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleGenerate = useCallback(async () => {
    setCreating(true);
    setGenError(null);
    setGenerated(null);
    try {
      const r = await apiClient.createInvite(tid, { role: newRole });
      const fullUrl = `${window.location.origin}${r.url}`;
      setGenerated({ token: r.token, fullUrl });
      await refresh();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Could not create invite');
    } finally {
      setCreating(false);
    }
  }, [tid, newRole, refresh]);

  const handleRevoke = useCallback(
    async (token: string) => {
      try {
        await apiClient.revokeInvite(token);
        await refresh();
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Revoke failed');
      }
    },
    [refresh],
  );

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text);
  }, []);

  const activeInvites = useMemo(
    () => invites.filter((i) => i.valid),
    [invites],
  );

  return (
    <div className="space-y-8 pt-6">
      {loadError && (
        <div className="text-sm text-red-600 dark:text-red-400">{loadError}</div>
      )}

      <section>
        <SectionHeader>Members</SectionHeader>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <Card className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-4 px-4 py-2 text-sm">
                <span className="font-mono text-xs flex-1 truncate">{m.userId}</span>
                <span className="capitalize w-20 text-right text-muted-foreground">{m.role}</span>
                <span className="tabular-nums w-28 text-right text-muted-foreground">
                  {formatDate(m.joinedAt)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {!isOwner ? (
        <p className="text-xs text-muted-foreground">
          Only the tournament owner can generate or revoke invite links.
        </p>
      ) : (
        <>
          <section>
            <SectionHeader>Generate link</SectionHeader>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Role</span>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as InviteRole)}
                  className="px-2 py-1 rounded border border-input bg-background"
                  disabled={creating}
                >
                  <option value="operator">Operator</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <Button onClick={handleGenerate} disabled={creating}>
                {creating ? 'Generating…' : 'Generate'}
              </Button>
            </div>
            {genError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{genError}</p>
            )}
            {generated && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generated.fullUrl}
                  className="flex-1 px-3 py-2 rounded border border-input bg-muted/30 text-sm font-mono"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  onClick={() => handleCopy(generated.fullUrl)}
                >
                  Copy
                </Button>
              </div>
            )}
          </section>

          <section>
            <SectionHeader>Active links</SectionHeader>
            {activeInvites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active links.</p>
            ) : (
              <Card className="divide-y divide-border">
                {activeInvites.map((inv) => (
                  <div
                    key={inv.token}
                    className="flex items-center gap-4 px-4 py-2 text-sm"
                  >
                    <span className="font-mono text-xs flex-1 truncate">{inv.token}</span>
                    <span className="capitalize w-20 text-right text-muted-foreground">
                      {inv.role}
                    </span>
                    <span className="tabular-nums w-28 text-right text-muted-foreground">
                      {formatDate(inv.createdAt)}
                    </span>
                    <Button
                      variant="ghost"
                      onClick={() => handleRevoke(inv.token)}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
