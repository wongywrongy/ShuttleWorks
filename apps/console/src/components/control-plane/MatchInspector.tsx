/**
 * MatchInspector — the console's one single-match detail component.
 *
 * F-UNI-11..18: callers adapt their engine data into one stored-data model
 * and supply context-authorized controls as slots. The inspector owns field
 * order, facets, status treatment and DetailPanel chrome; it never imports an
 * engine module or reads a store.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { MatchIdentity } from '../../platform/domain/matchIdentity';
import { formatMatchIdentity } from '../../platform/domain/matchIdentity';
import { DetailPanel } from './DetailPanel';
import { ActiveChoice } from '../ActiveChoice';

export type MatchInspectorFacet = 'summary' | 'assignment' | 'result';

export interface MatchInspectorModel {
  key: string;
  id: string;
  identity: MatchIdentity;
  /** Plain operator vocabulary: Ready, Called, Live, Finished, etc. */
  status: string;
  sideA: string;
  sideB: string;
  assignment?: {
    court?: string | number | null;
    planned?: string | null;
    actualStart?: string | null;
    actualEnd?: string | null;
  };
  result?: {
    summary?: string | null;
    sets?: readonly { sideA: number; sideB: number }[];
  } | null;
  /** Exceptional state only; normal state stays visually quiet (X6). */
  conflicts?: readonly string[];
}

export interface MatchInspectorSlots {
  /** Optional replacement for the standard two-side presentation. */
  players?: ReactNode;
  summary?: ReactNode;
  assignment?: ReactNode;
  result?: ReactNode;
}

export interface MatchInspectorProps {
  match: MatchInspectorModel;
  defaultFacet: MatchInspectorFacet;
  onClose(): void;
  /** Module-owned controls/content. The shared inspector never imports them. */
  supplements?: MatchInspectorSlots;
  actions?: MatchInspectorSlots;
  testId?: string;
}

const FACETS: readonly { id: MatchInspectorFacet; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'result', label: 'Result' },
];

function Fact({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2 ${last ? '' : 'border-b border-rule-soft'}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <DetailPanel.Section eyebrow="Actions">{children}</DetailPanel.Section>;
}

export function MatchInspector({
  match,
  defaultFacet,
  onClose,
  supplements,
  actions,
  testId = 'match-inspector',
}: MatchInspectorProps) {
  const [facet, setFacet] = useState<MatchInspectorFacet>(defaultFacet);

  // Local invocation state only (R-UNI-4). A new subject/context opens on the
  // caller's ruled default; background refreshes keep the operator's facet.
  useEffect(() => setFacet(defaultFacet), [match.key, defaultFacet]);

  const identity = formatMatchIdentity(match.identity, match.id);
  const assignment = match.assignment;
  const result = match.result;

  return (
    <DetailPanel
      label="Match"
      value={identity}
      mono
      onClose={onClose}
      testId={testId}
    >
      <div
        role="tablist"
        aria-label="Match detail"
        className="grid grid-cols-3 border-b border-border bg-surface-band/40 p-1"
      >
        {FACETS.map((item) => {
          const selected = facet === item.id;
          return (
            <ActiveChoice
              key={item.id}
              active={selected}
              geometry="segment"
              semantics="tab"
              data-testid={`${testId}-facet-${item.id}`}
              onClick={() => setFacet(item.id)}
              className="min-h-8 px-2 py-0 text-xs"
            >
              {item.label}
            </ActiveChoice>
          );
        })}
      </div>

      {/* X6: status is a plain line, not a STATUS card or default-state pill. */}
      <p data-testid={`${testId}-status`} className="border-b border-border px-4 py-2 text-sm text-foreground">
        {match.status}
      </p>

      {facet === 'summary' ? (
        <div role="tabpanel" data-testid={`${testId}-panel-summary`}>
          {match.conflicts && match.conflicts.length > 0 ? (
            <div role="alert" className="mx-4 mt-3 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {match.conflicts.map((conflict) => <p key={conflict}>{conflict}</p>)}
            </div>
          ) : null}
          <DetailPanel.Section eyebrow="Players">
            {supplements?.players ?? (
              <div className="space-y-1">
                <div className="text-sm text-foreground">{match.sideA}</div>
                <div className="text-3xs uppercase tracking-[0.08em] text-muted-foreground">vs</div>
                <div className="text-sm text-foreground">{match.sideB}</div>
              </div>
            )}
          </DetailPanel.Section>
          {supplements?.summary}
          <Actions>{actions?.summary}</Actions>
        </div>
      ) : null}

      {facet === 'assignment' ? (
        <div role="tabpanel" data-testid={`${testId}-panel-assignment`}>
          <DetailPanel.Section eyebrow="Assignment">
            <dl>
              <Fact label="Court" value={assignment?.court != null ? String(assignment.court) : 'Not assigned'} />
              <Fact label="Planned" value={assignment?.planned || 'Not planned'} />
              {assignment?.actualStart ? <Fact label="Started" value={assignment.actualStart} /> : null}
              {assignment?.actualEnd ? <Fact label="Finished" value={assignment.actualEnd} last /> : null}
            </dl>
          </DetailPanel.Section>
          {supplements?.assignment}
          <Actions>{actions?.assignment}</Actions>
        </div>
      ) : null}

      {facet === 'result' ? (
        <div role="tabpanel" data-testid={`${testId}-panel-result`}>
          <DetailPanel.Section eyebrow="Result">
            {result?.summary ? <p className="text-sm text-foreground">{result.summary}</p> : null}
            {result?.sets && result.sets.length > 0 ? (
              <p className="mt-1 font-mono text-sm tabular-nums text-foreground">
                {result.sets.map((set) => `${set.sideA}–${set.sideB}`).join(', ')}
              </p>
            ) : null}
            {!result?.summary && (!result?.sets || result.sets.length === 0) ? (
              <p className="text-sm text-muted-foreground">No result recorded.</p>
            ) : null}
          </DetailPanel.Section>
          {supplements?.result}
          <Actions>{actions?.result}</Actions>
        </div>
      ) : null}
    </DetailPanel>
  );
}
