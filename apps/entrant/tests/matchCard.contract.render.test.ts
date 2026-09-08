/**
 * Match-card contract §6.1 (package 11): the Gate B fixture matrix driven
 * through the entrant `MatchCard`'s `card` and `bracket-node` variants,
 * asserting the semantic outcomes the contract requires — never identical
 * DOM, never a fixed `offsetHeight`, never "which score is larger".
 *
 * `.ts`, not `.tsx` — this package's vitest include and tsconfig only take
 * `tests/**\/*.ts` (see `components.test.ts`'s note); `createElement`
 * stands in for JSX.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MatchCard } from '../app/components/MatchCard';
import { matchCardFixtures as MC } from './helpers/matchCardFixtures';

const SLUG = 'spring-open';

function renderCard(match: Parameters<typeof MatchCard>[0]['match']) {
  return renderToStaticMarkup(h(MatchCard, { match, slug: SLUG }));
}
function renderNode(match: Parameters<typeof MatchCard>[0]['match']) {
  return renderToStaticMarkup(h(MatchCard, { match, slug: SLUG, variant: 'bracket-node' }));
}

const BANNED = [/^TBD$/, /^–$/, /No players/];

describe('match-card contract — banned placeholder vocabulary (§2.1/§6.1)', () => {
  it.each(Object.entries(MC).filter(([key]) => key !== 'formats'))(
    '%s renders no banned placeholder string',
    (_name, match) => {
      const html = renderCard(match as never);
      for (const pattern of BANNED) expect(html).not.toMatch(pattern);
    },
  );
});

describe('match-card contract — the winner mark (§3.5)', () => {
  it.each(['singlesScheduled', 'unresolvedPredecessor', 'noSchedule', 'liveWithLead', 'bye'] as const)(
    '%s never shows the winner mark while unfinished', (name) => {
      const html = renderCard(MC[name]);
      expect(html).not.toMatch(/Winner: /);
    },
  );

  it.each(['completedLoserWonAGame', 'walkover', 'retirement'] as const)(
    '%s carries the accessible word "Winner" on the winning side', (name) => {
      const html = renderCard(MC[name]);
      expect(html).toMatch(/Winner: /);
    },
  );
});

describe('match-card contract — the ledger (§2.7/§3.4)', () => {
  it('MC-01 (no games) renders no score cell at all', () => {
    const html = renderCard(MC.singlesScheduled);
    expect(html).not.toMatch(/place-items-center/);
  });

  it('MC-07: game 2 (in progress) emphasises neither side', () => {
    const html = renderCard(MC.liveWithLead);
    // Two games recorded; neither side carries the match-winner mark while live.
    expect(html).not.toMatch(/Winner: /);
    expect((html.match(/place-items-center/g) ?? []).length).toBe(4); // 2 games x 2 sides
  });

  it('MC-08: three columns; the losing side still wins the game-2 cell (independent of match winner)', () => {
    const html = renderCard(MC.completedLoserWonAGame);
    expect((html.match(/place-items-center/g) ?? []).length).toBe(6); // 3 games x 2 sides
  });

  it('MC-09 (walkover, no games) collapses the ledger entirely, but still states the winner', () => {
    const html = renderCard(MC.walkover);
    expect(html).not.toMatch(/place-items-center/);
    expect(html).toMatch(/Winner: /);
  });

  it('MC-13: the ledger is never padded to a configured maximum — exactly 1 / 3 / 5 columns', () => {
    expect((renderCard(MC.formats.oneGame).match(/place-items-center/g) ?? []).length).toBe(2);
    expect((renderCard(MC.formats.bestOfThree).match(/place-items-center/g) ?? []).length).toBe(6);
    expect((renderCard(MC.formats.bestOfFive).match(/place-items-center/g) ?? []).length).toBe(10);
  });
});

describe('match-card contract — state and schedule words (§3.3)', () => {
  it('a live match reads "On court", never "Live"', () => {
    const html = renderCard(MC.liveWithLead);
    expect(html).toContain('On court');
    expect(html).not.toContain('>Live<');
  });

  it('a routine live card carries no saturated fill (V3-PE09.4)', () => {
    const html = renderCard(MC.liveWithLead);
    expect(html).not.toContain('bg-status-live');
  });

  it('the public schedule word is exactly "Scheduled" or "Time to be confirmed"', () => {
    expect(renderCard(MC.singlesScheduled)).toContain('10:00');
    expect(renderCard(MC.noSchedule)).toContain('Time to be confirmed');
  });
});

describe('match-card contract — bracket node (§4.3)', () => {
  it('every node carries the SHARED match reference, never a bare "Match n" (V3-PE10.1, §6.1)', () => {
    // public-visual-fixes P3: the same string the operator's match list
    // shows for this match, event code dropped because a draw page has one
    // event. `Match 1` was a per-surface renumbering nobody could quote at
    // the desk, and it is deleted rather than restyled.
    expect(renderNode(MC.singlesScheduled)).toContain('MS R16·1');
    expect(renderNode(MC.unresolvedPredecessor)).toContain('MS R16·5');
    expect(renderNode(MC.singlesScheduled)).not.toContain('Match 1');
  });

  it('an exceptional outcome reads as a LEADING cue, not a second trailing word', () => {
    const html = renderNode(MC.walkover);
    // The cue precedes the reference on the node's one metadata line.
    expect(html).toMatch(/Walkover<\/span>[\s\S]{0,80}MS R16·9|Walkover MS R16·9/);
  });

  it('each side carries its OWN aligned game column, not one shared lane (P1)', () => {
    // **Operator/public remediation P1 supersedes public-visual-fixes P4.**
    // A node is a stacked layout, so the number beside a name belongs to
    // that name: three games x two sides = six cells, and the trailing
    // paired lane (`21–15, 18–21, 21–19` on the node's header line) is gone.
    const html = renderNode(MC.completedLoserWonAGame);
    expect((html.match(/place-items-center/g) ?? []).length).toBe(6);
    // The visible lane is withdrawn; the paired spelling survives ONLY in
    // the card's one accessible summary, which is an `aria-label`.
    expect(html).not.toMatch(/<span class="tabular-nums">21–15, 18–21, 21–19<\/span>/);
    expect(html).toContain('Score 21–15, 18–21, 21–19');
  });

  it('a walkover fabricates no numeric game on the node (rule 6)', () => {
    const html = renderNode(MC.walkover);
    // §5.1 rule 6 / P1 rule 6: an absent score renders nothing. Never 0–0,
    // never a dash, and no score column on either side.
    expect(html).not.toContain('–');
    expect(html).not.toContain('place-items-center');
  });

  it('a not-yet-started node renders no score column at all (P1 rule 7)', () => {
    expect(renderNode(MC.singlesScheduled)).not.toContain('place-items-center');
  });

  it('an unresolved predecessor is an EMPTY slot with a muted feeder line', () => {
    // §6.2 / §4.3 (public-visual-fixes P3): no "Winner of", no node key, no
    // slot index — one muted `from {reference}` line in a slot that keeps a
    // name's own height, so nothing jumps when the result lands.
    const html = renderNode(MC.unresolvedPredecessor);
    expect(html).toContain('from QF1');
    expect(html).not.toContain('Winner of');
    expect(html).toContain('data-feeder-slot');
  });

  it('a bye and a withheld person stay distinct from an unknown feeder', () => {
    // Three different facts, three different renderings: a settled bye, a
    // real person the organizer has not published, and a slot nobody has
    // reached yet. The last is the only muted one.
    expect(renderNode(MC.bye)).not.toContain('data-feeder-slot');
    expect(renderNode(MC.withheldSide)).not.toContain('data-feeder-slot');
    expect(renderNode(MC.bye)).toContain('Bye');
    expect(renderNode(MC.withheldSide)).toContain('Player not published');
  });

  it('a bye side renders "Bye" in the same structure as a name', () => {
    const html = renderNode(MC.bye);
    expect(html).toContain('Bye');
  });

  it('a withheld side renders the fixed dead-reference label, never a raw hole', () => {
    const html = renderNode(MC.withheldSide);
    expect(html).toContain('Player not published');
  });

  it('doubles partners stack one per line, never slash-joined (V3-PE14.1)', () => {
    const html = renderNode(MC.doublesScheduled);
    expect(html).not.toMatch(/Ada Lovelace\s*\/\s*Grace Hopper/);
    expect(html).not.toContain('>/<');
  });

  it('MC-04: a pending pair names the known player AND says the partner is unconfirmed', () => {
    const html = renderNode(MC.incompletePair);
    // The known name is present...
    expect(html).toContain('Ada Lovelace');
    // ...AND the §6.1 phrase, so the side cannot be read as singles.
    expect(html).toContain('partner to be confirmed');
    // Never an invented second person and never a slash-joined pair label.
    expect(html).not.toContain('>/<');
  });

  it('MC-04: the complete pair on the other side gains no pending phrase', () => {
    const html = renderNode(MC.incompletePair);
    expect((html.match(/partner to be confirmed/g) ?? []).length).toBe(2); // one visible line + the aria phrase
  });

  it('long diacritic names survive whole, with no ellipsis or truncate class (MC-03)', () => {
    const html = renderNode(MC.longNamesDoubles);
    expect(html).toContain('Aleksandra Wiśniewska-Kowalczyk');
    expect(html).toContain('Ratchanok Intanon-Wongsuwannakit');
    expect(html).not.toContain('…');
    expect(html).not.toMatch(/\btruncate\b/);
  });
});

describe('match-card contract — accessible summary (§6.1 "versus"/"and")', () => {
  it('joins persons within a side with "and" and sides with "versus"', () => {
    const html = renderNode(MC.doublesScheduled);
    expect(html).toContain('Ada Lovelace and Grace Hopper versus Katherine Johnson and Hedy Lamarr');
  });

  it('an unresolved side folds into the phrase by its label, not a slash join', () => {
    const html = renderNode(MC.unresolvedPredecessor);
    // One spelling, visible and accessible (P3): the phrase says where the
    // side comes from rather than asserting a winner that does not exist.
    expect(html).toContain('Ada Lovelace versus from QF1');
  });

  it('MC-04: the pending partner is a term in the phrase, joined with "and"', () => {
    const html = renderNode(MC.incompletePair);
    expect(html).toContain(
      'Ada Lovelace and partner to be confirmed versus Katherine Johnson and Hedy Lamarr',
    );
  });
});

describe('match-card contract — labels come from the discriminant (§2.1/§6.1)', () => {
  it('a winner_of side is spelled from `unresolved.reference`, not the placeholder prose', () => {
    // Same fixture, placeholder deliberately contradicting the discriminant:
    // the renderer must follow the discriminant.
    const match = {
      ...MC.unresolvedPredecessor,
      sides: [
        MC.unresolvedPredecessor.sides[0],
        { persons: [], placeholder: 'Winner of NONSENSE', winner: false, unresolved: { kind: 'loser_of' as const, reference: 'SF 2' } },
      ] as typeof MC.unresolvedPredecessor.sides,
    };
    const html = renderNode(match);
    // P3: both feeder takes read the same way on the public tier — the
    // structure says which half of SF 2 this side is, the line says where
    // it comes from, and neither claims an outcome nobody has recorded.
    expect(html).toContain('from SF 2');
    expect(html).not.toContain('NONSENSE');
  });

  it('an undetermined side reads "To be decided", never the wire\'s legacy TBD', () => {
    const match = {
      ...MC.unresolvedPredecessor,
      sides: [
        MC.unresolvedPredecessor.sides[0],
        { persons: [], placeholder: 'TBD', winner: false, unresolved: { kind: 'undetermined' as const } },
      ] as typeof MC.unresolvedPredecessor.sides,
    };
    const html = renderNode(match);
    expect(html).toContain('To be decided');
    expect(html).not.toMatch(/>TBD</);
  });
});

describe('operator/public parity — the approved schedule wins (P7)', () => {
  // The imported source record (`localTime` / `courtLabel`) says where a
  // match was ORIGINALLY played. Once Operations approves a slot and a
  // court, those are the published schedule, and the public card must state
  // them: preferring the source record published "Court 8 / 10:00" on the
  // draw while the operator console and the public schedule both said
  // "Court 1 / 13:00" for the same live match.
  const rescheduled = {
    ...MC.liveWithLead,
    scheduledTime: '13:00',
    court: 1,
    localTime: '10:00',
    courtLabel: 'Court 8',
  };

  it('states the approved court, not the source record\'s court label', () => {
    const html = renderCard(rescheduled);
    expect(html).toContain('Court 1');
    expect(html).not.toContain('Court 8');
  });

  it('states the approved slot time, not the source record\'s clock', () => {
    const html = renderCard(rescheduled);
    expect(html).toContain('13:00');
    expect(html).not.toContain('10:00');
  });

  it('still falls back to the source record when nothing is approved', () => {
    const html = renderCard({
      ...MC.completedLoserWonAGame,
      scheduledTime: null,
      court: null,
      localTime: '10:00',
      courtLabel: 'Court 8',
    });
    expect(html).toContain('Court 8');
    expect(html).toContain('10:00');
  });
});
