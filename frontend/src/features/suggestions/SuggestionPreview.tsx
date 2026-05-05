/**
 * Inline diff for an expanded suggestion row.
 *
 * Lazy-fetches the full Impact via GET /schedule/proposals/{id}.
 * Reuses ScheduleDiffView. Indented under the row so the row's
 * Apply button stays visible at the top.
 */
import { useEffect, useState } from 'react';

import type { Impact, TournamentConfig } from '../../api/dto';
import { apiClient } from '../../api/client';
import { ScheduleDiffView } from '../schedule/ScheduleDiffView';
import { formatSlotTime } from '../../lib/time';

interface Props {
  proposalId: string;
  config: TournamentConfig | null;
}

export function SuggestionPreview({ proposalId, config }: Props) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.getProposal(proposalId)
      .then((p) => { if (!cancelled) setImpact(p.impact); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'load failed'); });
    return () => { cancelled = true; };
  }, [proposalId]);

  const formatSlot = (slotId: number | null | undefined): string => {
    if (slotId == null) return '—';
    if (!config) return `slot ${slotId}`;
    return formatSlotTime(slotId, config);
  };

  return (
    <div className="border-t border-border/40 bg-bg-subtle/40 px-3 py-2 pl-12">
      {error && (
        <div className="text-xs text-fg-muted">Could not load preview: {error}</div>
      )}
      {!impact && !error && (
        <div className="text-xs text-fg-muted">Loading preview...</div>
      )}
      {impact && (
        <ScheduleDiffView impact={impact} formatSlot={formatSlot} />
      )}
    </div>
  );
}
