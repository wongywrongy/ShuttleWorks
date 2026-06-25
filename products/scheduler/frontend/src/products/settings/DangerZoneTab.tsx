import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@scheduler/design-system';
import { Eyebrow } from '../../components/control-plane';
import { apiClient } from '../../api/client';
import type { TournamentSummaryDTO } from '../../api/dto';

/** Archive / delete the workspace. Delete is irreversible and confirmed. */
export function DangerZoneTab({
  tid,
  summary,
  onChanged,
}: {
  tid: string;
  summary: TournamentSummaryDTO | null;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const isBracket = summary?.kind === 'bracket';

  async function archive() {
    setBusy(true);
    try {
      await apiClient.updateTournament(tid, { status: 'archived' });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await apiClient.deleteTournament(tid);
      navigate('/');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 p-6">
      <div>
        <Eyebrow framed tone="destructive">DANGER ZONE</Eyebrow>
        <h2 className="mt-1 text-base font-semibold text-foreground">Archive or delete</h2>
      </div>

      <div className="flex items-center justify-between gap-4 rounded border border-border p-4">
        <div>
          <div className="text-sm font-medium text-foreground">Archive workspace</div>
          <div className="text-xs text-muted-foreground">
            Hide it from the active list. You can reactivate later from General.
          </div>
        </div>
        <Button variant="ghost" onClick={archive} disabled={busy || summary?.status === 'archived'}>
          {summary?.status === 'archived' ? 'Archived' : 'Archive'}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 rounded border border-destructive/30 bg-destructive/5 p-4">
        <div>
          <div className="text-sm font-medium text-foreground">Delete workspace</div>
          <div className="text-xs text-muted-foreground">
            Permanently removes the workspace, its members, invites, and all data.
            Can&rsquo;t be undone.
          </div>
        </div>
        <Button variant="destructive" onClick={() => setConfirming(true)} disabled={busy}>
          Delete
        </Button>
      </div>

      {confirming && (
        <Modal onClose={() => !busy && setConfirming(false)} titleId="ws-delete-heading">
          <div className="p-6">
            <h2 id="ws-delete-heading" className="text-base font-semibold text-foreground">
              Delete &ldquo;{summary?.name || 'Untitled'}&rdquo;?
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              This permanently removes the {isBracket ? 'tournament' : 'meet'}, its members,
              invites, and all data. Can&rsquo;t be undone.
            </p>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={del} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
