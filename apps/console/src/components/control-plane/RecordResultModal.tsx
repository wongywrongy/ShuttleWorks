/**
 * RecordResultModal — the bounded "record one result" transaction (plan D8).
 *
 * The bracket canvas used to expand a score form INSIDE the node, which grew
 * the card over the next node and left the operator typing into a form drawn
 * on top of another match (defect C12). A result is a bounded transaction
 * with a clear finish, so it belongs in a dialog: the canvas keeps its pan
 * position and its selected node, the dialog owns focus, and dismissing it
 * returns focus to the control that opened it (`Modal` restores it).
 *
 * The body is the shared `ResultEntryForm`, so the dialog, the match lists
 * and Operations' inline Live rail are literally the same editor.
 */
import { useId } from 'react';
import { Modal } from '../common/Modal';

import { EYEBROW_CLASS } from '../../lib/utils';
import { ResultEntryForm, type ResultEntryFormProps } from './ResultEntryForm';

export interface RecordResultModalProps extends ResultEntryFormProps {
  /** The match's own identifier — "MS QF1", never a UUID. */
  matchReference: string;
  /** Court/time or round context, when the surface has it. */
  matchContext?: string | null;
  /** Correcting a result that already exists. */
  correction?: boolean;
}

export function RecordResultModal({
  matchReference,
  matchContext = null,
  correction = false,
  ...formProps
}: RecordResultModalProps) {
  const titleId = useId();
  return (
    <Modal onClose={formProps.onCancel} titleId={titleId} widthClass="max-w-md">
      <div className="border-b border-border px-4 py-3">
        <h2 id={titleId} className={`${EYEBROW_CLASS} text-muted-foreground`}>
          {correction ? 'Correct result' : 'Record result'}
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-foreground sw-num">
          {matchReference}
        </p>
        {matchContext ? (
          <p className="text-xs text-muted-foreground">{matchContext}</p>
        ) : null}
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
        {correction ? (
          <p className="mb-3 text-xs text-status-warning">
            This match already has a result. A correction updates verified downstream feeders.
            It is refused if a downstream match has started, has a result, or its original topology cannot be verified.
          </p>
        ) : null}
        <ResultEntryForm
          {...formProps}
          submitLabel={formProps.submitLabel ?? (correction ? 'Save correction' : 'Save result')}
        />
      </div>
    </Modal>
  );
}
