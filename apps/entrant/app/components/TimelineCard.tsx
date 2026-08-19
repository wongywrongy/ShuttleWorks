/**
 * The Overview timeline (Z9): entries open → close → withdrawal deadline →
 * tournament date as a vertical `<ol>`, with the current position marked in
 * TEXT ("You are here"), never colour alone. The model arrives pre-computed
 * (`timelineModel`, `lib/phase.ts`): absent moments are omitted — no "TBD"
 * placeholders (rule 4) — and per-event disagreement renders as a variance
 * line pointing at the Events tab rather than a false single moment.
 */
import { Fragment } from 'react';

import { formatDateLong, formatMoment, formatUtcInstant } from '../lib/format';
import type { TimelineMoment } from '../lib/phase';
import { SectionCard } from './SectionCard';

function Marker({ now }: { now: Date }) {
  return (
    <li className="relative text-sm font-medium text-accent" aria-current="date">
      <span
        aria-hidden
        className="absolute -start-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-accent"
      />
      You are here · {formatUtcInstant(now)}
    </li>
  );
}

export function TimelineCard({
  moments,
  now,
  eventsHref,
}: {
  moments: readonly TimelineMoment[];
  now: Date;
  eventsHref: string;
}) {
  const currentAt = moments.findIndex((m) => m.state === 'current');
  const firstFuture = moments.findIndex((m) => m.state === 'future');
  // Where the standalone "you are here" row goes when no moment straddles
  // now: before the first future moment, or at the very end if all are past.
  const insertAt = currentAt !== -1 ? -1 : firstFuture !== -1 ? firstFuture : moments.length;

  return (
    <SectionCard title="Key dates">
      <ol className="relative ms-1.5 grid gap-4 border-s border-rule-control ps-5">
        {moments.map((moment, index) => (
          <Fragment key={moment.label}>
            {index === insertAt ? <Marker now={now} /> : null}
            <li className="relative">
              <span
                aria-hidden
                className={`absolute -start-[1.42rem] top-1.5 h-2 w-2 rounded-full ${
                  moment.state === 'past'
                    ? 'bg-rule-strong'
                    : 'border border-rule-strong bg-surface-raised'
                }`}
              />
              <p className="text-sm font-medium text-foreground">
                {moment.label}
                {moment.state === 'current' ? (
                  <span className="ml-2 font-medium text-accent">← you are here</span>
                ) : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {moment.variance === 'per-event' ? (
                  <>
                    Varies by event: see{' '}
                    <a href={eventsHref} className="text-accent underline-offset-4 hover:underline">
                      Events
                    </a>
                  </>
                ) : moment.label === 'Tournament' ? (
                  formatDateLong(moment.at)
                ) : (
                  formatMoment(moment.at!)
                )}
              </p>
            </li>
          </Fragment>
        ))}
        {insertAt === moments.length ? <Marker now={now} /> : null}
      </ol>
    </SectionCard>
  );
}
