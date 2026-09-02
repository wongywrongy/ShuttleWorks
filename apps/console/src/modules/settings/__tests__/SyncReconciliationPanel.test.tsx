import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncReconciliationPanel } from '../SyncReconciliationPanel';
import { useSyncQuarantine } from '../../../hooks/useSyncQuarantine';

vi.mock('../../../hooks/useSyncQuarantine', () => ({ useSyncQuarantine: vi.fn() }));

const resolve = vi.fn();
const loadCandidates = vi.fn();
const setIncludeResolved = vi.fn();
const authority = {
  tournament_id: 't1',
  node_id: 'node-1',
  authority_epoch: 4,
  state: 'active' as const,
  checkpoint_hash: 'hash',
  highest_contiguous_sequence: 8,
  pending_operations: 1,
  oldest_pending_at: null,
  blocked_operations: 0,
  last_blocked_error_code: null,
};
const record = {
  id: 'q1',
  tournament_id: 't1',
  node_id: 'node-1',
  authority_epoch: 4,
  operation_id: 'operation-1',
  reason_code: 'sequence_gap',
  detail: { sequence: 3, expectedSequence: 2 },
  status: 'open',
  created_at: '2026-09-01T10:00:00Z',
  resolved_at: null,
  resolved_by: null,
  resolution_operation_id: null,
  resolution_note: null,
};

beforeEach(() => {
  resolve.mockReset().mockResolvedValue(undefined);
  setIncludeResolved.mockReset();
  vi.mocked(useSyncQuarantine).mockReturnValue({
    items: [record],
    includeResolved: false,
    setIncludeResolved,
    loading: false,
    error: null,
    busyId: null,
    candidateLoadingId: null,
    candidates: {
      q1: [{
        operation_id: '11111111-1111-4111-8111-111111111111',
        sequence: 8,
        command_type: 'match.record_result.v3',
        aggregate_type: 'bracket_match',
        aggregate_id: 'm8',
        accepted_at_node: '2026-09-01T10:02:00Z',
      }],
    },
    refresh: vi.fn(),
    loadCandidates,
    resolve,
  });
});

describe('SyncReconciliationPanel', () => {
  it('shows durable failure evidence and requires reason plus confirmation', async () => {
    render(<SyncReconciliationPanel authority={authority} />);
    expect(screen.getByRole('heading', { name: 'Reconciliation evidence' })).toBeInTheDocument();
    expect(screen.getByTestId('quarantine-q1')).toHaveTextContent('sequence_gap');
    expect(screen.getByTestId('quarantine-q1')).toHaveTextContent('seq 3 · expected 2');

    fireEvent.click(screen.getByRole('button', { name: /prepare correction/i }));
    fireEvent.click(screen.getByRole('button', { name: /record correction/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/operator reason/i);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('submits an audited correction only after explicit confirmation', async () => {
    render(<SyncReconciliationPanel authority={authority} />);
    fireEvent.click(screen.getByRole('button', { name: /prepare correction/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Operator reason' }), {
      target: { value: 'Reviewed the missing sequence and corrected the score.' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Acknowledged correction operation' }), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /linked correction was applied onsite/i }));
    fireEvent.click(screen.getByRole('button', { name: /record correction/i }));
    await waitFor(() => expect(resolve).toHaveBeenCalledWith('q1', {
      reason: 'Reviewed the missing sequence and corrected the score.',
      correction_operation_id: '11111111-1111-4111-8111-111111111111',
    }));
  });

  it('can include resolved evidence without making it look actionable', () => {
    const resolved = { ...record, status: 'resolved', resolution_note: 'Corrected' };
    vi.mocked(useSyncQuarantine).mockReturnValue({
      items: [resolved],
      includeResolved: true,
      setIncludeResolved,
      loading: false,
      error: null,
      busyId: null,
      candidateLoadingId: null,
      candidates: {},
      refresh: vi.fn(),
      loadCandidates,
      resolve,
    });
    render(<SyncReconciliationPanel authority={authority} />);
    expect(screen.getByTestId('quarantine-q1')).toHaveTextContent('resolved');
    expect(screen.getByTestId('quarantine-q1')).toHaveTextContent('Corrected');
    expect(within(screen.getByTestId('quarantine-q1')).queryByRole('button', { name: /prepare correction/i })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /show resolved/i }));
    expect(setIncludeResolved).toHaveBeenCalledWith(false);
  });
});
