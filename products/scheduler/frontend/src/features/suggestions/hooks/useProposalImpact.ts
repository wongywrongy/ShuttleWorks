/**
 * Lazy-load the full Impact payload for a proposal.
 *
 * Used by `SuggestionPreview` when a row is expanded. Cancels in-flight
 * loads when the expanded row changes so the wrong impact never lands.
 */
import { useEffect, useState } from 'react';

import { apiClient } from '../../../api/client';
import type { Impact } from '../../../api/dto';

export interface ProposalImpactState {
  impact: Impact | null;
  error: string | null;
}

export function useProposalImpact(proposalId: string): ProposalImpactState {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset on proposalId change so a stale impact never lingers when
    // the operator collapses one row and expands another quickly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImpact(null);
    setError(null);
    apiClient
      .getProposal(proposalId)
      .then((p) => {
        if (!cancelled) setImpact(p.impact);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'load failed');
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  return { impact, error };
}
