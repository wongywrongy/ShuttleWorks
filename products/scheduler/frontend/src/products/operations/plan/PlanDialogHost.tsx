/**
 * PlanDialogHost — the single mount for every Plan schedule-mutation
 * dialog (SP-CONSOLE-4 B1). Three openers route here through one
 * `PlanDialog` value: the toolbar's buttons, the advisory banner's
 * Review, and the detail rail's "Move or postpone…".
 *
 * Each dialog is conditionally mounted with a fresh instance per open, so
 * prefills (a court-closed report from the closed-courts strip, a repair
 * from an advisory's match) land in the dialog's initial state instead of
 * being ignored by a long-lived instance. Closing DISCARDS any in-flight
 * proposal — the legacy Director host's rule, applied uniformly: the next
 * dialog must not open onto a stale preview from an abandoned action.
 */
import { useProposals } from '../../../hooks/useProposals';
import { Modal } from '../../../components/common/Modal';
import { INTERACTIVE_BASE } from '../../../lib/utils';
import { DisruptionDialog } from './DisruptionDialog';
import { DirectorToolsPanel } from './DirectorToolsPanel';
import { WarmRestartDialog } from './WarmRestartDialog';
import { MoveMatchDialog } from './MoveMatchDialog';
import type { PlanDialog } from './planDialogs';

export function PlanDialogHost({
  dialog,
  onClose,
}: {
  dialog: PlanDialog | null;
  onClose: () => void;
}) {
  const { cancel } = useProposals();
  const close = () => {
    void cancel(); // best-effort: clears any in-flight proposal preview
    onClose();
  };

  if (!dialog) return null;

  if (dialog.kind === 'disruption') {
    return (
      <DisruptionDialog
        isOpen
        onClose={close}
        initialType={dialog.prefill?.type}
        initialMatchId={dialog.prefill?.matchId}
        initialCourtId={dialog.prefill?.courtId}
      />
    );
  }

  if (dialog.kind === 'director') {
    return (
      <Modal onClose={close} titleId="director-tools-title" widthClass="max-w-lg">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 id="director-tools-title" className="text-sm font-semibold">
            Director tools
          </h2>
          <button
            type="button"
            onClick={close}
            className={`${INTERACTIVE_BASE} rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground`}
            aria-label="Close director tools"
          >
            ×
          </button>
        </div>
        <div className="max-h-[calc(80vh-3rem)] overflow-y-auto">
          <DirectorToolsPanel />
        </div>
      </Modal>
    );
  }

  if (dialog.kind === 'warm-restart') {
    return <WarmRestartDialog isOpen onClose={close} />;
  }

  return <MoveMatchDialog isOpen onClose={close} matchId={dialog.matchId} />;
}
