/**
 * The Suggestions Inbox rail.
 *
 * Always-visible-when-populated strip below the AdvisoryBanner,
 * above the Gantt. Renders nothing when zero suggestions.
 *
 * Owns the expanded-row state, the per-row Apply/Dismiss
 * lifecycle, and the "+ N more" overflow tail. Visuals per
 * Appendix A of docs/superpowers/plans/2026-05-04-suggestions-inbox.md.
 */
import { useState } from 'react';

import { apiClient } from '../../api/client';
import type { Suggestion } from '../../api/dto';
import { useAppStore } from '../../store/appStore';
import { SuggestionRow } from './SuggestionRow';
import { SuggestionPreview } from './SuggestionPreview';

const VISIBLE_CAP = 3;

export function SuggestionsRail() {
  const suggestions = useAppStore((s) => s.suggestions);
  const config = useAppStore((s) => s.config);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const setSchedule = useAppStore((s) => s.setSchedule);
  const setScheduleVersion = useAppStore((s) => s.setScheduleVersion);
  const setScheduleHistory = useAppStore((s) => s.setScheduleHistory);
  const setConfig = useAppStore((s) => s.setConfig);
  const pushToast = useAppStore((s) => s.pushToast);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  const visible = showAll
    ? suggestions
    : suggestions.slice(0, VISIBLE_CAP);
  const overflow = suggestions.length - VISIBLE_CAP;

  const handleApply = async (s: Suggestion) => {
    setApplyingId(s.id);
    try {
      const r = await apiClient.applySuggestion(s.id);
      setSchedule(r.state.schedule ?? null);
      setScheduleVersion(r.state.scheduleVersion ?? 0);
      setScheduleHistory(r.state.scheduleHistory ?? []);
      if (r.state.config) setConfig(r.state.config);
      setSuggestions(suggestions.filter((x) => x.id !== s.id));
      pushToast({
        level: 'success',
        message: r.historyEntry.summary || 'Applied',
        durationMs: 3000,
      });
    } catch (err: any) {
      // 409 (stale) and 410 (expired) drop the suggestion locally —
      // the next poll will confirm.
      const code = err?.response?.status;
      setSuggestions(suggestions.filter((x) => x.id !== s.id));
      pushToast({
        level: code === 409 ? 'info' : 'error',
        message: code === 409
          ? 'Suggestion was stale, refreshing'
          : err?.message ?? 'Apply failed',
        durationMs: 4000,
      });
    } finally {
      setApplyingId(null);
    }
  };

  const handleDismiss = async (s: Suggestion) => {
    setSuggestions(suggestions.filter((x) => x.id !== s.id));
    if (expandedId === s.id) setExpandedId(null);
    try {
      await apiClient.dismissSuggestion(s.id);
    } catch {
      // best-effort; the next poll will reconcile
    }
  };

  return (
    <section
      role="region"
      aria-label="Pre-computed schedule suggestions"
      className="border-b border-border bg-card"
    >
      <ul className="divide-y divide-border/60">
        {visible.map((s) => (
          <li key={s.id}>
            <SuggestionRow
              suggestion={s}
              expanded={expandedId === s.id}
              applying={applyingId === s.id}
              onToggleExpanded={() =>
                setExpandedId(expandedId === s.id ? null : s.id)
              }
              onApply={() => void handleApply(s)}
              onDismiss={() => void handleDismiss(s)}
            />
            {expandedId === s.id && (
              <SuggestionPreview proposalId={s.proposalId} config={config} />
            )}
          </li>
        ))}
        {!showAll && overflow > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="block w-full px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-muted hover:text-fg hover:bg-bg-subtle"
            >
              + {overflow} more
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
