/**
 * X6 property test (SP-CONSOLE-3): containers are reserved for exceptional
 * states. In the match-list vocabulary only LIVE may render a chip;
 * READY / PENDING / DONE-fallback must be plain text.
 *
 * Asserts the RENDERED DOM, not just the exported map — flipping a text
 * state to 'chip' in STATUS_TREATMENT changes what renders, so the DOM
 * assertions fail (negative-control run recorded in the SP-CONSOLE-3
 * ledger).
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  MatchStatus,
  STATUS_LABEL,
  STATUS_TREATMENT,
  type MatchListStatus,
} from '../matchStatus';

const ALL: MatchListStatus[] = ['done', 'live', 'ready', 'pending'];

/** A chip is a bordered, tinted container — its signature is the
 *  `bg-status-*` fill class the StatusPill tone tables emit. */
const chipIn = (container: HTMLElement) =>
  container.querySelector('[class*="bg-status-"]');

describe('X6 status ink budget — MatchStatus', () => {
  it('covers the whole vocabulary', () => {
    expect(Object.keys(STATUS_TREATMENT).sort()).toEqual([...ALL].sort());
  });

  it.each(['ready', 'pending', 'done'] as const)(
    '%s renders as plain text — no container',
    (status) => {
      const { container } = render(<MatchStatus status={status} />);
      expect(container).toHaveTextContent(STATUS_LABEL[status]);
      expect(chipIn(container)).toBeNull();
    },
  );

  it('live renders as a chip with a dot — the only routine container', () => {
    const { container } = render(<MatchStatus status="live" />);
    expect(container).toHaveTextContent(STATUS_LABEL.live);
    const chip = chipIn(container);
    expect(chip).not.toBeNull();
    // The leading swatch dot — LIVE must be findable at scan speed.
    expect(chip!.querySelector('[class*="rounded-full"]')).not.toBeNull();
  });
});
